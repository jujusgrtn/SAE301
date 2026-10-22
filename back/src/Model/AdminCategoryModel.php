<?php

declare(strict_types=1);

namespace App\Model;

use PDO;
use PDOException;
use Throwable;

/**
 * Gestion des catégories dans le back-office (US GOF-c).
 *
 * Les catégories forment un arbre à deux niveaux : une catégorie principale
 * (Colliers, Bagues…) et ses sous-catégories (Plaqué or 18 cts…). Les bijoux
 * se rangent dans les sous-catégories. Chaque écriture est une transaction.
 */
final class AdminCategoryModel
{
    /** Longueur de la colonne categorie.slug (VARCHAR(60)) moins la place d'un suffixe « -12 ». */
    private const SLUG_MAX_LENGTH = 56;

    /** Valeur maximale de la colonne categorie.ordre (TINYINT UNSIGNED). */
    private const ORDER_MAX = 255;

    /** Code SQLSTATE d'une violation de contrainte (ici : clé étrangère RESTRICT). */
    private const CONSTRAINT_VIOLATION = '23000';

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
     * L'arbre complet des catégories, avec de quoi décider de ce qu'on peut en faire.
     *
     * Une catégorie principale compte les bijoux de toutes ses sous-catégories.
     * L'ordre est celui du menu du site.
     *
     * @return array<int, array<string, mixed>>
     *         [{ id, nom, slug, description, nombreSousCategories, nombreProduits,
     *            sousCategories: [{ id, nom, slug, description, nombreProduits }] }]
     */
    public function findTree(): array
    {
        $rows = $this->pdo->query(
            'SELECT categorie.id, categorie.parent_id, categorie.nom, categorie.slug, categorie.description,
                    (SELECT COUNT(*) FROM produit WHERE produit.categorie_id = categorie.id) AS nombre_produits
               FROM categorie
           ORDER BY categorie.ordre, categorie.id'
        )->fetchAll();

        $parents = array_values(array_filter($rows, function (array $row): bool {
            return $row['parent_id'] === null;
        }));

        return array_map(function (array $parent) use ($rows): array {
            $children = array_values(array_filter($rows, function (array $row) use ($parent): bool {
                return $row['parent_id'] !== null && (int) $row['parent_id'] === (int) $parent['id'];
            }));

            $subCategories = array_map(function (array $child): array {
                return [
                    'id'             => (int) $child['id'],
                    'nom'            => $child['nom'],
                    'slug'           => $child['slug'],
                    'description'    => $child['description'],
                    'nombreProduits' => (int) $child['nombre_produits'],
                ];
            }, $children);

            return [
                'id'                   => (int) $parent['id'],
                'nom'                  => $parent['nom'],
                'slug'                 => $parent['slug'],
                'description'          => $parent['description'],
                'nombreSousCategories' => count($subCategories),
                'nombreProduits'       => (int) array_sum(array_column($subCategories, 'nombreProduits')),
                'sousCategories'       => $subCategories,
            ];
        }, $parents);
    }

