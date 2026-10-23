<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Mouvements de stock et leur journal (US STK-a).
 *
 * Chaque variation du stock d'une variante est enregistrée dans la table
 * mouvement_stock, dans la même transaction que la variation elle-même :
 * le stock et son journal ne peuvent pas se contredire.
 *
 * Ces méthodes ne gèrent pas la transaction : elles sont appelées à
 * l'intérieur de celle de l'opération métier (validation d'une réservation,
 * plus tard annulation PIL-b), qui décide du commit ou du rollback.
 */
final class StockModel
{
    /** Motifs de mouvement, valeurs de l'ENUM mouvement_stock.motif. */
    public const REASON_RESERVATION = 'reservation';
    public const REASON_CANCELLATION = 'annulation';
    public const REASON_ADJUSTMENT = 'ajustement';

    /** Connexion à la base, partagée avec le modèle qui ouvre la transaction. */
    private PDO $pdo;

    /**
     * @param PDO $pdo Connexion ouverte par back/index.php.
     */
    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Sort des exemplaires du stock pour une réservation, et le journalise.
     *
     * La condition « stock >= quantité » est vérifiée par MySQL au moment même
     * de la mise à jour : même sans verrou préalable, le stock ne peut jamais
     * devenir négatif. Si elle échoue, rien n'est modifié.
     *
     * @param int $variantId Variante concernée.
     * @param int $quantity  Exemplaires à sortir, au moins 1.
     * @param int $orderId   Réservation à l'origine du mouvement.
     * @return void
     * @throws StockException Si le stock ne suffit plus.
     */
    public function withdraw(int $variantId, int $quantity, int $orderId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE variante
                SET stock = stock - :quantite
              WHERE id = :id
                AND stock >= :quantite_minimum'
        );
        $statement->bindValue(':quantite', $quantity, PDO::PARAM_INT);
        $statement->bindValue(':quantite_minimum', $quantity, PDO::PARAM_INT);
        $statement->bindValue(':id', $variantId, PDO::PARAM_INT);
        $statement->execute();

        if ($statement->rowCount() !== 1) {
            throw new StockException('Le stock a changé pendant la validation. Ajustez votre panier.');
        }

        $this->log($variantId, -$quantity, $orderId, self::REASON_RESERVATION);
    }

    /**
     * Rend au stock ce qu'une réservation en avait retiré (annulation, US PIL-b).
     *
     * Ce qui est rendu est lu dans le **journal** : la somme des sorties
     * « reservation » enregistrées pour cette réservation, variante par
     * variante. Une réservation antérieure au journal n'a jamais retiré de
     * stock, donc elle n'en rend pas : rendre « ce que dit la réservation »
     * ferait gonfler le stock. Une variante supprimée depuis est ignorée.
     *
     * Appelable une seule fois par réservation : si une entrée « annulation »
     * existe déjà pour elle, rien n'est rendu une seconde fois.
     *
     * @param int $orderId Réservation annulée.
     * @return int Nombre d'exemplaires remis en stock, tous bijoux confondus.
     */
    public function refundOrder(int $orderId): int
    {
        $already = $this->pdo->prepare('SELECT COUNT(*) FROM mouvement_stock WHERE commande_id = :id AND motif = :motif');
        $already->bindValue(':id', $orderId, PDO::PARAM_INT);
        $already->bindValue(':motif', self::REASON_CANCELLATION, PDO::PARAM_STR);
        $already->execute();

        if ((int) $already->fetchColumn() > 0) {
            return 0;
        }

        $statement = $this->pdo->prepare(
            'SELECT variante_id, -SUM(quantite) AS rendu
               FROM mouvement_stock
              WHERE commande_id = :id AND motif = :motif AND variante_id IS NOT NULL
           GROUP BY variante_id
             HAVING rendu > 0'
        );
        $statement->bindValue(':id', $orderId, PDO::PARAM_INT);
        $statement->bindValue(':motif', self::REASON_RESERVATION, PDO::PARAM_STR);
        $statement->execute();
        $rows = $statement->fetchAll();

        $update = $this->pdo->prepare('UPDATE variante SET stock = stock + :quantite WHERE id = :id');
        $total  = 0;

        for ($i = 0; $i < count($rows); $i++) {
            $quantity = (int) $rows[$i]['rendu'];

            $update->bindValue(':quantite', $quantity, PDO::PARAM_INT);
            $update->bindValue(':id', (int) $rows[$i]['variante_id'], PDO::PARAM_INT);
            $update->execute();

            $this->log((int) $rows[$i]['variante_id'], $quantity, $orderId, self::REASON_CANCELLATION);
            $total += $quantity;
        }

        return $total;
    }

    /**
     * Fixe le stock d'une variante à une valeur donnée (ajustement manuel du
     * back-office, US GOF-a) et journalise la différence.
     *
     * La ligne est verrouillée (FOR UPDATE) le temps de lire l'ancien stock :
     * une réservation simultanée ne peut pas fausser la différence journalisée.
     * Sans changement de valeur, rien n'est écrit.
     *
     * @param int $variantId Variante concernée.
     * @param int $newStock  Nouveau stock, 0 ou plus.
     * @return void
     */
    public function adjust(int $variantId, int $newStock): void
    {
        $statement = $this->pdo->prepare('SELECT stock FROM variante WHERE id = :id FOR UPDATE');
        $statement->bindValue(':id', $variantId, PDO::PARAM_INT);
        $statement->execute();

        $current = $statement->fetchColumn();

        if ($current === false) {
            throw new StockException('Cette option n\'existe plus.');
        }

        $delta = $newStock - (int) $current;

        if ($delta === 0) {
            return;
        }

        $update = $this->pdo->prepare('UPDATE variante SET stock = :stock WHERE id = :id');
        $update->bindValue(':stock', $newStock, PDO::PARAM_INT);
        $update->bindValue(':id', $variantId, PDO::PARAM_INT);
        $update->execute();

        $this->log($variantId, $delta, null, self::REASON_ADJUSTMENT);
    }

    /**
     * Enregistre un mouvement dans le journal, avec le stock qui en résulte.
     *
     * @param int      $variantId Variante concernée.
     * @param int      $delta     Variation signée (négative pour une sortie).
     * @param int|null $orderId   Réservation à l'origine du mouvement, null pour un ajustement manuel.
     * @param string   $reason    Une des constantes REASON_*.
     * @return void
     */
    private function log(int $variantId, int $delta, ?int $orderId, string $reason): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO mouvement_stock (variante_id, commande_id, quantite, stock_apres, motif)
             SELECT id, :commande_id, :quantite, stock, :motif
               FROM variante
              WHERE id = :id'
        );
        $statement->bindValue(':commande_id', $orderId, $orderId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $statement->bindValue(':quantite', $delta, PDO::PARAM_INT);
        $statement->bindValue(':motif', $reason, PDO::PARAM_STR);
        $statement->bindValue(':id', $variantId, PDO::PARAM_INT);
        $statement->execute();
    }
}
