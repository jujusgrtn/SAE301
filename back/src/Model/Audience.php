<?php

declare(strict_types=1);

namespace App\Model;

/**
 * Public auquel un bijou s'adresse : femme, homme ou unisexe.
 *
 * Les valeurs sont celles de l'ENUM produit.public_cible ; cette classe est
 * l'unique liste blanche utilisée pour valider ce qui arrive du back-office.
 */
final class Audience
{
    public const FEMALE = 'femme';
    public const MALE   = 'homme';
    public const UNISEX = 'unisexe';

    /** Valeur d'un bijou dont le public n'est pas précisé. */
    public const DEFAULT = self::FEMALE;

    /**
     * Toutes les valeurs acceptées.
     *
     * @return array<int, string>
     */
    public static function all(): array
    {
        return [self::FEMALE, self::MALE, self::UNISEX];
    }

    /**
     * Indique si une valeur est un public connu.
     *
     * @param mixed $value Valeur reçue.
     * @return bool
     */
    public static function isValid(mixed $value): bool
    {
        return is_string($value) && in_array($value, self::all(), true);
    }
}
