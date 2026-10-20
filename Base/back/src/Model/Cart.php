<?php

declare(strict_types=1);

namespace App\Model;

use InvalidArgumentException;

/**
 * Panier d'achat (US CMD-b), conservé en session côté serveur.
 *
 * Le panier ne retient que des identifiants de variante et des quantités :
 * { variantId => quantité }. Le nom et le prix sont toujours relus en base au
 * moment de l'affichage, jamais confiés au client.
 *
 * Toute modification passe par une méthode qui valide ses paramètres : une
 * quantité invalide lève une InvalidArgumentException, dont le message est
 * destiné à l'utilisateur.
 */
final class Cart
{
    /** Nombre maximal d'exemplaires d'un même bijou dans une réservation. */
    public const MAX_QUANTITY = 10;

    /** @var array<int, int> Quantité réservée, indexée par identifiant de variante. */
    private array $items = [];

    /**
     * Reconstruit le panier depuis la session.
     *
     * La session est relue sans confiance : toute entrée mal formée est écartée.
     *
     * @param array<mixed, mixed> $items Contenu brut de $_SESSION['panier'].
     */
    public function __construct(array $items)
    {
        $variantIds = array_keys($items);

        for ($i = 0; $i < count($variantIds); $i++) {
            $variantId = $variantIds[$i];
            $quantity  = $items[$variantId];

            if (is_int($variantId) && $variantId > 0
                && is_int($quantity) && $quantity >= 1 && $quantity <= self::MAX_QUANTITY) {
                $this->items[$variantId] = $quantity;
            }
        }
    }

    /**
     * Ajoute des exemplaires d'une variante, en plus de ceux déjà réservés.
     *
     * @param int $variantId Variante existante (vérifiée par le contrôleur).
     * @param int $quantity  Nombre d'exemplaires à ajouter, au moins 1.
     * @param int $stock     Exemplaires en stock pour cette variante (STK-c).
     * @return self
     * @throws InvalidArgumentException Si la quantité est invalide ou dépasse le maximum.
     * @throws StockException           Si le total dépasse le stock.
     */
    public function add(int $variantId, int $quantity, int $stock): self
    {
        if ($quantity < 1) {
            throw new InvalidArgumentException('La quantité doit être d\'au moins 1.');
        }

        return $this->setQuantity($variantId, $this->quantityOf($variantId) + $quantity, $stock);
    }

    /**
     * Fixe la quantité d'une variante ; 0 la retire du panier.
     *
     * Une hausse au-delà du stock est refusée. Une baisse est toujours
     * acceptée : un client dont la ligne dépasse un stock qui a diminué doit
     * pouvoir la corriger pas à pas.
     *
     * @param int $variantId Identifiant de la variante.
     * @param int $quantity  Nouvelle quantité, de 0 à MAX_QUANTITY.
     * @param int $stock     Exemplaires en stock pour cette variante (STK-c).
     * @return self
     * @throws InvalidArgumentException Si la quantité est négative ou dépasse le maximum.
     * @throws StockException           Si la hausse dépasse le stock.
     */
    public function setQuantity(int $variantId, int $quantity, int $stock): self
    {
        if ($quantity < 0) {
            throw new InvalidArgumentException('La quantité ne peut pas être négative.');
        }
        if ($quantity > self::MAX_QUANTITY) {
            throw new InvalidArgumentException(
                'Vous ne pouvez pas réserver plus de ' . self::MAX_QUANTITY . ' exemplaires d\'un même bijou.'
            );
        }
        if ($quantity > $this->quantityOf($variantId) && $quantity > $stock) {
            throw new StockException(self::stockMessage($stock));
        }

        if ($quantity === 0) {
            return $this->remove($variantId);
        }

        $this->items[$variantId] = $quantity;
        return $this;
    }

    /**
     * Message affiché quand une quantité dépasse le stock.
     *
     * @param int $stock Exemplaires en stock.
     * @return string
     */
    public static function stockMessage(int $stock): string
    {
        if ($stock <= 0) {
            return 'Ce bijou est épuisé.';
        }

        return $stock === 1
            ? 'Il ne reste qu\'un exemplaire de ce bijou.'
            : 'Il ne reste que ' . $stock . ' exemplaires de ce bijou.';
    }

    /**
     * Retire une variante du panier (sans effet si elle n'y est pas).
     *
     * @param int $variantId Identifiant de la variante.
     * @return self
     */
    public function remove(int $variantId): self
    {
        unset($this->items[$variantId]);
        return $this;
    }

    /**
     * Ne garde que les variantes données : celles qui n'existent plus en base
     * disparaissent du panier.
     *
     * @param array<int, int> $variantIds Identifiants encore valides.
     * @return self
     */
    public function keepOnly(array $variantIds): self
    {
        $this->items = array_intersect_key($this->items, array_flip($variantIds));
        return $this;
    }

    /**
     * Quantité réservée d'une variante, 0 si elle n'est pas dans le panier.
     *
     * @param int $variantId Identifiant de la variante.
     * @return int
     */
    public function quantityOf(int $variantId): int
    {
        return $this->items[$variantId] ?? 0;
    }

    /**
     * Identifiants des variantes du panier, dans l'ordre d'ajout.
     *
     * @return array<int, int>
     */
    public function variantIds(): array
    {
        return array_keys($this->items);
    }

    /**
     * Le panier au format de la session.
     *
     * @return array<int, int> { variantId => quantité }
     */
    public function toArray(): array
    {
        return $this->items;
    }

    /**
     * Lignes, nombre d'articles et total, calculés à partir des prix en base.
     *
     * Chaque ligne indique si sa quantité dépasse le stock actuel
     * (depasseStock) ; le panier n'est réservable que si aucune ne le dépasse
     * (STK-c).
     *
     * @param array<int, array<string, mixed>> $variants Variantes du panier,
     *        indexées par identifiant (voir VariantModel::findForCart()).
     * @return array{lignes: array<int, array<string, mixed>>, nombreArticles: int, total: int, estReservable: bool}
     */
    public function summarize(array $variants): array
    {
        $lines      = [];
        $itemCount  = 0;
        $total      = 0;
        $isBookable = true;
        $variantIds = $this->variantIds();

        for ($i = 0; $i < count($variantIds); $i++) {
            $variantId = $variantIds[$i];

            if (!isset($variants[$variantId])) {
                continue;
            }

            $variant  = $variants[$variantId];
            $quantity = $this->items[$variantId];
            $subtotal = $variant['prixUnitaire'] * $quantity;

            $exceedsStock = $quantity > $variant['stock'];

            $lines[] = $variant + [
                'quantite'     => $quantity,
                'sousTotal'    => $subtotal,
                'depasseStock' => $exceedsStock,
            ];

            $itemCount += $quantity;
            $total     += $subtotal;
            $isBookable = $isBookable && !$exceedsStock;
        }

        return [
            'lignes'         => $lines,
            'nombreArticles' => $itemCount,
            'total'          => $total,
            'estReservable'  => $isBookable && count($lines) > 0,
        ];
    }
}
