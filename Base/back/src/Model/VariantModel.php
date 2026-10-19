<?php

declare(strict_types=1);

namespace App\Model;

use PDO;

/**
 * Accès aux variantes des bijoux (US CMD-b).
 *
 * La variante est ce que l'on réserve : le panier et, plus tard, les lignes de
 * commande la désignent par son identifiant. Elle porte le stock (STK-b/c).
 */
final class VariantModel
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
     * Indique si une variante existe.
     *
     * @param int $variantId Identifiant de la variante.
     * @return bool
     */
    public function exists(int $variantId): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM variante WHERE id = :id');
        $statement->bindValue(':id', $variantId, PDO::PARAM_INT);
        $statement->execute();

        return $statement->fetchColumn() !== false;
    }

    /**
     * Les variantes d'un panier, avec le bijou auquel elles appartiennent.
     *
     * @param array<int, int> $variantIds Identifiants lus dans le panier.
     * @return array<int, array<string, mixed>> Lignes indexées par identifiant de variante :
     *         { variantId, libelle, prixUnitaire, produit: { nom, slug, image } }
     */
    public function findForCart(array $variantIds): array
    {
        if (count($variantIds) === 0) {
            return [];
        }

        // Un marqueur « ? » par identifiant : les valeurs restent liées, seule
        // la liste des marqueurs est construite ici.
        $placeholders = implode(', ', array_fill(0, count($variantIds), '?'));

        $statement = $this->pdo->prepare(
            "SELECT variante.id,
                    variante.libelle,
                    produit.nom,
                    produit.slug,
                    produit.prix,
                    image_produit.fichier AS image_fichier,
                    image_produit.alt     AS image_alt
               FROM variante
         INNER JOIN produit
                 ON produit.id = variante.produit_id
          LEFT JOIN image_produit
                 ON image_produit.produit_id = produit.id
                AND image_produit.ordre = 0
              WHERE variante.id IN ({$placeholders})"
        );

        for ($i = 0; $i < count($variantIds); $i++) {
            $statement->bindValue($i + 1, $variantIds[$i], PDO::PARAM_INT);
        }
        $statement->execute();

        $rows    = $statement->fetchAll();
        $indexed = [];

        for ($i = 0; $i < count($rows); $i++) {
            $line = self::formatCartLine($rows[$i]);
            $indexed[$line['variantId']] = $line;
        }

        return $indexed;
    }

    /**
     * Ligne SQL -> variante prête pour le panier.
     *
     * @param array<string, mixed> $row Ligne renvoyée par findForCart().
     * @return array<string, mixed> { variantId, libelle, prixUnitaire, produit }
     */
    private static function formatCartLine(array $row): array
    {
        $image = null;

        if ($row['image_fichier'] !== null) {
            $image = [
                'fichier' => $row['image_fichier'],
                'alt'     => $row['image_alt'],
            ];
        }

        return [
            'variantId'    => (int) $row['id'],
            'libelle'      => $row['libelle'],
            'prixUnitaire' => (int) $row['prix'],
            'produit'      => [
                'nom'   => $row['nom'],
                'slug'  => $row['slug'],
                'image' => $image,
            ],
        ];
    }
}
