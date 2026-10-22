<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Statistiques du back-office (US PIL-a).
 *
 * Rien n'est mis en cache : chaque appel relit la base, donc chaque consultation
 * et chaque export montrent l'état du moment.
 *
 * Revenus : les réservations ne sont payées qu'au retrait, donc seules les
 * réservations « retirées » comptent, rangées par jour de **retrait**. Ce jour est
 * celui du passage à « retirée » inscrit au journal des administrateurs ; une
 * réservation retirée avant l'existence du journal n'a pas cette date et reste
 * rangée à son jour de réservation.
 */
final class AdminStatsModel
{
    /** Nombre de jours du graphique des revenus, aujourd'hui compris. */
    public const REVENUE_DAYS = 7;

    /** Nombre de produits dans le classement des plus vendus. */
    public const TOP_PRODUCTS = 5;

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    /**
     * @param PDO $pdo Connexion ouverte par back/index.php.
     */
    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Le stock de chaque bijou (somme de ses combinaisons), du plus bas au plus haut.
     *
     * @return array<int, array{id: int, nom: string, stock: int, disponibilite: string}>
     */
    public function stockByProduct(): array
    {
        $rows = $this->pdo->query(
            'SELECT produit.id, produit.nom, COALESCE(SUM(variante.stock), 0) AS stock
               FROM produit
          LEFT JOIN variante ON variante.produit_id = produit.id
           GROUP BY produit.id, produit.nom
           ORDER BY stock, produit.nom'
        )->fetchAll();

        return array_map(function (array $row): array {
            return ['id' => (int) $row['id'], 'nom' => $row['nom']] + Stock::describe((int) $row['stock']);
        }, $rows);
    }

    /**
     * Les combinaisons dont le stock est faible ou épuisé (seuil de Stock::LOW_THRESHOLD),
     * les plus basses d'abord : ce sont les alertes à traiter.
     *
     * @return array<int, array{variantId: int, produit: string, libelle: string, stock: int, disponibilite: string}>
     */
    public function lowStock(): array
    {
        $statement = $this->pdo->prepare(
            'SELECT variante.id, variante.libelle, variante.stock, produit.nom
               FROM variante
         INNER JOIN produit ON produit.id = variante.produit_id
              WHERE variante.stock <= :seuil
           ORDER BY variante.stock, produit.nom, variante.id'
        );
        $statement->bindValue(':seuil', Stock::LOW_THRESHOLD, PDO::PARAM_INT);
        $statement->execute();

        return array_map(function (array $row): array {
            return [
                'variantId' => (int) $row['id'],
                'produit'   => $row['nom'],
                'libelle'   => $row['libelle'],
            ] + Stock::describe((int) $row['stock']);
        }, $statement->fetchAll());
    }

    /**
     * Les revenus des derniers jours, jour par jour, y compris les jours sans retrait :
     * seules les réservations retirées comptent, au jour de leur retrait.
     *
     * Le jour « aujourd'hui » est celui de la base, comme la date des réservations :
     * les deux ne peuvent pas se décaler.
     *
     * @return array{jours: array<int, array{jour: string, total: int, nombre: int}>, total: int, nombre: int}
     */
    public function revenue(): array
    {
        $days = self::REVENUE_DAYS;

        $statement = $this->pdo->prepare(
            'SELECT DATE(COALESCE(retrait.date_retrait, commande.date_commande)) AS jour,
                    COUNT(*) AS nombre,
                    SUM(commande.total) AS total
               FROM commande
          LEFT JOIN (SELECT cible, MAX(date_action) AS date_retrait
                       FROM journal_admin
                      WHERE action = :action AND statut_apres = :journal_retiree
                   GROUP BY cible) AS retrait
                 ON retrait.cible = commande.numero
              WHERE commande.statut = :retiree
                AND COALESCE(retrait.date_retrait, commande.date_commande)
                    >= DATE_SUB(CURDATE(), INTERVAL ' . ($days - 1) . ' DAY)
           GROUP BY jour'
        );
        $statement->bindValue(':action', 'commande.statut', PDO::PARAM_STR);
        $statement->bindValue(':journal_retiree', OrderStatus::PICKED_UP, PDO::PARAM_STR);
        $statement->bindValue(':retiree', OrderStatus::PICKED_UP, PDO::PARAM_STR);
        $statement->execute();

        $byDay = [];
        $rows  = $statement->fetchAll();
        for ($i = 0; $i < count($rows); $i++) {
            $byDay[$rows[$i]['jour']] = $rows[$i];
        }

        $today = (string) $this->pdo->query('SELECT CURDATE()')->fetchColumn();
        $list  = [];
        $total = 0;
        $count = 0;

        for ($offset = $days - 1; $offset >= 0; $offset--) {
            $day = date('Y-m-d', (int) strtotime($today . ' -' . $offset . ' days'));
            $row = $byDay[$day] ?? null;

            $entry = [
                'jour'   => $day,
                'total'  => $row === null ? 0 : (int) $row['total'],
                'nombre' => $row === null ? 0 : (int) $row['nombre'],
            ];
            $total += $entry['total'];
            $count += $entry['nombre'];
            $list[] = $entry;
        }

        return ['jours' => $list, 'total' => $total, 'nombre' => $count];
    }

