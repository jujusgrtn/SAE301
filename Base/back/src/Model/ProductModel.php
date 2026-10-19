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
        // LEFT JOIN sur l'image : un bijou sans photo reste listé, avec une
        // image nulle. Seule l'image d'ordre 0 (principale) est retenue.
        $sql = 'SELECT produit.id,
                       produit.nom,
                       produit.slug,
                       produit.prix,
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
                   AND image_produit.ordre = 0
              ORDER BY categorie.ordre,
                       sous_categorie.ordre,
                       produit.date_ajout DESC,
                       produit.id';

        $rows = $this->pdo->query($sql)->fetchAll();

        return array_map([self::class, 'formatProduct'], $rows);
    }

    /**
     * Transforme une ligne SQL à plat en bijou structuré pour le JSON.
     *
     * MySQL renvoie les nombres sous forme de chaînes : ils sont convertis ici.
     *
     * @param array<string, mixed> $row Ligne renvoyée par findAll().
     * @return array<string, mixed> { id, nom, slug, prix, categorie, sousCategorie, image }
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