    /**
     * Crée une catégorie, à la fin de son niveau.
     *
     * Le slug sert d'adresse (/categorie/slug) : il est dérivé du nom, préfixé
     * par celui de la catégorie principale pour une sous-catégorie
     * (« colliers-plaque-or-18-cts »), rendu unique sur toute la table, et ne
     * change plus ensuite.
     *
     * @param string   $name        Nom validé.
     * @param string   $description Description validée, éventuellement vide.
     * @param int|null $parentId    Catégorie principale, ou null pour créer une catégorie principale.
     * @return array{id: int, slug: string}|null La catégorie créée, ou null si parentId n'est pas une catégorie principale.
     */
    public function create(string $name, string $description, ?int $parentId): ?array
    {
        $this->pdo->beginTransaction();

        try {
            $base = Slug::fromText($name, self::SLUG_MAX_LENGTH);

            if ($parentId !== null) {
                $statement = $this->pdo->prepare('SELECT slug FROM categorie WHERE id = :id AND parent_id IS NULL FOR UPDATE');
                $statement->bindValue(':id', $parentId, PDO::PARAM_INT);
                $statement->execute();
                $parentSlug = $statement->fetchColumn();

                if ($parentSlug === false) {
                    $this->pdo->rollBack();
                    return null;
                }

                $base = Slug::fromText($parentSlug . ' ' . $name, self::SLUG_MAX_LENGTH);
            }

            $slug = $this->uniqueSlug($base);

            $insert = $this->pdo->prepare(
                'INSERT INTO categorie (parent_id, nom, slug, description, ordre)
                 VALUES (:parent_id, :nom, :slug, :description, :ordre)'
            );
            $insert->bindValue(':parent_id', $parentId, $parentId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
            $insert->bindValue(':nom', $name, PDO::PARAM_STR);
            $insert->bindValue(':slug', $slug, PDO::PARAM_STR);
            $insert->bindValue(':description', $description, PDO::PARAM_STR);
            $insert->bindValue(':ordre', $this->nextOrder($parentId), PDO::PARAM_INT);
            $insert->execute();

            $id = (int) $this->pdo->lastInsertId();

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['id' => $id, 'slug' => $slug];
    }

    /**
     * Modifie le nom et la description d'une catégorie. Le slug et la place
     * ne changent pas : les adresses déjà partagées continuent de fonctionner.
     *
     * @param int    $id          Identifiant de la catégorie.
     * @param string $name        Nom validé.
     * @param string $description Description validée.
     * @return array{id: int, nom: string, slug: string, description: string}|null La catégorie à jour, ou null si elle n'existe pas.
     */
    public function update(int $id, string $name, string $description): ?array
    {
        $statement = $this->pdo->prepare('SELECT slug FROM categorie WHERE id = :id');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
        $slug = $statement->fetchColumn();

        if ($slug === false) {
            return null;
        }

        $update = $this->pdo->prepare('UPDATE categorie SET nom = :nom, description = :description WHERE id = :id');
        $update->bindValue(':nom', $name, PDO::PARAM_STR);
        $update->bindValue(':description', $description, PDO::PARAM_STR);
        $update->bindValue(':id', $id, PDO::PARAM_INT);
        $update->execute();

        return ['id' => $id, 'nom' => $name, 'slug' => (string) $slug, 'description' => $description];
    }

    /**
     * Monte ou descend une catégorie d'un cran parmi celles du même niveau.
     *
     * Les catégories du niveau sont relues dans l'ordre du menu, deux
     * voisines échangent leur place, puis l'ordre est réécrit de 1 à n : un
     * ordre qui aurait des trous ou des égalités est remis d'aplomb au passage.
     * Déplacer la première vers le haut, ou la dernière vers le bas, ne change rien.
     *
     * @param int    $id        Identifiant de la catégorie.
     * @param string $direction « haut » ou « bas » (déjà validé par le contrôleur).
     * @return bool Faux si la catégorie n'existe pas.
     */
    public function move(int $id, string $direction): bool
    {
        $this->pdo->beginTransaction();

        try {
            $statement = $this->pdo->prepare('SELECT parent_id FROM categorie WHERE id = :id FOR UPDATE');
            $statement->bindValue(':id', $id, PDO::PARAM_INT);
            $statement->execute();
            $row = $statement->fetch();

            if ($row === false) {
                $this->pdo->rollBack();
                return false;
            }

            $siblings = $this->lockSiblingIds($row['parent_id'] === null ? null : (int) $row['parent_id']);
            $position = array_search($id, $siblings, true);
            $target   = $direction === 'haut' ? $position - 1 : $position + 1;

            if ($position !== false && $target >= 0 && $target < count($siblings)) {
                $moved             = $siblings[$position];
                $siblings[$position] = $siblings[$target];
                $siblings[$target]   = $moved;
            }

            $update = $this->pdo->prepare('UPDATE categorie SET ordre = :ordre WHERE id = :id');
            for ($i = 0; $i < count($siblings); $i++) {
                $update->bindValue(':ordre', min($i + 1, self::ORDER_MAX), PDO::PARAM_INT);
                $update->bindValue(':id', $siblings[$i], PDO::PARAM_INT);
                $update->execute();
            }

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return true;
    }

    /**
     * Supprime une catégorie, à condition qu'elle ne serve plus : ni
     * sous-catégorie, ni bijou. Rien n'est jamais supprimé en cascade.
     *
     * @param int $id Identifiant de la catégorie.
     * @return bool Faux si la catégorie n'existe pas.
     * @throws CategoryInUseException Si elle contient encore des sous-catégories ou des bijoux.
     */
    public function delete(int $id): bool
    {
        $this->pdo->beginTransaction();

        try {
            $statement = $this->pdo->prepare('SELECT nom FROM categorie WHERE id = :id FOR UPDATE');
            $statement->bindValue(':id', $id, PDO::PARAM_INT);
            $statement->execute();
            $name = $statement->fetchColumn();

            if ($name === false) {
                $this->pdo->rollBack();
                return false;
            }

            $subCategories = $this->count('SELECT COUNT(*) FROM categorie WHERE parent_id = :id', $id);
            $products      = $this->count('SELECT COUNT(*) FROM produit WHERE categorie_id = :id', $id);

            if ($subCategories > 0) {
                throw new CategoryInUseException(
                    sprintf('« %s » contient %d sous-catégorie%s : supprimez-%s d\'abord.', $name, $subCategories, $subCategories > 1 ? 's' : '', $subCategories > 1 ? 'les' : 'la')
                );
            }
            if ($products > 0) {
                throw new CategoryInUseException(
                    sprintf('« %s » contient %d bijou%s : déplacez-%s vers une autre sous-catégorie ou supprimez-%s d\'abord.', $name, $products, $products > 1 ? 'x' : '', $products > 1 ? 'les' : 'le', $products > 1 ? 'les' : 'le')
                );
            }

            $delete = $this->pdo->prepare('DELETE FROM categorie WHERE id = :id');
            $delete->bindValue(':id', $id, PDO::PARAM_INT);
            $delete->execute();

            $this->pdo->commit();
        } catch (PDOException $e) {
            $this->pdo->rollBack();

            // Un bijou a été rangé ici entre la vérification et la suppression :
            // la clé étrangère (RESTRICT) a refusé, comme la vérification l'aurait fait.
            if ($e->getCode() === self::CONSTRAINT_VIOLATION) {
                throw new CategoryInUseException('Cette catégorie vient d\'être utilisée : réessayez.');
            }
            throw $e;
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return true;
    }

    /**
     * Un nombre, lu par une requête COUNT(*) sur un identifiant.
     *
     * @param string $sql Requête à un seul marqueur :id.
     * @param int    $id  Identifiant.
     * @return int
     */
    private function count(string $sql, int $id): int
    {
        $statement = $this->pdo->prepare($sql);
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        return (int) $statement->fetchColumn();
    }

    /**
     * Les identifiants des catégories d'un niveau, dans l'ordre du menu, verrouillés.
     *
     * @param int|null $parentId Catégorie principale, ou null pour le niveau des catégories principales.
     * @return array<int, int>
     */
    private function lockSiblingIds(?int $parentId): array
    {
        $sql = $parentId === null
            ? 'SELECT id FROM categorie WHERE parent_id IS NULL ORDER BY ordre, id FOR UPDATE'
            : 'SELECT id FROM categorie WHERE parent_id = :parent_id ORDER BY ordre, id FOR UPDATE';

        $statement = $this->pdo->prepare($sql);
        if ($parentId !== null) {
            $statement->bindValue(':parent_id', $parentId, PDO::PARAM_INT);
        }
        $statement->execute();

        return array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * La place d'une nouvelle catégorie : à la suite de celles de son niveau.
     *
     * @param int|null $parentId Catégorie principale, ou null pour une catégorie principale.
     * @return int
     */
    private function nextOrder(?int $parentId): int
    {
        $sql = $parentId === null
            ? 'SELECT COALESCE(MAX(ordre), 0) FROM categorie WHERE parent_id IS NULL'
            : 'SELECT COALESCE(MAX(ordre), 0) FROM categorie WHERE parent_id = :parent_id';

        $statement = $this->pdo->prepare($sql);
        if ($parentId !== null) {
            $statement->bindValue(':parent_id', $parentId, PDO::PARAM_INT);
        }
        $statement->execute();

        return min((int) $statement->fetchColumn() + 1, self::ORDER_MAX);
    }

    /**
     * Un slug qui n'est pas déjà pris par une catégorie : le slug de base, puis -2, -3…
     *
     * @param string $base Slug issu du nom.
     * @return string
     */
    private function uniqueSlug(string $base): string
    {
        $slug   = $base;
        $number = 2;

        while ($this->slugExists($slug)) {
            $slug = $base . '-' . $number;
            $number++;
        }

        return $slug;
    }

    /**
     * Indique si un slug est déjà utilisé par une catégorie.
     *
     * @param string $slug Slug à tester.
     * @return bool
     */
    private function slugExists(string $slug): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM categorie WHERE slug = :slug');
        $statement->bindValue(':slug', $slug, PDO::PARAM_STR);
        $statement->execute();

        return $statement->fetchColumn() !== false;
    }
}
