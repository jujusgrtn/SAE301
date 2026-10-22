<?php

declare(strict_types=1);

namespace App\Model;

/**
 * Promotion automatique (US PRO-c) : le bijou dont le stock total est le plus élevé
 * est en promotion, sans code à saisir.
 *
 * C'est une règle **calculée à chaque lecture** : quand une réservation fait baisser le
 * stock de ce bijou, ou qu'un autre dépasse son stock, la promotion change de bijou. Elle
 * est cumulable avec un code promo (PRO-a), qui s'applique ensuite sur le total.
 * Un bijou sans aucun exemplaire en stock n'est jamais en promotion. À stock égal, le
 * plus ancien (identifiant le plus petit) l'emporte.
 */
final class Promotion
{
    /** Pourcentage de la promotion automatique. */
    public const PERCENT = 20;

    /**
     * Expression SQL de l'identifiant du bijou en promotion, ou NULL s'il n'y en a pas
     * (aucun stock). Sous-requête autonome : elle n'utilise que ses propres alias.
     */
    public const PRODUCT_ID_SQL = '(SELECT promo_produit.id
                                      FROM produit AS promo_produit
                                INNER JOIN variante AS promo_variante ON promo_variante.produit_id = promo_produit.id
                                  GROUP BY promo_produit.id
                                    HAVING SUM(promo_variante.stock) > 0
                                  ORDER BY SUM(promo_variante.stock) DESC, promo_produit.id
                                     LIMIT 1)';

    /**
     * Expression SQL d'un prix une fois la promotion appliquée.
     *
     * @param string $rawPriceSql Expression SQL du prix avant promotion.
     * @param string $productIdSql Expression SQL de l'identifiant du bijou concerné.
     * @return string
     */
    public static function priceSql(string $rawPriceSql, string $productIdSql): string
    {
        return 'CASE WHEN ' . $productIdSql . ' = ' . self::PRODUCT_ID_SQL
            . ' THEN ROUND(' . $rawPriceSql . ' * ' . (100 - self::PERCENT) . ' / 100) ELSE ' . $rawPriceSql . ' END';
    }

    /**
     * Un prix une fois la promotion appliquée, arrondi au franc comme en SQL.
     *
     * @param int $price Prix avant promotion, en XPF.
     * @return int
     */
    public static function discounted(int $price): int
    {
        return (int) round($price * (100 - self::PERCENT) / 100);
    }
}
