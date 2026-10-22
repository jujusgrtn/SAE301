<?php

declare(strict_types=1);

namespace App\Model;

use PDO;
use Throwable;

/**
 * Création, modification et suppression des bijoux (US GOF-a).
 *
 * Chaque écriture est une transaction : le bijou, sa variante, son stock, son
 * journal de stock et sa photo sont enregistrés ensemble, ou pas du tout.
 * Un bijou sans option a une seule variante, « Modèle unique », qui porte son
 * stock. Un bijou à options (OPT-c) a une variante par combinaison, chacune avec
 * son propre stock (OPT-b) : la modification règle alors le stock de chaque
 * combinaison, et chaque changement est journalisé.
 */
final class AdminProductModel
{
    /** Libellé de la variante d'un bijou sans option. */
    private const SINGLE_VARIANT_LABEL = 'Modèle unique';

    /** Connexion à la base, fournie à la construction. */
    private PDO $pdo;

    /** Ajustements de stock, sur la même connexion : ils entrent dans la transaction. */
    private StockModel $stock;

    /**
     * @param PDO        $pdo   Connexion ouverte par back/index.php.
     * @param StockModel $stock Modèle des mouvements de stock, sur la même connexion.
     */
    public function __construct(PDO $pdo, StockModel $stock)
    {
        $this->pdo   = $pdo;
        $this->stock = $stock;
    }

    /**
     * Un bijou tel que l'affiche le formulaire de modification.
     *
     * @param int $id Identifiant du bijou.
     * @return array<string, mixed>|null
     *         { id, nom, slug, description, prix, stock, sousCategorie: { nom, slug },
     *           nombreVariantes, variantes: [{ id, libelle, stock }], image: { fichier, alt } | null },
     *           ou null si le bijou n'existe pas.
     */
    public function findForEdit(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT produit.id, produit.nom, produit.slug, produit.description, produit.prix,
                    categorie.nom AS categorie_nom, categorie.slug AS categorie_slug,
                    (SELECT COALESCE(SUM(variante.stock), 0) FROM variante WHERE variante.produit_id = produit.id) AS stock,
                    (SELECT COUNT(*) FROM variante WHERE variante.produit_id = produit.id) AS nombre_variantes,
                    image_produit.fichier AS image_fichier, image_produit.alt AS image_alt
               FROM produit
         INNER JOIN categorie ON categorie.id = produit.categorie_id
          LEFT JOIN image_produit ON image_produit.produit_id = produit.id AND image_produit.ordre = 0
              WHERE produit.id = :id'
        );
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        $variants = $this->pdo->prepare('SELECT id, libelle, stock FROM variante WHERE produit_id = :id ORDER BY id');
        $variants->bindValue(':id', $id, PDO::PARAM_INT);
        $variants->execute();

