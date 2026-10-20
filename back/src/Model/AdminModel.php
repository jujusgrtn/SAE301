<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux comptes administrateurs du back-office (US GOF-b).
 *
 * Comme pour les clients, seule findByEmail() renvoie l'empreinte du mot de
 * passe, pour que le contrôleur la vérifie.
 */
final class AdminModel
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
     * Un administrateur à partir de son identifiant de connexion, avec
     * l'empreinte du mot de passe.
     *
     * @param string $login Identifiant saisi, sans espaces autour.
     * @return array{id: int, identifiant: string, motDePasse: string}|null
     */
    public function findByLogin(string $login): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, identifiant, mot_de_passe
               FROM administrateur
              WHERE identifiant = :identifiant'
        );
        $statement->bindValue(':identifiant', $login, PDO::PARAM_STR);
        $statement->execute();

        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return self::formatAdmin($row) + ['motDePasse' => $row['mot_de_passe']];
    }

    /**
     * Un administrateur à partir de son identifiant, sans l'empreinte.
     *
     * @param int $id Identifiant lu dans la session.
     * @return array{id: int, identifiant: string}|null
     */
    public function findById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, identifiant
               FROM administrateur
              WHERE id = :id'
        );
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        $row = $statement->fetch();

        return $row === false ? null : self::formatAdmin($row);
    }

    /**
     * Ligne SQL -> administrateur publiable.
     *
     * @param array<string, mixed> $row Ligne de la table administrateur.
     * @return array{id: int, identifiant: string}
     */
    private static function formatAdmin(array $row): array
    {
        return [
            'id'          => (int) $row['id'],
            'identifiant' => $row['identifiant'],
        ];
    }
}
