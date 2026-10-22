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
    /**
     * Expression SQL du prix d'une variante (US OPT-c) : le prix du bijou plus
     * les suppléments des valeurs d'options de la combinaison. C'est la seule
     * définition de ce calcul ; toute requête qui lit un prix l'utilise, pour
     * que la fiche, le panier et la réservation affichent le même montant.
     * La requête doit désigner les tables `produit` et `variante` sous ces noms.
     */
    public const PRICE_SQL = '(produit.prix + COALESCE((SELECT SUM(valeur_option.supplement)
                                                          FROM variante_valeur
                                                    INNER JOIN valeur_option
                                                            ON valeur_option.id = variante_valeur.valeur_id
                                                         WHERE variante_valeur.variante_id = variante.id), 0))';

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
     * Stock d'une variante (US STK-c).
     *
     * @param int $variantId Identifiant de la variante.
     * @return int|null Exemplaires en stock, ou null si la variante n'existe pas.
     */
    public function findStock(int $variantId): ?int
    {
        $statement = $this->pdo->prepare('SELECT stock FROM variante WHERE id = :id');
        $statement->bindValue(':id', $variantId, PDO::PARAM_INT);
        $statement->execute();

        $stock = $statement->fetchColumn();

        return $stock === false ? null : (int) $stock;
    }

    /**
     * Les variantes d'un panier, avec le bijou auquel elles appartiennent.
     *
     * @param array<int, int> $variantIds Identifiants lus dans le panier.
     * @return array<int, array<string, mixed>> Lignes indexées par identifiant de variante :
     *         { variantId, libelle, prixUnitaire, stock, disponibilite, produit: { nom, slug, image } }
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
                    variante.stock,
                    produit.nom,
                    produit.slug,
                    " . self::PRICE_SQL . " AS prix,
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
     * @return array<string, mixed> { variantId, libelle, prixUnitaire, stock, disponibilite, produit }
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
        ] + Stock::describe((int) $row['stock']) + [
            'produit'      => [
                'nom'   => $row['nom'],
                'slug'  => $row['slug'],
                'image' => $image,
            ],
        ];
    }
}
