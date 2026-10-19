<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux catégories du catalogue (US DEC-a).
 *
 * Les catégories forment un arbre à deux niveaux : une catégorie principale
 * (Colliers, Bagues…) et ses sous-catégories (Plaqué or 18 cts, Acier…).
 */
final class CategoryModel
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
     * L'arbre du menu : les catégories principales, chacune avec ses
     * sous-catégories, dans l'ordre du menu.
     *
     * Une seule requête : l'arbre est assemblé en PHP plutôt qu'avec une
     * requête par catégorie principale.
     *
     * @return array<int, array{nom: string, slug: string, sousCategories: array<int, array{nom: string, slug: string}>}>
     */
    public function findMenu(): array
    {
        $rows = $this->pdo->query(
            'SELECT id, parent_id, nom, slug
               FROM categorie
           ORDER BY ordre, id'
        )->fetchAll();

        $parents = array_values(array_filter($rows, function (array $row): bool {
            return $row['parent_id'] === null;
        }));

        return array_map(function (array $parent) use ($rows): array {
            $children = array_filter($rows, function (array $row) use ($parent): bool {
                return $row['parent_id'] !== null && (int) $row['parent_id'] === (int) $parent['id'];
            });

            return [
                'nom'            => $parent['nom'],
                'slug'           => $parent['slug'],
                'sousCategories' => array_values(array_map([self::class, 'formatLink'], $children)),
            ];
        }, $parents);
    }

    /**
     * Une catégorie, principale ou sous-catégorie, à partir de son slug.
     *
     * @param string $slug Slug déjà validé par le contrôleur.
     * @return array{id: int, parentId: ?int, nom: string, slug: string, description: string}|null
     *         La catégorie, ou null si aucune ne porte ce slug.
     */
    public function findBySlug(string $slug): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, parent_id, nom, slug, description
               FROM categorie
              WHERE slug = :slug'
        );
        $statement->bindValue(':slug', $slug, PDO::PARAM_STR);
        $statement->execute();

        $row = $statement->fetch();

        return $row === false ? null : self::formatCategory($row);
    }

    /**
     * Une catégorie à partir de son identifiant.
     *
     * @param int $id Identifiant de la catégorie.
     * @return array{id: int, parentId: ?int, nom: string, slug: string, description: string}|null
     *         La catégorie, ou null si elle n'existe pas.
     */
    public function findById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, parent_id, nom, slug, description
               FROM categorie
              WHERE id = :id'
        );
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        $row = $statement->fetch();

        return $row === false ? null : self::formatCategory($row);
    }

    /**
     * Les sous-catégories d'une catégorie principale, dans l'ordre du menu.
     *
     * @param int $parentId Identifiant de la catégorie principale.
     * @return array<int, array{nom: string, slug: string}>
     */
    public function findChildren(int $parentId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT nom, slug
               FROM categorie
              WHERE parent_id = :parent_id
           ORDER BY ordre, id'
        );
        $statement->bindValue(':parent_id', $parentId, PDO::PARAM_INT);
        $statement->execute();

        return array_map([self::class, 'formatLink'], $statement->fetchAll());
    }

    /**
     * Ligne SQL -> catégorie typée (MySQL renvoie les nombres en chaînes).
     *
     * @param array<string, mixed> $row Ligne de la table categorie.
     * @return array{id: int, parentId: ?int, nom: string, slug: string, description: string}
     */
    private static function formatCategory(array $row): array
    {
        return [
            'id'          => (int) $row['id'],
            'parentId'    => $row['parent_id'] === null ? null : (int) $row['parent_id'],
            'nom'         => $row['nom'],
            'slug'        => $row['slug'],
            'description' => $row['description'],
        ];
    }

    /**
     * Ligne SQL -> lien de menu, sans les colonnes internes.
     *
     * @param array<string, mixed> $row Ligne contenant au moins nom et slug.
     * @return array{nom: string, slug: string}
     */
    private static function formatLink(array $row): array
    {
        return [
            'nom'  => $row['nom'],
            'slug' => $row['slug'],
        ];
    }
}
