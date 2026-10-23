<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux codes promotionnels (US PRO-a).
 */
final class PromoModel
{
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
     * Un code **utilisable** : il existe et il est actif.
     *
     * @param string $code Code déjà normalisé (voir Promo::normalizeCode()).
     * @return array{id: int, code: string, pourcentage: int}|null
     */
    public function findActiveByCode(string $code): ?array
    {
        $statement = $this->pdo->prepare('SELECT id, code, pourcentage FROM code_promo WHERE code = :code AND actif = 1');
        $statement->bindValue(':code', $code, PDO::PARAM_STR);
        $statement->execute();

        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return ['id' => (int) $row['id'], 'code' => $row['code'], 'pourcentage' => (int) $row['pourcentage']];
    }
}
