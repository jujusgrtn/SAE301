<?php

declare(strict_types=1);

namespace App\Model;

use PDO;
use Throwable;

/**
 * Réservations click & collect (US CMD-a).
 *
 * Une réservation (table commande) appartient à un client et contient des
 * lignes dont le nom et le prix sont recopiés au moment de la validation :
 * elle reste exacte même si le bijou change de prix ou disparaît ensuite.
 */
final class OrderModel
{
    /** Statut d'une réservation qui vient d'être validée. */
    public const INITIAL_STATUS = 'en cours';

    /** Libellé de la variante d'un bijou sans option : il n'est pas recopié. */
    private const SINGLE_VARIANT_LABEL = 'Modèle unique';

    /** Longueur de la colonne ligne_commande.nom_produit. */
    private const PRODUCT_NAME_MAX_LENGTH = 120;

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
     * Crée une réservation à partir du contenu d'un panier, en une seule
     * transaction : soit la réservation et toutes ses lignes sont
     * enregistrées, soit rien ne l'est.
     *
     * Les prix et les stocks sont relus en base dans la transaction ; les
     * variantes sont verrouillées (FOR UPDATE) : entre le contrôle du stock
     * (STK-c) et la fin de la transaction, aucune autre validation ne peut
     * utiliser les mêmes exemplaires. Le décrément (STK-a) s'ajoutera ici.
     *
     * Le numéro (MC-2026-00042) est déduit de l'identifiant auto-incrémenté,
     * unique par construction : deux validations simultanées ne peuvent pas
     * obtenir le même numéro.
     *
     * @param int             $userId Client connecté.
     * @param array<int, int> $items  Quantités indexées par identifiant de variante.
     * @return array{numero: string, statut: string, total: int, nombreArticles: int}|null
     *         La réservation créée, ou null si aucune variante du panier n'existe plus.
     * @throws StockException Si une ligne dépasse le stock : rien n'est enregistré.
     */
    public function createFromItems(int $userId, array $items): ?array
    {
        $this->pdo->beginTransaction();

        try {
            $lines = $this->lockLines($items);

            if (count($lines) === 0) {
                $this->pdo->rollBack();
                return null;
            }

            self::checkStock($lines);

            $total     = array_sum(array_column($lines, 'sousTotal'));
            $itemCount = array_sum(array_column($lines, 'quantite'));
            $orderId   = $this->insertOrder($userId, $total);
            $number    = sprintf('MC-%s-%05d', date('Y'), $orderId);

            $statement = $this->pdo->prepare('UPDATE commande SET numero = :numero WHERE id = :id');
            $statement->bindValue(':numero', $number, PDO::PARAM_STR);
            $statement->bindValue(':id', $orderId, PDO::PARAM_INT);
            $statement->execute();

            $this->insertLines($orderId, $lines);

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return [
            'numero'         => $number,
            'statut'         => self::INITIAL_STATUS,
            'total'          => $total,
            'nombreArticles' => $itemCount,
        ];
    }

    /**
     * Une réservation et ses lignes, uniquement si elle appartient au client :
     * un client ne peut pas consulter la réservation d'un autre en devinant
     * son numéro.
     *
     * @param string $number Numéro déjà validé par le contrôleur.
     * @param int    $userId Client connecté.
     * @return array<string, mixed>|null
     *         { numero, statut, date, total, lignes: [{ nomProduit, prixUnitaire, quantite, sousTotal }] }
     */
    public function findByNumberForUser(string $number, int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, numero, statut, total, date_commande
               FROM commande
              WHERE numero = :numero
                AND utilisateur_id = :utilisateur_id'
        );
        $statement->bindValue(':numero', $number, PDO::PARAM_STR);
        $statement->bindValue(':utilisateur_id', $userId, PDO::PARAM_INT);
        $statement->execute();

        $order = $statement->fetch();

        if ($order === false) {
            return null;
        }

        $statement = $this->pdo->prepare(
            'SELECT nom_produit, prix_unitaire, quantite
               FROM ligne_commande
              WHERE commande_id = :commande_id
           ORDER BY id'
        );
        $statement->bindValue(':commande_id', (int) $order['id'], PDO::PARAM_INT);
        $statement->execute();

        $lines = array_map(function (array $row): array {
            return [
                'nomProduit'   => $row['nom_produit'],
                'prixUnitaire' => (int) $row['prix_unitaire'],
                'quantite'     => (int) $row['quantite'],
                'sousTotal'    => (int) $row['prix_unitaire'] * (int) $row['quantite'],
            ];
        }, $statement->fetchAll());

        return [
            'numero' => $order['numero'],
            'statut' => $order['statut'],
            'date'   => $order['date_commande'],
            'total'  => (int) $order['total'],
            'lignes' => $lines,
        ];
    }

