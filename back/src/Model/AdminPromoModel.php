<?php

declare(strict_types=1);

namespace App\Model;

use PDO;
use PDOException;

/**
 * Gestion des codes promotionnels dans le back-office (US PRO-b).
 *
 * Créer, modifier, supprimer, et lire les statistiques d'utilisation de chaque code.
 * Une réservation recopie son code, son pourcentage et sa réduction : supprimer un
 * code ne change donc rien aux réservations passées (leur `code_promo_id` passe à NULL)
 * et leur utilisation reste comptée à part, sous « codes supprimés ».
 *
 * Les statistiques ne comptent que les réservations **non annulées** : une réservation
 * annulée n'a pas profité de la réduction.
 */
final class AdminPromoModel
{
    /** Code SQLSTATE d'une violation de contrainte (ici : code déjà utilisé). */
    private const DUPLICATE_KEY = '23000';

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
     * Tous les codes avec leurs statistiques d'utilisation, les plus récents d'abord.
     *
     * @return array<int, array{id: int, code: string, pourcentage: int, actif: bool,
     *         utilisations: int, annulees: int, reductionTotale: int, montantReserve: int}>
     *         utilisations : réservations non annulées ; annulees : réservations annulées ;
     *         reductionTotale : XPF de réductions accordés ; montantReserve : total payé (après réduction).
     */
    public function findAll(): array
    {
        $statement = $this->pdo->prepare(
            'SELECT code_promo.id, code_promo.code, code_promo.pourcentage, code_promo.actif,
                    COALESCE(SUM(CASE WHEN commande.statut <> :annulee_1 THEN 1 ELSE 0 END), 0) AS utilisations,
                    COALESCE(SUM(CASE WHEN commande.statut = :annulee_2 THEN 1 ELSE 0 END), 0) AS annulees,
                    COALESCE(SUM(CASE WHEN commande.statut <> :annulee_3 THEN commande.reduction ELSE 0 END), 0) AS reduction_totale,
                    COALESCE(SUM(CASE WHEN commande.statut <> :annulee_4 THEN commande.total ELSE 0 END), 0) AS montant_reserve
               FROM code_promo
          LEFT JOIN commande ON commande.code_promo_id = code_promo.id
           GROUP BY code_promo.id, code_promo.code, code_promo.pourcentage, code_promo.actif
           ORDER BY code_promo.id DESC'
        );
        $this->bindCancelled($statement, 4);
        $statement->execute();

        return array_map(function (array $row): array {
            return [
                'id'              => (int) $row['id'],
                'code'            => $row['code'],
                'pourcentage'     => (int) $row['pourcentage'],
                'actif'           => (int) $row['actif'] === 1,
                'utilisations'    => (int) $row['utilisations'],
                'annulees'        => (int) $row['annulees'],
                'reductionTotale' => (int) $row['reduction_totale'],
                'montantReserve'  => (int) $row['montant_reserve'],
            ];
        }, $statement->fetchAll());
    }

    /**
     * L'utilisation des codes qui ont été supprimés depuis : les réservations gardent
     * le texte du code mais plus le lien.
     *
     * @return array{utilisations: int, reductionTotale: int}
     */
    public function findDeletedUsage(): array
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) AS utilisations, COALESCE(SUM(reduction), 0) AS reduction_totale
               FROM commande
              WHERE code_promo IS NOT NULL
                AND code_promo_id IS NULL
                AND statut <> :annulee_1'
        );
        $this->bindCancelled($statement, 1);
        $statement->execute();

        $row = $statement->fetch();

        return ['utilisations' => (int) $row['utilisations'], 'reductionTotale' => (int) $row['reduction_totale']];
    }

    /**
     * Crée un code.
     *
     * L'unicité est garantie par la contrainte uq_code_promo_code : deux créations
     * simultanées du même code ne réussissent pas toutes les deux.
     *
     * @param string $code        Code déjà normalisé (voir Promo::normalizeCode()).
     * @param int    $percentage  Pourcentage, de 1 à 100.
     * @param bool   $isActive    Vrai si le code est utilisable dès sa création.
     * @return int|null Identifiant du code créé, ou null si ce code existe déjà.
     */
    public function create(string $code, int $percentage, bool $isActive): ?int
    {
        $statement = $this->pdo->prepare('INSERT INTO code_promo (code, pourcentage, actif) VALUES (:code, :pourcentage, :actif)');
        $statement->bindValue(':code', $code, PDO::PARAM_STR);
        $statement->bindValue(':pourcentage', $percentage, PDO::PARAM_INT);
        $statement->bindValue(':actif', $isActive ? 1 : 0, PDO::PARAM_INT);

        try {
            $statement->execute();
        } catch (PDOException $e) {
            if ($e->getCode() === self::DUPLICATE_KEY) {
                return null;
            }
            throw $e;
        }

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Modifie le pourcentage et l'état d'un code. Le texte du code ne change pas : les
     * réservations passées l'ont recopié et les statistiques restent lisibles.
     *
     * @param int  $id         Identifiant du code.
     * @param int  $percentage Nouveau pourcentage, de 1 à 100.
     * @param bool $isActive   Vrai pour un code utilisable.
     * @return bool Faux si le code n'existe pas.
     */
    public function update(int $id, int $percentage, bool $isActive): bool
    {
        if (!$this->exists($id)) {
            return false;
        }

        $statement = $this->pdo->prepare('UPDATE code_promo SET pourcentage = :pourcentage, actif = :actif WHERE id = :id');
        $statement->bindValue(':pourcentage', $percentage, PDO::PARAM_INT);
        $statement->bindValue(':actif', $isActive ? 1 : 0, PDO::PARAM_INT);
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        return true;
    }

    /**
     * Supprime un code. Les réservations passées gardent leur réduction.
     *
     * @param int $id Identifiant du code.
     * @return bool Faux si le code n'existe pas.
     */
    public function delete(int $id): bool
    {
        $statement = $this->pdo->prepare('DELETE FROM code_promo WHERE id = :id');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        return $statement->rowCount() === 1;
    }

    /**
     * Indique si un code existe.
     *
     * @param int $id Identifiant du code.
     * @return bool
     */
    private function exists(int $id): bool
    {
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM code_promo WHERE id = :id');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        return (int) $statement->fetchColumn() === 1;
    }

    /**
     * Lie le statut « annulée » aux marqueurs :annulee_1 à :annulee_N d'une requête : les
     * requêtes préparées natives n'acceptent pas un même marqueur répété.
     *
     * @param \PDOStatement $statement Requête préparée.
     * @param int           $count     Nombre de marqueurs.
     */
    private function bindCancelled(\PDOStatement $statement, int $count): void
    {
        for ($i = 1; $i <= $count; $i++) {
            $statement->bindValue(':annulee_' . $i, OrderStatus::CANCELLED, PDO::PARAM_STR);
        }
    }
}
