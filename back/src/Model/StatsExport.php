<?php

declare(strict_types=1);

namespace App\Model;

/**
 * Export des statistiques au format CSV pour tableur (US PIL-a).
 *
 * Le fichier est en UTF-8 avec marque d'ordre (BOM) et séparateur point-virgule :
 * Excel en version française l'ouvre directement, accents et colonnes corrects.
 * Un texte qui commencerait par = + - ou @ serait pris pour une formule par le
 * tableur : il est précédé d'une apostrophe (les nombres, eux, restent des nombres).
 */
final class StatsExport
{
    /** Séparateur de colonnes du CSV français. */
    private const SEPARATOR = ';';

    /**
     * Le CSV des statistiques, en sections séparées par une ligne vide.
     *
     * @param array<string, mixed> $stats Résultat de AdminStatsModel::all().
     * @return string Le contenu du fichier, BOM compris.
     */
    public static function toCsv(array $stats): string
    {
        $rows = [
            ['Statistiques Matira Création'],
            ['Données au', $stats['genereLe']],
            [],
            ['Stock par bijou'],
            ['Bijou', 'Stock', 'Disponibilité'],
        ];

        $stocks = $stats['stocks'];
        for ($i = 0; $i < count($stocks); $i++) {
            $rows[] = [$stocks[$i]['nom'], $stocks[$i]['stock'], $stocks[$i]['disponibilite']];
        }

        $rows[] = [];
        $rows[] = ['Alertes de stock (' . Stock::LOW_THRESHOLD . ' exemplaires ou moins)'];
        $rows[] = ['Bijou', 'Combinaison', 'Stock', 'Disponibilité'];
        $alerts = $stats['alertesStock'];
        for ($i = 0; $i < count($alerts); $i++) {
            $rows[] = [$alerts[$i]['produit'], $alerts[$i]['libelle'], $alerts[$i]['stock'], $alerts[$i]['disponibilite']];
        }

        $rows[] = [];
        $rows[] = ['Revenus des ' . AdminStatsModel::REVENUE_DAYS . ' derniers jours (réservations retirées, par jour de retrait, en XPF)'];
        $rows[] = ['Jour', 'Réservations retirées', 'Montant'];
        $days = $stats['revenus']['jours'];
        for ($i = 0; $i < count($days); $i++) {
            $rows[] = [$days[$i]['jour'], $days[$i]['nombre'], $days[$i]['total']];
        }
        $rows[] = ['Total', $stats['revenus']['nombre'], $stats['revenus']['total']];

        $rows[] = [];
        $rows[] = ['Réservations par statut'];
        $rows[] = ['Statut', 'Nombre'];
        $statuses = array_keys($stats['commandes']['parStatut']);
        for ($i = 0; $i < count($statuses); $i++) {
            $rows[] = [$statuses[$i], $stats['commandes']['parStatut'][$statuses[$i]]];
        }
        $rows[] = ['Total', $stats['commandes']['total']];
        $rows[] = ['Montant des réservations non annulées (XPF)', $stats['commandes']['montantReserve']];

        $rows[] = [];
        $rows[] = ['Bijoux les plus réservés'];
        $rows[] = ['Bijou', 'Exemplaires', 'Montant (XPF)'];
        $top = $stats['produitsLesPlusVendus'];
        for ($i = 0; $i < count($top); $i++) {
            $rows[] = [$top[$i]['nom'], $top[$i]['quantite'], $top[$i]['montant']];
        }

        $lines = array_map([self::class, 'formatRow'], $rows);

        return "\xEF\xBB\xBF" . implode("\r\n", $lines) . "\r\n";
    }

    /**
     * Une ligne du CSV.
     *
     * @param array<int, int|string> $row Cellules de la ligne.
     * @return string
     */
    private static function formatRow(array $row): string
    {
        return implode(self::SEPARATOR, array_map([self::class, 'formatCell'], $row));
    }

    /**
     * Une cellule : entourée de guillemets si elle contient un séparateur, un guillemet
     * ou un retour à la ligne ; neutralisée si elle ressemble à une formule.
     *
     * @param int|string $value Valeur de la cellule.
     * @return string
     */
    private static function formatCell(int|string $value): string
    {
        $text = (string) $value;

        if (is_string($value) && $text !== '' && strpbrk($text[0], "=+-@\t\r") !== false) {
            $text = "'" . $text;
        }
        if (strpbrk($text, self::SEPARATOR . "\"\r\n") !== false) {
            $text = '"' . str_replace('"', '""', $text) . '"';
        }

        return $text;
    }
}
