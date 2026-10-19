<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\Cart;
use App\Model\VariantModel;
use InvalidArgumentException;

/**
 * Panier d'achat (US CMD-b).
 *
 * Le panier vit dans la session PHP, sous la clé « panier ». Chaque route
 * renvoie le panier complet, recalculé à partir de la base :
 * { lignes: [{ variantId, libelle, prixUnitaire, quantite, sousTotal,
 *              produit: { nom, slug, image } }],
 *   nombreArticles, total }
 */
final class CartController
{
    /** Clé du panier dans $_SESSION. */
    private const SESSION_KEY = 'panier';

    /** Le modèle qui interroge les variantes, fourni à la construction. */
    private VariantModel $variants;

    /**
     * @param VariantModel $variants Modèle des variantes.
     */
    public function __construct(VariantModel $variants)
    {
        $this->variants = $variants;
    }

    /**
     * GET /api/panier : le contenu du panier.
     */
    public function show(): void
    {
        $this->respond($this->loadCart());
    }

    /**
     * POST /api/panier/ajouter : { variantId, quantite? } (quantite vaut 1 par défaut).
     *
     * Erreurs : 400 si les données sont invalides ou dépassent le maximum,
     * 404 si la variante n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function add(Request $request): void
    {
        $body      = $request->corps();
        $variantId = self::readInt($body, 'variantId');
        $quantity  = array_key_exists('quantite', $body) ? self::readInt($body, 'quantite') : 1;

        if ($variantId === null || $quantity === null) {
            Response::erreur('Requête invalide : variantId et quantite doivent être des entiers.', 400);
            return;
        }

        if (!$this->variants->exists($variantId)) {
            Response::erreur('Ce bijou n\'est plus proposé.', 404);
            return;
        }

        $cart = $this->loadCart();
        $this->apply(function () use ($cart, $variantId, $quantity): void {
            $cart->add($variantId, $quantity);
        });

        $this->respond($cart);
    }

    /**
     * POST /api/panier/modifier : { variantId, quantite } (0 retire la ligne).
     *
     * Erreurs : 400 si les données sont invalides, 404 si la variante n'est
     * pas dans le panier.
     *
     * @param Request $request Requête entrante.
     */
    public function update(Request $request): void
    {
        $body      = $request->corps();
        $variantId = self::readInt($body, 'variantId');
        $quantity  = self::readInt($body, 'quantite');

        if ($variantId === null || $quantity === null) {
            Response::erreur('Requête invalide : variantId et quantite doivent être des entiers.', 400);
            return;
        }

        $cart = $this->loadCart();

        if ($cart->quantityOf($variantId) === 0) {
            Response::erreur('Ce bijou n\'est pas dans votre panier.', 404);
            return;
        }

        $this->apply(function () use ($cart, $variantId, $quantity): void {
            $cart->setQuantity($variantId, $quantity);
        });

        $this->respond($cart);
    }

    /**
     * POST /api/panier/retirer : { variantId }.
     *
     * Erreur : 400 si variantId est invalide. Retirer un bijou absent du
     * panier n'est pas une erreur : le résultat voulu est déjà atteint.
     *
     * @param Request $request Requête entrante.
     */
    public function remove(Request $request): void
    {
        $variantId = self::readInt($request->corps(), 'variantId');

        if ($variantId === null) {
            Response::erreur('Requête invalide : variantId doit être un entier.', 400);
            return;
        }

        $cart = $this->loadCart();
        $cart->remove($variantId);

        $this->respond($cart);
    }

    /**
     * Le panier de la session, ou un panier vide.
     *
     * @return Cart
     */
    private function loadCart(): Cart
    {
        $items = $_SESSION[self::SESSION_KEY] ?? [];

        return new Cart(is_array($items) ? $items : []);
    }

    /**
     * Exécute une modification du panier ; une règle non respectée devient
     * une erreur 400, avec le message prévu pour l'utilisateur.
     *
     * @param callable $change Modification à appliquer.
     */
    private function apply(callable $change): void
    {
        try {
            $change();
        } catch (InvalidArgumentException $e) {
            Response::erreur($e->getMessage(), 400);
        }
    }

    /**
     * Relit les variantes en base, écarte celles qui n'existent plus,
     * enregistre le panier en session et l'envoie.
     *
     * @param Cart $cart Panier à envoyer.
     */
    private function respond(Cart $cart): void
    {
        $variants = $this->variants->findForCart($cart->variantIds());
        $cart->keepOnly(array_keys($variants));

        $_SESSION[self::SESSION_KEY] = $cart->toArray();

        Response::json($cart->summarize($variants));
    }

    /**
     * Lit un entier positif ou nul dans le corps JSON : un nombre entier, ou
     * une chaîne de chiffres. Toute autre valeur donne null.
     *
     * @param array<string, mixed> $body Corps JSON décodé.
     * @param string               $key  Nom du champ.
     * @return int|null
     */
    private static function readInt(array $body, string $key): ?int
    {
        $value = $body[$key] ?? null;

        if (is_int($value) && $value >= 0) {
            return $value;
        }
        if (is_string($value) && preg_match('/^\d{1,6}$/', $value) === 1) {
            return (int) $value;
        }

        return null;
    }
}