    /**
     * Relit et verrouille les variantes du panier, et calcule chaque ligne
     * avec le prix actuel. Les variantes disparues sont ignorées.
     *
     * @param array<int, int> $items Quantités indexées par identifiant de variante.
     * @return array<int, array{variantId: int, nomProduit: string, prixUnitaire: int, quantite: int, sousTotal: int}>
     */
    private function lockLines(array $items): array
    {
        $variantIds = array_keys($items);

        if (count($variantIds) === 0) {
            return [];
        }

        // Un marqueur « ? » par identifiant : les valeurs restent liées.
        $placeholders = implode(', ', array_fill(0, count($variantIds), '?'));

        $statement = $this->pdo->prepare(
            "SELECT variante.id, variante.libelle, variante.stock, produit.nom, produit.prix
               FROM variante
         INNER JOIN produit ON produit.id = variante.produit_id
              WHERE variante.id IN ({$placeholders})
           ORDER BY variante.id
                FOR UPDATE"
        );

        for ($i = 0; $i < count($variantIds); $i++) {
            $statement->bindValue($i + 1, $variantIds[$i], PDO::PARAM_INT);
        }
        $statement->execute();

        $rows  = $statement->fetchAll();
        $lines = [];

        for ($i = 0; $i < count($rows); $i++) {
            $variantId = (int) $rows[$i]['id'];
            $quantity  = $items[$variantId];
            $price     = (int) $rows[$i]['prix'];

            $lines[] = [
                'variantId'    => $variantId,
                'nomProduit'   => self::formatProductName($rows[$i]['nom'], $rows[$i]['libelle']),
                'prixUnitaire' => $price,
                'quantite'     => $quantity,
                'sousTotal'    => $price * $quantity,
                'stock'        => (int) $rows[$i]['stock'],
            ];
        }

        return $lines;
    }

    /**
     * Vérifie qu'aucune ligne ne dépasse le stock verrouillé (US STK-c).
     *
     * Toutes les lignes en défaut sont citées dans le message, pour que le
     * client corrige son panier en une fois.
     *
     * @param array<int, array<string, mixed>> $lines Lignes calculées par lockLines().
     * @throws StockException Si au moins une ligne dépasse le stock.
     */
    private static function checkStock(array $lines): void
    {
        $shortages = array_filter($lines, function (array $line): bool {
            return $line['quantite'] > $line['stock'];
        });

        if (count($shortages) === 0) {
            return;
        }

        $details = array_map(function (array $line): string {
            return $line['nomProduit'] . ' (' . ($line['stock'] === 0 ? 'épuisé' : $line['stock'] . ' disponible(s)') . ')';
        }, array_values($shortages));

        throw new StockException('Stock insuffisant pour : ' . implode(', ', $details) . '. Ajustez votre panier.');
    }

    /**
     * Insère la réservation avec un numéro provisoire unique, remplacé par le
     * numéro définitif dès que l'identifiant est connu.
     *
     * @param int $userId Client connecté.
     * @param int $total  Total de la réservation, en XPF.
     * @return int Identifiant de la réservation.
     */
    private function insertOrder(int $userId, int $total): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO commande (numero, utilisateur_id, statut, total)
             VALUES (:numero, :utilisateur_id, :statut, :total)'
        );
        $statement->bindValue(':numero', 'TMP-' . bin2hex(random_bytes(8)), PDO::PARAM_STR);
        $statement->bindValue(':utilisateur_id', $userId, PDO::PARAM_INT);
        $statement->bindValue(':statut', self::INITIAL_STATUS, PDO::PARAM_STR);
        $statement->bindValue(':total', $total, PDO::PARAM_INT);
        $statement->execute();

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Insère les lignes de la réservation, avec nom et prix figés.
     *
     * @param int                              $orderId Identifiant de la réservation.
     * @param array<int, array<string, mixed>> $lines   Lignes calculées par lockLines().
     */
    private function insertLines(int $orderId, array $lines): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO ligne_commande (commande_id, variante_id, nom_produit, prix_unitaire, quantite)
             VALUES (:commande_id, :variante_id, :nom_produit, :prix_unitaire, :quantite)'
        );

        for ($i = 0; $i < count($lines); $i++) {
            $statement->bindValue(':commande_id', $orderId, PDO::PARAM_INT);
            $statement->bindValue(':variante_id', $lines[$i]['variantId'], PDO::PARAM_INT);
            $statement->bindValue(':nom_produit', $lines[$i]['nomProduit'], PDO::PARAM_STR);
            $statement->bindValue(':prix_unitaire', $lines[$i]['prixUnitaire'], PDO::PARAM_INT);
            $statement->bindValue(':quantite', $lines[$i]['quantite'], PDO::PARAM_INT);
            $statement->execute();
        }
    }

    /**
     * Nom recopié dans la ligne : « Bague Ginkgo et keishi », ou avec l'option
     * choisie lorsqu'il y en a une : « Bague Rangiroa — Taille 54 ».
     *
     * @param string $productName  Nom du bijou.
     * @param string $variantLabel Libellé de la variante.
     * @return string
     */
    private static function formatProductName(string $productName, string $variantLabel): string
    {
        $name = $variantLabel === self::SINGLE_VARIANT_LABEL
            ? $productName
            : $productName . ' — ' . $variantLabel;

        return mb_substr($name, 0, self::PRODUCT_NAME_MAX_LENGTH);
    }
}
