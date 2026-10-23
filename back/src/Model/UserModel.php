<?php

declare(strict_types=1);

namespace App\Model;

use PDO;
use PDOException;

/**
 * Accès aux comptes clients (US CMD-c).
 *
 * Le mot de passe n'est jamais stocké en clair : la colonne mot_de_passe
 * contient l'empreinte produite par password_hash(). Seul findByEmail() la
 * renvoie, pour que le contrôleur la vérifie ; les autres méthodes ne
 * renvoient que des données publiables.
 */
final class UserModel
{
    /** Code SQLSTATE d'une violation de contrainte (ici : e-mail déjà utilisé). */
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
     * Un compte à partir de son e-mail, avec l'empreinte du mot de passe.
     *
     * @param string $email E-mail déjà normalisé (minuscules, sans espaces).
     * @return array{id: int, prenom: string, nom: string, email: string, motDePasse: string}|null
     */
    public function findByEmail(string $email): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, prenom, nom, email, mot_de_passe
               FROM utilisateur
              WHERE email = :email'
        );
        $statement->bindValue(':email', $email, PDO::PARAM_STR);
        $statement->execute();

        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return self::formatUser($row) + ['motDePasse' => $row['mot_de_passe']];
    }

    /**
     * Un compte à partir de son identifiant, sans l'empreinte.
     *
     * @param int $id Identifiant lu dans la session.
     * @return array{id: int, prenom: string, nom: string, email: string}|null
     */
    public function findById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, prenom, nom, email
               FROM utilisateur
              WHERE id = :id'
        );
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        $row = $statement->fetch();

        return $row === false ? null : self::formatUser($row);
    }

    /**
     * Crée un compte.
     *
     * L'unicité de l'e-mail est garantie par la contrainte uq_utilisateur_email :
     * même si deux inscriptions identiques arrivent en même temps, une seule
     * réussit.
     *
     * @param string $firstName    Prénom validé.
     * @param string $lastName     Nom validé.
     * @param string $email        E-mail validé et normalisé.
     * @param string $passwordHash Empreinte produite par password_hash().
     * @return int|null Identifiant du compte créé, ou null si l'e-mail est déjà utilisé.
     */
    public function create(string $firstName, string $lastName, string $email, string $passwordHash): ?int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO utilisateur (prenom, nom, email, mot_de_passe)
             VALUES (:prenom, :nom, :email, :mot_de_passe)'
        );
        $statement->bindValue(':prenom', $firstName, PDO::PARAM_STR);
        $statement->bindValue(':nom', $lastName, PDO::PARAM_STR);
        $statement->bindValue(':email', $email, PDO::PARAM_STR);
        $statement->bindValue(':mot_de_passe', $passwordHash, PDO::PARAM_STR);

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
     * Modifie le prénom, le nom et l'e-mail d'un compte (US SUI-b).
     *
     * L'unicité de l'e-mail reste garantie par la contrainte uq_utilisateur_email :
     * si une autre personne l'utilise déjà, rien n'est modifié.
     *
     * @param int    $id        Identifiant du compte connecté.
     * @param string $firstName Prénom validé.
     * @param string $lastName  Nom validé.
     * @param string $email     E-mail validé et normalisé.
     * @return bool Faux si l'e-mail est déjà utilisé par un autre compte.
     */
    public function updateProfile(int $id, string $firstName, string $lastName, string $email): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE utilisateur
                SET prenom = :prenom, nom = :nom, email = :email
              WHERE id = :id'
        );
        $statement->bindValue(':prenom', $firstName, PDO::PARAM_STR);
        $statement->bindValue(':nom', $lastName, PDO::PARAM_STR);
        $statement->bindValue(':email', $email, PDO::PARAM_STR);
        $statement->bindValue(':id', $id, PDO::PARAM_INT);

        try {
            $statement->execute();
        } catch (PDOException $e) {
            if ($e->getCode() === self::DUPLICATE_KEY) {
                return false;
            }
            throw $e;
        }

        return true;
    }

    /**
     * L'empreinte du mot de passe d'un compte, pour vérifier le mot de passe actuel.
     *
     * @param int $id Identifiant du compte connecté.
     * @return string|null Null si le compte n'existe plus.
     */
    public function findPasswordHash(int $id): ?string
    {
        $statement = $this->pdo->prepare('SELECT mot_de_passe FROM utilisateur WHERE id = :id');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        $hash = $statement->fetchColumn();

        return $hash === false ? null : (string) $hash;
    }

    /**
     * Remplace l'empreinte du mot de passe d'un compte.
     *
     * @param int    $id           Identifiant du compte connecté.
     * @param string $passwordHash Empreinte produite par password_hash().
     */
    public function updatePassword(int $id, string $passwordHash): void
    {
        $statement = $this->pdo->prepare('UPDATE utilisateur SET mot_de_passe = :mot_de_passe WHERE id = :id');
        $statement->bindValue(':mot_de_passe', $passwordHash, PDO::PARAM_STR);
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
    }

    /**
     * Ligne SQL -> compte publiable.
     *
     * @param array<string, mixed> $row Ligne de la table utilisateur.
     * @return array{id: int, prenom: string, nom: string, email: string}
     */
    private static function formatUser(array $row): array
    {
        return [
            'id'     => (int) $row['id'],
            'prenom' => $row['prenom'],
            'nom'    => $row['nom'],
            'email'  => $row['email'],
        ];
    }
}
