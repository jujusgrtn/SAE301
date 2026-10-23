<?php

declare(strict_types=1);

namespace App\Model;

/**
 * Règles des codes promotionnels (US PRO-a), sans accès à la base.
 *
 * Un code se compare sans tenir compte des majuscules : il est normalisé en
 * majuscules avant toute recherche ou écriture. La réduction est un pourcentage
 * du total de la réservation, arrondi au franc pacifique (pas de centimes).
 */
final class Promo
{
    /** Longueur maximale d'un code (colonne code_promo.code). */
    public const CODE_MAX_LENGTH = 30;

    /** Forme d'un code valide : lettres, chiffres, tiret et tiret bas. */
    private const CODE_PATTERN = '/^[A-Z0-9_-]{1,30}$/';

    /**
     * Le code tel qu'il est stocké : espaces retirés, en majuscules.
     *
     * @param mixed $value Valeur saisie.
     * @return string Le code, ou '' si la valeur n'est pas une chaîne ou n'a pas la forme d'un code.
     */
    public static function normalizeCode(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $code = mb_strtoupper(trim($value));

        return preg_match(self::CODE_PATTERN, $code) === 1 ? $code : '';
    }

    /**
     * La réduction accordée sur un total.
     *
     * @param int $total      Total de la réservation avant réduction, en XPF.
     * @param int $percentage Pourcentage du code, de 1 à 100.
     * @return int Réduction en XPF, arrondie au franc le plus proche, jamais supérieure au total.
     */
    public static function computeReduction(int $total, int $percentage): int
    {
        return min($total, (int) round($total * $percentage / 100));
    }
}