        return [
            'id'              => (int) $row['id'],
            'nom'             => $row['nom'],
            'slug'            => $row['slug'],
            'description'     => $row['description'],
            'prix'            => (int) $row['prix'],
            'stock'           => (int) $row['stock'],
            'sousCategorie'   => ['nom' => $row['categorie_nom'], 'slug' => $row['categorie_slug']],
            'nombreVariantes' => (int) $row['nombre_variantes'],
            'variantes'       => array_map(function (array $variant): array {
                return ['id' => (int) $variant['id'], 'libelle' => $variant['libelle'], 'stock' => (int) $variant['stock']];
            }, $variants->fetchAll()),
            'image'           => $row['image_fichier'] === null
                ? null
                : ['fichier' => $row['image_fichier'], 'alt' => $row['image_alt']],
        ];
    }

    /**
     * Crée un bijou avec sa variante « Modèle unique », son stock et sa photo.
     *
     * Le slug de l'URL est dérivé du nom ; s'il existe déjà, un numéro est
     * ajouté (« bague-ginkgo-2 »).
     *
     * @param array{nom: string, description: string, prix: int, categorieId: int, stock: int|null, variantStocks: array<int, int>|null} $data  Champs validés (stock est renseigné : le contrôleur l'exige).
     * @param string $slugBase Slug issu du nom.
     * @param array{fichier: string, alt: string}|null $image Photo déjà enregistrée sur le disque, ou null.
     * @return array{id: int, slug: string} Le bijou créé.
     */
    public function create(array $data, string $slugBase, ?array $image): array
    {
        $this->pdo->beginTransaction();

        try {
            $slug = $this->uniqueSlug($slugBase, null);

            $statement = $this->pdo->prepare(
                'INSERT INTO produit (categorie_id, nom, slug, description, prix, date_ajout)
                 VALUES (:categorie_id, :nom, :slug, :description, :prix, CURDATE())'
            );
            $statement->bindValue(':categorie_id', $data['categorieId'], PDO::PARAM_INT);
            $statement->bindValue(':nom', $data['nom'], PDO::PARAM_STR);
            $statement->bindValue(':slug', $slug, PDO::PARAM_STR);
            $statement->bindValue(':description', $data['description'], PDO::PARAM_STR);
            $statement->bindValue(':prix', $data['prix'], PDO::PARAM_INT);
            $statement->execute();

            $productId = (int) $this->pdo->lastInsertId();

            // La variante naît à 0 : le passage au stock saisi est journalisé
            // comme un ajustement, comme toute autre variation.
            $variant = $this->pdo->prepare('INSERT INTO variante (produit_id, libelle, stock) VALUES (:produit_id, :libelle, 0)');
            $variant->bindValue(':produit_id', $productId, PDO::PARAM_INT);
            $variant->bindValue(':libelle', self::SINGLE_VARIANT_LABEL, PDO::PARAM_STR);
            $variant->execute();

            $this->stock->adjust((int) $this->pdo->lastInsertId(), (int) $data['stock']);

            if ($image !== null) {
                $this->insertImage($productId, $image['fichier'], $image['alt']);
            }

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['id' => $productId, 'slug' => $slug];
    }

    /**
     * Modifie un bijou. Le slug ne change pas : les adresses déjà partagées
     * continuent de fonctionner.
     *
     * @param int   $id   Identifiant du bijou.
     * @param array{nom: string, description: string, prix: int, categorieId: int, stock: int|null, variantStocks: array<int, int>|null} $data
     *        Champs validés : `stock` pour un bijou à une variante, `variantStocks` ({ variante => stock }) pour un bijou à options.
     * @param array{fichier: string, alt: string}|null $newImage Nouvelle photo déjà enregistrée sur le disque, ou null.
     * @param string|null $newAlt Nouveau texte alternatif de la photo actuelle, ou null pour ne pas y toucher.
     * @return array{found: bool, replacedImage: string|null}
     *         found vaut false si le bijou n'existe pas ; replacedImage est l'ancienne
     *         photo remplacée, à effacer du disque une fois la transaction validée.
     * @throws StockException Si le stock envoyé ne correspond pas aux variantes du bijou : un seul stock pour une
     *         variante, un stock pour chaque combinaison (et seulement elles) pour un bijou à options.
     */
    public function update(int $id, array $data, ?array $newImage, ?string $newAlt): array
    {
        $this->pdo->beginTransaction();

        try {
            $variantIds = $this->lockVariantIds($id);

            if ($variantIds === null) {
                $this->pdo->rollBack();
                return ['found' => false, 'replacedImage' => null];
            }
            $stocks = self::resolveStocks($variantIds, $data);

            $statement = $this->pdo->prepare(
                'UPDATE produit
                    SET categorie_id = :categorie_id, nom = :nom, description = :description, prix = :prix
                  WHERE id = :id'
            );
            $statement->bindValue(':categorie_id', $data['categorieId'], PDO::PARAM_INT);
            $statement->bindValue(':nom', $data['nom'], PDO::PARAM_STR);
            $statement->bindValue(':description', $data['description'], PDO::PARAM_STR);
            $statement->bindValue(':prix', $data['prix'], PDO::PARAM_INT);
            $statement->bindValue(':id', $id, PDO::PARAM_INT);
            $statement->execute();

            $variantsToAdjust = array_keys($stocks);
            for ($i = 0; $i < count($variantsToAdjust); $i++) {
                $this->stock->adjust($variantsToAdjust[$i], $stocks[$variantsToAdjust[$i]]);
            }

            $replaced = $this->saveMainImage($id, $newImage, $newAlt);

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['found' => true, 'replacedImage' => $replaced];
    }

    /**
     * Supprime un bijou, ses variantes et ses photos (suppression en cascade).
     *
     * Les réservations passées gardent le nom et le prix recopiés dans leurs
     * lignes ; le journal de stock garde ses mouvements.
     *
     * @param int $id Identifiant du bijou.
     * @return array<int, string>|null Les photos qu'il avait (à effacer du disque), ou null si le bijou n'existe pas.
     */
    public function delete(int $id): ?array
    {
        $this->pdo->beginTransaction();

        try {
            $statement = $this->pdo->prepare('SELECT fichier FROM image_produit WHERE produit_id = :id');
            $statement->bindValue(':id', $id, PDO::PARAM_INT);
            $statement->execute();
            $files = $statement->fetchAll(PDO::FETCH_COLUMN);

            $delete = $this->pdo->prepare('DELETE FROM produit WHERE id = :id');
            $delete->bindValue(':id', $id, PDO::PARAM_INT);
            $delete->execute();

            if ($delete->rowCount() !== 1) {
                $this->pdo->rollBack();
                return null;
            }

            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return array_values($files);
    }

    /**
     * Le stock à appliquer à chaque variante d'un bijou, d'après le formulaire.
     *
     * Un bijou à une variante prend `stock` ; un bijou à options prend un stock
     * pour chacune de ses combinaisons, ni plus ni moins : une combinaison oubliée
     * ou inconnue est refusée plutôt que laissée à une valeur incertaine.
     *
     * @param array<int, int> $variantIds Identifiants des variantes du bijou (verrouillées).
     * @param array<string, mixed> $data Champs validés par le contrôleur.
     * @return array<int, int> { variante => nouveau stock }
     * @throws StockException Si le stock envoyé ne correspond pas aux variantes.
     */
    private static function resolveStocks(array $variantIds, array $data): array
    {
        if (count($variantIds) === 1) {
            if ($data['stock'] === null) {
                throw new StockException('Saisissez le stock du bijou.');
            }
            return [$variantIds[0] => $data['stock']];
        }

        $sent = $data['variantStocks'];
        $keys = $sent === null ? [] : array_map('intval', array_keys($sent));
        sort($keys);

        if ($sent === null || $keys !== array_values($variantIds)) {
            throw new StockException('Ce bijou a plusieurs options : indiquez le stock de chacune de ses combinaisons.');
        }

        return $sent;
    }

    /**
     * Verrouille le bijou et ses variantes le temps de la modification.
     *
     * @param int $id Identifiant du bijou.
     * @return array<int, int>|null Identifiants de ses variantes, ou null si le bijou n'existe pas.
     */
    private function lockVariantIds(int $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT id FROM produit WHERE id = :id FOR UPDATE');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        if ($statement->fetchColumn() === false) {
            return null;
        }

        $variants = $this->pdo->prepare('SELECT id FROM variante WHERE produit_id = :id ORDER BY id FOR UPDATE');
        $variants->bindValue(':id', $id, PDO::PARAM_INT);
        $variants->execute();

        return array_map('intval', $variants->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * Remplace la photo principale (ordre 0), ou ne change que son texte alternatif.
     *
     * @param int         $productId Identifiant du bijou.
     * @param array{fichier: string, alt: string}|null $newImage Nouvelle photo, ou null.
     * @param string|null $newAlt    Nouveau texte alternatif de la photo actuelle, ou null.
     * @return string|null L'ancienne photo remplacée, ou null s'il n'y en avait pas ou si elle est conservée.
     */
    private function saveMainImage(int $productId, ?array $newImage, ?string $newAlt): ?string
    {
        $statement = $this->pdo->prepare('SELECT fichier FROM image_produit WHERE produit_id = :id AND ordre = 0 FOR UPDATE');
        $statement->bindValue(':id', $productId, PDO::PARAM_INT);
        $statement->execute();
        $current = $statement->fetchColumn();

        if ($newImage !== null) {
            if ($current === false) {
                $this->insertImage($productId, $newImage['fichier'], $newImage['alt']);
                return null;
            }

            $update = $this->pdo->prepare('UPDATE image_produit SET fichier = :fichier, alt = :alt WHERE produit_id = :id AND ordre = 0');
            $update->bindValue(':fichier', $newImage['fichier'], PDO::PARAM_STR);
            $update->bindValue(':alt', $newImage['alt'], PDO::PARAM_STR);
            $update->bindValue(':id', $productId, PDO::PARAM_INT);
            $update->execute();

            return (string) $current;
        }

        if ($newAlt !== null && $current !== false) {
            $update = $this->pdo->prepare('UPDATE image_produit SET alt = :alt WHERE produit_id = :id AND ordre = 0');
            $update->bindValue(':alt', $newAlt, PDO::PARAM_STR);
            $update->bindValue(':id', $productId, PDO::PARAM_INT);
            $update->execute();
        }

        return null;
    }

    /**
     * Ajoute la photo principale (ordre 0) d'un bijou.
     *
     * @param int    $productId Identifiant du bijou.
     * @param string $file      Valeur de image_produit.fichier.
     * @param string $alt       Texte alternatif.
     * @return void
     */
    private function insertImage(int $productId, string $file, string $alt): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO image_produit (produit_id, fichier, alt, ordre) VALUES (:produit_id, :fichier, :alt, 0)'
        );
        $statement->bindValue(':produit_id', $productId, PDO::PARAM_INT);
        $statement->bindValue(':fichier', $file, PDO::PARAM_STR);
        $statement->bindValue(':alt', $alt, PDO::PARAM_STR);
        $statement->execute();
    }

    /**
     * Un slug qui n'est pas déjà pris : le slug de base, puis -2, -3…
     *
     * @param string   $base     Slug issu du nom.
     * @param int|null $exceptId Bijou à ignorer (pour une modification), ou null.
     * @return string
     */
    private function uniqueSlug(string $base, ?int $exceptId): string
    {
        $slug   = $base;
        $number = 2;

        while ($this->slugExists($slug, $exceptId)) {
            $slug = $base . '-' . $number;
            $number++;
        }

        return $slug;
    }

    /**
     * Indique si un slug est déjà utilisé par un autre bijou.
     *
     * @param string   $slug     Slug à tester.
     * @param int|null $exceptId Bijou à ignorer, ou null.
     * @return bool
     */
    private function slugExists(string $slug, ?int $exceptId): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM produit WHERE slug = :slug AND id <> :id');
        $statement->bindValue(':slug', $slug, PDO::PARAM_STR);
        $statement->bindValue(':id', $exceptId ?? 0, PDO::PARAM_INT);
        $statement->execute();

        return $statement->fetchColumn() !== false;
    }
}
