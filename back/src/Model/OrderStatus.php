<?php

declare(strict_types=1);

namespace App\Model;

/**
 * Statuts d'une réservation et transitions permises (US PIL-b).
 *
 * Les quatre valeurs sont celles de l'ENUM commande.statut. Le parcours normal
 * est « en cours » → « disponible » → « retirée » ; une réservation peut être
 * annulée tant qu'elle n'est pas retirée. « retirée » et « annulée » sont
 * définitifs. Cette classe est la seule à connaître ces règles : le contrôleur
 * y valide les valeurs reçues, le modèle y vérifie chaque changement.
 */
final class OrderStatus
{
    /** Valeurs de l'ENUM commande.statut, avec leurs accents. */
    public const IN_PROGRESS = 'en cours';
    public const READY       = 'disponible';
    public const PICKED_UP   = 'retirée';
    public const CANCELLED   = 'annulée';

    /** Statuts accessibles depuis chaque statut (liste blanche). */
    private const TRANSITIONS = [
        self::IN_PROGRESS => [self::READY, self::CANCELLED],
        self::READY       => [self::PICKED_UP, self::CANCELLED],
        self::PICKED_UP   => [],
        self::CANCELLED   => [],
    ];

    /**
     * Tous les statuts, dans l'ordre du parcours.
     *
     * @return array<int, string>
     */
    public static function all(): array
    {
        return array_keys(self::TRANSITIONS);
    }

    /**
     * Indique si une valeur est exactement l'un des statuts.
     *
     * La comparaison est stricte : MySQL, lui, ignore les accents dans une
     * comparaison (« retiree » = « retirée »), d'où cette vérification en PHP
     * avant toute requête.
     *
     * @param string $status Valeur reçue.
     * @return bool
     */
    public static function isValid(string $status): bool
    {
        return in_array($status, self::all(), true);
    }

    /**
     * Les statuts que l'on peut atteindre depuis un statut.
     *
     * @param string $status Statut actuel.
     * @return array<int, string> Vide pour un statut définitif.
     */
    public static function nextOf(string $status): array
    {
        return self::TRANSITIONS[$status] ?? [];
    }

    /**
     * Indique si le passage d'un statut à un autre est permis.
     *
     * @param string $from Statut actuel.
     * @param string $to   Statut demandé.
     * @return bool
     */
    public static function canMove(string $from, string $to): bool
    {
        return in_array($to, self::nextOf($from), true);
    }

    /**
     * Message, destiné à l'écran, qui explique pourquoi un passage est refusé.
     *
     * @param string $from Statut actuel.
     * @param string $to   Statut demandé.
     * @return string
     */
    public static function explain(string $from, string $to): string
    {
        if ($from === $to) {
            return sprintf('Cette réservation est déjà « %s ».', $from);
        }

        $next = self::nextOf($from);

        if (count($next) === 0) {
            return sprintf('Une réservation « %s » ne peut plus changer de statut.', $from);
        }

        $quoted = array_map(function (string $status): string {
            return '« ' . $status . ' »';
        }, $next);

        return sprintf(
            'Passage de « %s » à « %s » impossible : depuis « %s », seuls %s sont possibles.',
            $from,
            $to,
            $from,
            implode(' ou ', $quoted)
        );
    }
}
