<?php

declare(strict_types=1);

namespace App\Model;

/**
 * Fabrication d'un slug d'URL à partir d'un nom (US GOF-a).
 *
 * « Bague Rangiroa acier doré & perle » devient
 * « bague-rangiroa-acier-dore-perle ». Le résultat n'utilise que des
 * minuscules, des chiffres et des tirets : c'est exactement la forme que les
 * contrôleurs acceptent dans /produit/:slug.
 */
final class Slug
{
    /** Longueur maximale, celle de la colonne produit.slug (VARCHAR(120)) moins la place d'un suffixe « -12 ». */
    public const MAX_LENGTH = 110;

    /**
     * Lettres accentuées du français et ligatures. Une table explicite plutôt
     * que iconv() : son résultat dépend de la langue configurée sur le serveur.
     */
    private const ACCENTS = [
        'à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ã' => 'a', 'å' => 'a',
        'ç' => 'c',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ì' => 'i',
        'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ò' => 'o', 'õ' => 'o',
        'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u',
        'ÿ' => 'y', 'ñ' => 'n',
        'œ' => 'oe', 'æ' => 'ae',
    ];

    /**
     * Slug d'un texte.
     *
     * @param string $text Nom saisi (un bijou, plus tard une catégorie).
     * @return string Le slug, ou '' si le texte ne contient ni lettre ni chiffre.
     */
    public static function fromText(string $text): string
    {
        $lower   = strtr(mb_strtolower($text), self::ACCENTS);
        $simple  = preg_replace('/[^a-z0-9]+/', '-', $lower) ?? '';
        $trimmed = trim($simple, '-');

        return rtrim(substr($trimmed, 0, self::MAX_LENGTH), '-');
    }
}
