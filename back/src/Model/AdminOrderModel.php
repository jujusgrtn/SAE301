<?php

declare(strict_types=1);

namespace App\Model;

use PDO;
use Throwable;

/**
 * Gestion des réservations dans le back-office (US PIL-b).
 *
 * Lecture de toutes les réservations (de tous les clients) et changement de
 * statut. Une annulation rend au stock ce que la réservation en avait retiré,
 * dans la même transaction que le changement de statut : le statut et le
 * stock ne peuvent pas se contredire.
 */
final class AdminOrderModel
{
    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    /** Mouvements de stock, sur la même connexion : ils entrent dans la transaction. */
    private StockModel $stock;

    /**
     * @param PDO        $pdo   Connexion ouverte par back/index.php.
     * @param StockModel $stock Modèle des mouvements de stock, sur la même connexion.
     */
    public function __construct(PDO $pdo, StockModel $stock)
    {
        $this->pdo   = $pdo;
        $this->stock = $stock;
    }

    /**
     * Les réservations, les plus récentes d'abord.
     *
     * @param string|null $status Un des statuts de OrderStatus (déjà validé par le contrôleur), ou null pour toutes.
     * @return array<int, array<string, mixed>>
     *         [{ numero, statut, date, total, nombreArticles, client: { prenom, nom, email } }]
     */
    public function findAll(?string $status): array
    {
        $sql = 'SELECT commande.numero, commande.statut, commande.total, commande.date_commande,
                       utilisateur.prenom, utilisateur.nom, utilisateur.email,
                       (SELECT COALESCE(SUM(ligne_commande.quantite), 0)
                          FROM ligne_commande
                         WHERE ligne_commande.commande_id = commande.id) AS nombre_articles
                  FROM commande
            INNER JOIN utilisateur ON utilisateur.id = commande.utilisateur_id'
            . ($status === null ? '' : ' WHERE commande.statut = :statut')
            . ' ORDER BY commande.date_commande DESC, commande.id DESC';

        $statement = $this->pdo->prepare($sql);
        if ($status !== null) {
            $statement->bindValue(':statut', $status, PDO::PARAM_STR);
        }
        $statement->execute();

        return array_map([self::class, 'formatOrder'], $statement->fetchAll());
    }

    /**
     * Le nombre de réservations par statut, pour les filtres de la liste.
     * Tous les statuts sont présents, à 0 s'il n'y en a aucune.
     *
     * @return array<string, int> { 'en cours' => 2, 'disponible' => 0, … }
     */
    public function countByStatus(): array
    {
        $counts = array_fill_keys(OrderStatus::all(), 0);
        $rows   = $this->pdo->query('SELECT statut, COUNT(*) AS nombre FROM commande GROUP BY statut')->fetchAll();

        for ($i = 0; $i < count($rows); $i++) {
            $counts[$rows[$i]['statut']] = (int) $rows[$i]['nombre'];
        }

        return $counts;
    }

    /**
     * Une réservation avec ses lignes et les statuts qu'elle peut prendre.
     *
     * @param string $number Numéro déjà validé par le contrôleur.
     * @return array<string, mixed>|null
     *         { numero, statut, date, total, nombreArticles, client, transitions, lignes:
     *           [{ nomProduit, prixUnitaire, quantite, sousTotal }] }, ou null si elle n'existe pas.
     */
    public function findByNumber(string $number): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT commande.id, commande.numero, commande.statut, commande.total, commande.date_commande,
                    utilisateur.prenom, utilisateur.nom, utilisateur.email,
                    (SELECT COALESCE(SUM(ligne_commande.quantite), 0)
                       FROM ligne_commande
                      WHERE ligne_commande.commande_id = commande.id) AS nombre_articles
               FROM commande
         INNER JOIN utilisateur ON utilisateur.id = commande.utilisateur_id
              WHERE commande.numero = :numero'
        );
        $statement->bindValue(':numero', $number, PDO::PARAM_STR);
        $statement->execute();

        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        $lines = $this->pdo->prepare(
            'SELECT nom_produit, prix_unitaire, quantite
               FROM ligne_commande
              WHERE commande_id = :commande_id
           ORDER BY id'
        );
        $lines->bindValue(':commande_id', (int) $row['id'], PDO::PARAM_INT);
        $lines->execute();

        return self::formatOrder($row) + [
            'transitions' => OrderStatus::nextOf($row['statut']),
            'lignes'      => array_map(function (array $line): array {
                return [
                    'nomProduit'   => $line['nom_produit'],
                    'prixUnitaire' => (int) $line['prix_unitaire'],
                    'quantite'     => (int) $line['quantite'],
                    'sousTotal'    => (int) $line['prix_unitaire'] * (int) $line['quantite'],
                ];
            }, $lines->fetchAll()),
        ];
    }

    /**
     * Change le statut d'une réservation.
     *
     * La ligne est verrouillée (FOR UPDATE) et le passage est vérifié sur le
     * statut lu **dans la transaction** : deux personnes qui agissent en même
     * temps ne peuvent pas, par exemple, annuler deux fois et rendre le stock
     * deux fois. Une annulation rend au stock ce que la réservation avait
     * retiré (StockModel::refundOrder), dans la même transaction.
     *
     * @param string $number    Numéro déjà validé par le contrôleur.
     * @param string $newStatus Un des statuts de OrderStatus (déjà validé).
     * @return array{stockRendu: int}|null Le nombre d'exemplaires remis en stock, ou null si la réservation n'existe pas.
     * @throws OrderTransitionException Si le passage n'est pas permis depuis le statut actuel.
     */
    public function changeStatus(string $number, string $newStatus): ?array
    {
        $this->pdo->beginTransaction();

        try {
            $statement = $this->pdo->prepare('SELECT id, statut FROM commande WHERE numero = :numero FOR UPDATE');
            $statement->bindValue(':numero', $number, PDO::PARAM_STR);
            $statement->execute();
            $row = $statement->fetch();

            if ($row === false) {
                $this->pdo->rollBack();
                return null;
            }

            if (!OrderStatus::canMove($row['statut'], $newStatus)) {
                throw new OrderTransitionException(OrderStatus::explain($row['statut'], $newStatus));
            }

            $update = $this->pdo->prepare('UPDATE commande SET statut = :statut WHERE id = :id');
            $update->bindValue(':statut', $newStatus, PDO::PARAM_STR);
            $update->bindValue(':id', (int) $row['id'], PDO::PARAM_INT);
            $update->execute();

            $refunded = $newStatus === OrderStatus::CANCELLED ? $this->stock->refundOrder((int) $row['id']) : 0;

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['stockRendu' => $refunded];
    }

    /**
     * Ligne SQL -> réservation pour le JSON.
     *
     * @param array<string, mixed> $row Ligne issue de findAll() ou findByNumber().
     * @return array{numero: string, statut: string, date: string, total: int, nombreArticles: int,
     *               client: array{prenom: string, nom: string, email: string}}
     */
    private static function formatOrder(array $row): array
    {
        return [
            'numero'         => $row['numero'],
            'statut'         => $row['statut'],
            'date'           => $row['date_commande'],
            'total'          => (int) $row['total'],
            'nombreArticles' => (int) $row['nombre_articles'],
            'client'         => [
                'prenom' => $row['prenom'],
                'nom'    => $row['nom'],
                'email'  => $row['email'],
            ],
        ];
    }
}
