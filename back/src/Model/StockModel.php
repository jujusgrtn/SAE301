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
     * Enregistre un mouvement dans le journal, avec le stock qui en résulte.
     *
     * @param int    $variantId Variante concernée.
     * @param int    $delta     Variation signée (négative pour une sortie).
     * @param int    $orderId   Réservation à l'origine du mouvement.
     * @param string $reason    Une des constantes REASON_*.
     * @return void
     */
    private function log(int $variantId, int $delta, int $orderId, string $reason): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO mouvement_stock (variante_id, commande_id, quantite, stock_apres, motif)
             SELECT id, :commande_id, :quantite, stock, :motif
               FROM variante
              WHERE id = :id'
        );
        $statement->bindValue(':commande_id', $orderId, PDO::PARAM_INT);
        $statement->bindValue(':quantite', $delta, PDO::PARAM_INT);
        $statement->bindValue(':motif', $reason, PDO::PARAM_STR);
        $statement->bindValue(':id', $variantId, PDO::PARAM_INT);
        $statement->execute();
    }
}
