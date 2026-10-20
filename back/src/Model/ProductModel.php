<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux bijoux du catalogue (US DEC-b).
 *
 * Cette couche ne contient aucune règle métier et ne décide de rien :
 * elle exécute les requêtes qu'on lui demande et renvoie des tableaux.
 */
final class ProductModel
{
    /**
     * Colonnes et jointures communes aux listes de bijoux.
     *
     * LEFT JOIN sur l'image : un bijou sans photo reste listé, avec une image
     * nulle. Seule l'image d'ordre 0 (principale) est retenue.
     *
     * Le stock d'un bijou est la somme de celui de ses variantes (STK-b) : une
     * sous-requête, pour ne pas multiplier les lignes par variante.
     */
    private const SELECT_PRODUCTS = 'SELECT produit.id,
                       produit.nom,
                       produit.slug,
                       produit.prix,
                       produit.description,
                       (SELECT COALESCE(SUM(variante.stock), 0)
                          FROM variante
                         WHERE variante.produit_id = produit.id) AS stock,
                       sous_categorie.nom  AS sous_categorie_nom,
                       sous_categorie.slug AS sous_categorie_slug,
                       categorie.nom       AS categorie_nom,
                       categorie.slug      AS categorie_slug,
                       image_produit.fichier AS image_fichier,
                       image_produit.alt     AS image_alt
                  FROM produit
            INNER JOIN categorie AS sous_categorie
                    ON sous_categorie.id = produit.categorie_id
            INNER JOIN categorie
                    ON categorie.id = sous_categorie.parent_id
             LEFT JOIN image_produit
                    ON image_produit.produit_id = produit.id
                   AND image_produit.ordre = 0';

    /** Ordre du menu (catégorie, puis sous-catégorie), puis nouveautés d'abord. */
    private const ORDER_PRODUCTS = 'ORDER BY categorie.ordre,
                       sous_categorie.ordre,
                       produit.date_ajout DESC,
                       produit.id';

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
     * Tous les bijoux, avec leur sous-catégorie, leur catégorie principale et
     * leur image principale.
     *
     * Ordre : celui du menu (catégorie, puis sous-catégorie), puis les
     * nouveautés d'abord.
     *
     * @return array<int, array<string, mixed>> Bijoux mis en forme par formatProduct().
     */
    public function findAll(): array
    {
        $sql = self::SELECT_PRODUCTS . ' ' . self::ORDER_PRODUCTS;

        $rows = $this->pdo->query($sql)->fetchAll();

        return array_map([self::class, 'formatProduct'], $rows);
    }

    /**
     * Les bijoux d'une catégorie (US DEC-a), dans le même ordre que findAll().
     *
     * Une catégorie principale (Colliers) regroupe les bijoux de toutes ses
     * sous-catégories ; une sous-catégorie (Colliers plaqué or) seulement les
     * siens. Les produits sont rattachés aux sous-catégories : la catégorie
     * demandée est donc soit leur sous-catégorie, soit le parent de celle-ci.
     *
     * @param int $categoryId Identifiant d'une catégorie existante.
     * @return array<int, array<string, mixed>> Bijoux mis en forme par formatProduct().
     */
    public function findByCategory(int $categoryId): array
    {
        // Deux marqueurs distincts : les requêtes préparées natives
        // (ATTR_EMULATE_PREPARES à false) refusent un même marqueur répété.
        $sql = self::SELECT_PRODUCTS . '
                 WHERE sous_categorie.id = :sous_categorie_id
                    OR sous_categorie.parent_id = :categorie_id
              ' . self::ORDER_PRODUCTS;

        $statement = $this->pdo->prepare($sql);
        $statement->bindValue(':sous_categorie_id', $categoryId, PDO::PARAM_INT);
        $statement->bindValue(':categorie_id', $categoryId, PDO::PARAM_INT);
        $statement->execute();

        return array_map([self::class, 'formatProduct'], $statement->fetchAll());
    }

    /**
     * Un bijou et toutes ses photos, pour sa fiche (US DEC-c).
     *
     * @param string $slug Slug déjà validé par le contrôleur.
     * @return array<string, mixed>|null
     *         { id, nom, slug, prix, description, categorie, sousCategorie, images, variantes },
     *         ou null si aucun bijou ne porte ce slug.
     */
    public function findBySlug(string $slug): ?array
    {
        $statement = $this->pdo->prepare(self::SELECT_PRODUCTS . ' WHERE produit.slug = :slug');
        $statement->bindValue(':slug', $slug, PDO::PARAM_STR);
        $statement->execute();

        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        // La fiche affiche toute la galerie : l'image principale seule, utile
        // aux listes, est remplacée par la liste des images.
        $product = self::formatProduct($row);
        unset($product['image']);
        $product['description'] = $row['description'];
        $product['images']      = $this->findImages($product['id']);
        $product['variantes']   = $this->findVariants($product['id']);

        return $product;
    }

    /**
     * Les variantes d'un bijou (« Modèle unique » pour un bijou sans option),
     * que la fiche propose d'ajouter au panier (US CMD-b).
     *
     * Chaque variante porte son propre stock (STK-b) : la fiche affiche la
     * disponibilité de l'option choisie.
     *
     * @param int $productId Identifiant du bijou.
     * @return array<int, array{id: int, libelle: string, stock: int, disponibilite: string}>
     */
    private function findVariants(int $productId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, libelle, stock
               FROM variante
              WHERE produit_id = :produit_id
           ORDER BY id'
        );
        $statement->bindValue(':produit_id', $productId, PDO::PARAM_INT);
        $statement->execute();

        return array_map(function (array $row): array {
            return ['id' => (int) $row['id'], 'libelle' => $row['libelle']] + Stock::describe((int) $row['stock']);
        }, $statement->fetchAll());
    }

    /**
     * Les photos d'un bijou, de la principale (ordre 0) à la dernière.
     *
     * @param int $productId Identifiant du bijou.
     * @return array<int, array{fichier: string, alt: string}>
     */
    private function findImages(int $productId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT fichier, alt
               FROM image_produit
              WHERE produit_id = :produit_id
           ORDER BY ordre'
        );
        $statement->bindValue(':produit_id', $productId, PDO::PARAM_INT);
        $statement->execute();

        return array_map(function (array $row): array {
            return ['fichier' => $row['fichier'], 'alt' => $row['alt']];
        }, $statement->fetchAll());
    }

    /**
     * Transforme une ligne SQL à plat en bijou structuré pour le JSON.
     *
     * MySQL renvoie les nombres sous forme de chaînes : ils sont convertis ici.
     *
     * @param array<string, mixed> $row Ligne renvoyée par findAll().
     * @return array<string, mixed> { id, nom, slug, prix, stock, disponibilite, categorie, sousCategorie, image }
     */
    private static function formatProduct(array $row): array
    {
        $image = null;

        if ($row['image_fichier'] !== null) {
            $image = [
                'fichier' => $row['image_fichier'],
                'alt'     => $row['image_alt'],
            ];
        }

        return [
            'id'            => (int) $row['id'],
            'nom'           => $row['nom'],
            'slug'          => $row['slug'],
            'prix'          => (int) $row['prix'],
        ] + Stock::describe((int) $row['stock']) + [
            'categorie'     => [
                'nom'  => $row['categorie_nom'],
                'slug' => $row['categorie_slug'],
            ],
            'sousCategorie' => [
                'nom'  => $row['sous_categorie_nom'],
                'slug' => $row['sous_categorie_slug'],
            ],
            'image'         => $image,
        ];
    }
}
