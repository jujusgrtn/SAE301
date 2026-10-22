<?php

declare(strict_types=1);

namespace App\Model;

/**
 * Règle de « Commander à nouveau » (US SUI-a) : quoi mettre dans le panier
 * à partir des lignes d'une ancienne réservation.
 *
 * Les lignes de l'ancienne réservation sont comparées à l'état actuel du
 * catalogue. Chaque ligne donne un résultat, jamais une exception : le client
 * doit savoir ce qui a été transféré et pourquoi le reste ne l'a pas été.
 *
 *   ajoutee   toute la quantité est dans le panier
 *   partielle une partie seulement (stock ou limite par bijou)
 *   limite    rien ajouté : le panier contient déjà le maximum possible
 *   epuisee   rien ajouté : plus de stock
 *   retiree   rien ajouté : le bijou n'est plus au catalogue (variante supprimée)
 *
 * L'option choisie à l'époque est conservée parce que la ligne désigne sa
 * variante (coloris, taille) : on ne retombe jamais sur une autre option.
 */
final class Reorder
{
    public const ADDED     = 'ajoutee';
    public const PARTIAL   = 'partielle';
    public const AT_LIMIT  = 'limite';
    public const SOLD_OUT  = 'epuisee';
    public const WITHDRAWN = 'retiree';

    /**
     * Ajoute au panier ce qui peut l'être, ligne par ligne.
     *
     * @param Cart                             $cart  Panier de la session, modifié en place.
     * @param array<int, array<string, mixed>> $lines Lignes de l'ancienne réservation
     *        (voir OrderModel::findLinesForReorder()).
     * @return array<int, array<string, mixed>> Un résultat par ligne :
     *         { nomProduit, quantiteDemandee, quantiteAjoutee, statut, ancienPrix?, nouveauPrix? }
     *         (les deux prix n'apparaissent que si le prix a changé et que des exemplaires ont été ajoutés).
     */
    public static function apply(Cart $cart, array $lines): array
    {
        $results = [];

        for ($i = 0; $i < count($lines); $i++) {
            $results[] = self::applyLine($cart, $lines[$i]);
        }

        return $results;
    }

    /**
     * Traite une ligne.
     *
     * @param Cart                 $cart Panier de la session.
     * @param array<string, mixed> $line Ligne de l'ancienne réservation.
     * @return array<string, mixed> Résultat de la ligne.
     */
    private static function applyLine(Cart $cart, array $line): array
    {
        $wanted = (int) $line['quantite'];
        $result = [
            'nomProduit'       => $line['nomProduit'],
            'quantiteDemandee' => $wanted,
            'quantiteAjoutee'  => 0,
            'statut'           => self::WITHDRAWN,
        ];

        if ($line['variantId'] === null || $line['stock'] === null) {
            return $result;
        }

        $variantId = (int) $line['variantId'];
        $stock     = (int) $line['stock'];

        if ($stock <= 0) {
            $result['statut'] = self::SOLD_OUT;
            return $result;
        }

        $inCart  = $cart->quantityOf($variantId);
        $allowed = min($wanted, Cart::MAX_QUANTITY - $inCart, $stock - $inCart);

        if ($allowed <= 0) {
            $result['statut'] = self::AT_LIMIT;
            return $result;
        }

        $cart->add($variantId, $allowed, $stock);

        $result['quantiteAjoutee'] = $allowed;
        $result['statut']          = $allowed < $wanted ? self::PARTIAL : self::ADDED;

        if ((int) $line['prixActuel'] !== (int) $line['prixUnitaire']) {
            $result['ancienPrix']  = (int) $line['prixUnitaire'];
            $result['nouveauPrix'] = (int) $line['prixActuel'];
        }

        return $result;
    }
}