    /**
     * Le nombre de réservations par statut (tous les statuts, à 0 s'il n'y en a pas)
     * et le montant total des réservations non annulées.
     *
     * @return array{total: int, parStatut: array<string, int>, montantReserve: int}
     */
    public function orders(): array
    {
        $byStatus = array_fill_keys(OrderStatus::all(), 0);
        $amount   = 0;
        $rows     = $this->pdo->query('SELECT statut, COUNT(*) AS nombre, SUM(total) AS montant FROM commande GROUP BY statut')->fetchAll();

        for ($i = 0; $i < count($rows); $i++) {
            $byStatus[$rows[$i]['statut']] = (int) $rows[$i]['nombre'];
            if ($rows[$i]['statut'] !== OrderStatus::CANCELLED) {
                $amount += (int) $rows[$i]['montant'];
            }
        }

        return ['total' => array_sum($byStatus), 'parStatut' => $byStatus, 'montantReserve' => $amount];
    }

    /**
     * Les bijoux les plus réservés (réservations annulées exclues), tous choix d'options
     * confondus. Une ligne dont le bijou a été supprimé depuis est comptée sous son nom figé.
     *
     * @return array<int, array{nom: string, quantite: int, montant: int}>
     */
    public function topProducts(): array
    {
        $statement = $this->pdo->prepare(
            'SELECT COALESCE(produit.nom, ligne_commande.nom_produit) AS nom,
                    SUM(ligne_commande.quantite) AS quantite,
                    SUM(ligne_commande.quantite * ligne_commande.prix_unitaire) AS montant
               FROM ligne_commande
         INNER JOIN commande ON commande.id = ligne_commande.commande_id
          LEFT JOIN variante ON variante.id = ligne_commande.variante_id
          LEFT JOIN produit ON produit.id = variante.produit_id
              WHERE commande.statut <> :annulee
           GROUP BY COALESCE(produit.nom, ligne_commande.nom_produit)
           ORDER BY quantite DESC, montant DESC, nom
              LIMIT ' . self::TOP_PRODUCTS
        );
        $statement->bindValue(':annulee', OrderStatus::CANCELLED, PDO::PARAM_STR);
        $statement->execute();

        return array_map(function (array $row): array {
            return ['nom' => $row['nom'], 'quantite' => (int) $row['quantite'], 'montant' => (int) $row['montant']];
        }, $statement->fetchAll());
    }

    /**
     * Toutes les statistiques, lues à l'instant de l'appel.
     *
     * @return array<string, mixed>
     */
    public function all(): array
    {
        return [
            'genereLe'                => (string) $this->pdo->query('SELECT NOW()')->fetchColumn(),
            'stocks'                  => $this->stockByProduct(),
            'alertesStock'            => $this->lowStock(),
            'revenus'                 => $this->revenue(),
            'commandes'               => $this->orders(),
            'produitsLesPlusVendus'   => $this->topProducts(),
        ];
    }
}
