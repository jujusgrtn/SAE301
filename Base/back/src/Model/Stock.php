<?php

declare(strict_types=1);

namespace App\Model;

/**
 * Règle d'affichage de la disponibilité d'un bijou (US STK-b).
 *
 * Le seuil est défini ici, côté serveur, pour qu'il n'existe qu'une seule
 * règle : le catalogue, la fiche produit et plus tard le back-office
 * affichent la même disponibilité pour un même stock.
 */
final class Stock
{
    /** En dessous de ce nombre d'exemplaires (inclus), le stock est dit faible. */
    public const LOW_THRESHOLD = 3;

    /** Disponibilités possibles, renvoyées telles quelles dans le JSON. */
    public const IN_STOCK     = 'en_stock';
    public const LOW_STOCK    = 'stock_faible';
    public const OUT_OF_STOCK = 'epuise';

    /**
     * Disponibilité correspondant à un nombre d'exemplaires.
     *
     * @param int $quantity Exemplaires en stock (0 ou plus).
     * @return string Une des constantes IN_STOCK, LOW_STOCK ou OUT_OF_STOCK.
     */
    public static function availability(int $quantity): string
    {
        if ($quantity <= 0) {
            return self::OUT_OF_STOCK;
        }
        if ($quantity <= self::LOW_THRESHOLD) {
            return self::LOW_STOCK;
        }
        return self::IN_STOCK;
    }

    /**
     * Le stock tel qu'il est envoyé au front : la quantité et sa disponibilité.
     *
     * @param int $quantity Exemplaires en stock.
     * @return array{stock: int, disponibilite: string}
     */
    public static function describe(int $quantity): array
    {
        return [
            'stock'         => max(0, $quantity),
            'disponibilite' => self::availability($quantity),
        ];
    }
}
