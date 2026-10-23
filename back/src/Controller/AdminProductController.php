<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\AdminModel;
use App\Model\AdminProductModel;
use App\Model\Audience;
use App\Model\CategoryModel;
use App\Model\ProductImageStorage;
use App\Model\ProductModel;
use App\Model\Slug;
use App\Model\StockException;
use InvalidArgumentException;
use Throwable;

/**
 * Gestion des bijoux dans le back-office (US GOF-a).
 *
 * Chaque route vérifie d'abord l'accès administrateur (requireAdmin()), avant
 * toute lecture ou écriture. La création et la modification arrivent en
 * multipart/form-data (champs + photo facultative) ; la suppression en JSON.
 */
final class AdminProductController extends AdminAreaController
{
    /** Limites des champs : celles des colonnes SQL, et des bornes de bon sens. */
    private const NAME_MAX_LENGTH        = 120;
    private const DESCRIPTION_MAX_LENGTH = 2000;
    private const ALT_MAX_LENGTH         = 255;
    private const PRICE_MAX              = 9999999;
    private const STOCK_MAX              = 9999;

    /** Forme d'un slug de catégorie : minuscules, chiffres et tirets. */
    private const CATEGORY_SLUG_PATTERN = '/^[a-z0-9-]{1,60}$/';

    /** Le modèle de lecture des bijoux, fourni à la construction. */
    private ProductModel $products;

    /** Le modèle d'écriture des bijoux, fourni à la construction. */
    private AdminProductModel $adminProducts;

    /** Le modèle des catégories, pour retrouver la sous-catégorie choisie. */
    private CategoryModel $categories;

    /** Le stockage des photos envoyées. */
    private ProductImageStorage $images;

    /**
     * @param AdminModel          $admins        Modèle des comptes administrateurs.
     * @param ProductModel        $products      Modèle de lecture des bijoux.
     * @param AdminProductModel   $adminProducts Modèle d'écriture des bijoux.
     * @param CategoryModel       $categories    Modèle des catégories.
     * @param ProductImageStorage $images        Stockage des photos envoyées.
     */
    public function __construct(
        AdminModel $admins,
        ProductModel $products,
        AdminProductModel $adminProducts,
        CategoryModel $categories,
        ProductImageStorage $images
    ) {
        parent::__construct($admins);
        $this->products      = $products;
        $this->adminProducts = $adminProducts;
        $this->categories    = $categories;
        $this->images        = $images;
    }

    /**
     * GET /api/admin/produits : tous les bijoux, dans l'ordre du catalogue.
     *
     * Réponse : { produits: [{ id, nom, slug, prix, publicCible, stock, disponibilite,
     *             categorie, sousCategorie, image }], total }
     * Erreur : 401 sans connexion administrateur.
     */
    public function index(): void
    {
        $this->requireAdmin();

        $products = $this->products->findAll();

        Response::json(['produits' => $products, 'total' => count($products)]);
    }

    /**
     * GET /api/admin/produit?id=… : un bijou, pour le formulaire de modification.
     *
     * Réponse : { produit: { id, nom, slug, description, prix, publicCible, stock,
     *             sousCategorie: { nom, slug }, nombreVariantes, variantes: [{ id, libelle, stock }], image } }
     * Erreurs : 401 sans connexion administrateur, 400 si id est invalide, 404 si le bijou n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function show(Request $request): void
    {
        $this->requireAdmin();

        $id = self::readInt($request->parametre('id'));

        if ($id === null) {
            Response::erreur('Bijou invalide.', 400);
            return;
        }

        $product = $this->adminProducts->findForEdit($id);

        if ($product === null) {
            Response::erreur('Ce bijou n\'existe pas.', 404);
            return;
        }

        Response::json(['produit' => $product]);
    }

    /**
     * POST /api/admin/produits/creer : crée un bijou.
     *
     * Champs : nom, description, prix, publicCible (femme, homme ou unisexe), sousCategorie (slug), stock, et
     * facultativement photo (fichier) et altPhoto. Un bijou naît avec une seule
     * variante : les options se rattachent ensuite.
     *
     * Réponse 201 : { produit: { id, slug } }
     * Erreurs : 401 sans connexion administrateur, 400 si un champ ou la photo est refusé.
     *
     * @param Request $request Requête entrante.
     */
    public function create(Request $request): void
    {
        $this->requireAdmin();

        $form = $this->readForm($request);

        if ($form['data']['stock'] === null) {
            Response::erreur('Saisissez un stock entier, de 0 à ' . self::STOCK_MAX . '.', 400);
            return;
        }

        $image = $this->storeUploadedPhoto($request, $form['slug'], $form['altPhoto'] ?? $form['data']['nom']);

        try {
            $product = $this->adminProducts->create($form['data'], $form['slug'], $image);
        } catch (Throwable $e) {
            $this->discardPhoto($image);
            throw $e;
        }

        Response::json(['produit' => $product], 201);
    }

    /**
     * POST /api/admin/produits/modifier : modifie un bijou.
     *
     * Champs : id, puis les mêmes que pour la création. Sans nouvelle photo,
     * la photo actuelle est conservée (seul son texte alternatif peut changer).
     * Un bijou à options (OPT-b) n'a pas de champ `stock` : il envoie `stocks[<id de la
     * variante>]` pour chacune de ses combinaisons, et chaque changement est journalisé.
     *
     * Réponse : { produit: { … } } (le bijou à jour, comme GET /api/admin/produit)
     * Erreurs : 401 sans connexion administrateur, 400 si un champ ou la photo est refusé,
     * 404 si le bijou n'existe pas, 409 si le stock envoyé ne correspond pas à ses variantes.
     *
     * @param Request $request Requête entrante.
     */
    public function update(Request $request): void
    {
        $this->requireAdmin();

        $form = $this->readForm($request);
        $id   = self::readInt($request->corps()['id'] ?? null);

        if ($id === null) {
            Response::erreur('Bijou invalide.', 400);
            return;
        }

        if ($this->adminProducts->findForEdit($id) === null) {
            Response::erreur('Ce bijou n\'existe pas.', 404);
            return;
        }

        $image = $this->storeUploadedPhoto($request, $form['slug'], $form['altPhoto'] ?? $form['data']['nom']);

        try {
            $result = $this->adminProducts->update($id, $form['data'], $image, $image === null ? $form['altPhoto'] : null);
        } catch (StockException $e) {
            $this->discardPhoto($image);
            Response::erreur($e->getMessage(), 409);
            return;
        } catch (Throwable $e) {
            $this->discardPhoto($image);
            throw $e;
        }

        if (!$result['found']) {
            $this->discardPhoto($image);
            Response::erreur('Ce bijou n\'existe pas.', 404);
            return;
        }

        // La transaction est validée : l'ancienne photo envoyée ne sert plus.
        if ($result['replacedImage'] !== null) {
            $this->images->delete($result['replacedImage']);
        }

        Response::json(['produit' => $this->adminProducts->findForEdit($id)]);
    }

    /**
     * POST /api/admin/produits/supprimer : { id }. Supprime un bijou, ses
     * variantes et ses photos envoyées.
     *
     * Réponse : { supprime: true }
     * Erreurs : 401 sans connexion administrateur, 400 si id est invalide, 404 si le bijou n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function remove(Request $request): void
    {
        $this->requireAdmin();

        $id = self::readInt($request->corps()['id'] ?? null);

        if ($id === null) {
            Response::erreur('Bijou invalide.', 400);
            return;
        }

        $files = $this->adminProducts->delete($id);

        if ($files === null) {
            Response::erreur('Ce bijou n\'existe pas.', 404);
            return;
        }

        // Les photos du catalogue d'origine sont ignorées par delete().
        array_map([$this->images, 'delete'], $files);

        Response::json(['supprime' => true]);
    }

    /**
     * Lit et valide les champs communs à la création et à la modification.
     * Répond 400 et termine le script au premier champ refusé.
     *
     * @param Request $request Requête entrante.
     * @return array{data: array{nom: string, description: string, prix: int, publicCible: string, categorieId: int, stock: int|null,
     *                           variantStocks: array<int, int>|null},
     *               slug: string, altPhoto: string|null}
     */
    private function readForm(Request $request): array
    {
        if ($request->envoiRefuse()) {
            Response::erreur('L\'envoi est trop volumineux : la photo ne doit pas dépasser 2 Mo.', 400);
        }

        $body        = $request->corps();
        $name        = self::cleanLine($body['nom'] ?? null);
        $description = is_string($body['description'] ?? null) ? trim($body['description']) : '';
        $price       = self::readInt($body['prix'] ?? null);
        $stock       = self::readInt($body['stock'] ?? null);
        $variantStocks = self::readVariantStocks($body['stocks'] ?? null);
        $categorySlug = is_string($body['sousCategorie'] ?? null) ? $body['sousCategorie'] : '';
        $audience    = $body['publicCible'] ?? null;
        $alt         = self::cleanLine($body['altPhoto'] ?? null);

        $error = null;

        if ($name === '' || mb_strlen($name) > self::NAME_MAX_LENGTH) {
            $error = 'Saisissez le nom du bijou (' . self::NAME_MAX_LENGTH . ' caractères au plus).';
        } elseif (Slug::fromText($name) === '') {
            $error = 'Le nom doit contenir au moins une lettre ou un chiffre.';
        } elseif (mb_strlen($description) > self::DESCRIPTION_MAX_LENGTH) {
            $error = 'La description est trop longue (' . self::DESCRIPTION_MAX_LENGTH . ' caractères au plus).';
        } elseif ($price === null || $price < 1 || $price > self::PRICE_MAX) {
            $error = 'Saisissez un prix entier en XPF, de 1 à ' . self::PRICE_MAX . '.';
        } elseif (!Audience::isValid($audience)) {
            $error = 'Choisissez pour qui est ce bijou : femme, homme ou unisexe.';
        } elseif ($variantStocks === false || ($variantStocks === null && ($stock === null || $stock > self::STOCK_MAX))) {
            $error = 'Saisissez un stock entier, de 0 à ' . self::STOCK_MAX . ', pour le bijou ou pour chaque combinaison.';
        } elseif (mb_strlen($alt) > self::ALT_MAX_LENGTH) {
            $error = 'Le texte alternatif de la photo est trop long (' . self::ALT_MAX_LENGTH . ' caractères au plus).';
        }

        $category = null;

        if ($error === null) {
            $category = preg_match(self::CATEGORY_SLUG_PATTERN, $categorySlug) === 1
                ? $this->categories->findBySlug($categorySlug)
                : null;

            // Un bijou se range dans une sous-catégorie, jamais dans une catégorie principale.
            if ($category === null || $category['parentId'] === null) {
                $error = 'Choisissez une sous-catégorie dans la liste.';
            }
        }

        if ($error !== null || $category === null) {
            Response::erreur($error ?? 'Choisissez une sous-catégorie dans la liste.', 400);
        }

        return [
            'data'     => [
                'nom'         => $name,
                'description' => $description,
                'prix'        => (int) $price,
                'publicCible' => (string) $audience,
                'categorieId' => $category['id'],
                'stock'       => $stock === null || $stock > self::STOCK_MAX ? null : $stock,
                'variantStocks' => $variantStocks === false ? null : $variantStocks,
            ],
            'slug'     => Slug::fromText($name),
            'altPhoto' => $alt === '' ? null : $alt,
        ];
    }

    /**
     * Lit les stocks par combinaison d'un bijou à options : `stocks[<id>]` = entier.
     *
     * @param mixed $value Valeur du champ `stocks`.
     * @return array<int, int>|false|null Les stocks ({ variante => stock }), null si le champ est absent,
     *         false si une valeur est refusée.
     */
    private static function readVariantStocks(mixed $value): array|false|null
    {
        if (!is_array($value)) {
            return null;
        }

        $stocks = [];
        $keys   = array_keys($value);

        for ($i = 0; $i < count($keys); $i++) {
            $stock = self::readInt($value[$keys[$i]]);

            if (preg_match('/^[1-9]\d{0,5}$/', (string) $keys[$i]) !== 1 || $stock === null || $stock > self::STOCK_MAX) {
                return false;
            }
            $stocks[(int) $keys[$i]] = $stock;
        }

        return count($stocks) === 0 ? false : $stocks;
    }

    /**
     * Enregistre la photo envoyée avec le formulaire, s'il y en a une.
     * Répond 400 et termine le script si elle est refusée.
     *
     * @param Request $request Requête entrante.
     * @param string  $slug    Slug du bijou, base du nom de fichier.
     * @param string  $alt     Texte alternatif à enregistrer avec la photo.
     * @return array{fichier: string, alt: string}|null La photo enregistrée, ou null si aucune n'a été envoyée.
     */
    private function storeUploadedPhoto(Request $request, string $slug, string $alt): ?array
    {
        $upload = $request->fichier('photo');

        if ($upload === null || $upload['error'] === UPLOAD_ERR_NO_FILE) {
            return null;
        }

        try {
            return ['fichier' => $this->images->store($upload, $slug), 'alt' => $alt];
        } catch (InvalidArgumentException $e) {
            Response::erreur($e->getMessage(), 400);
            return null;
        }
    }

    /**
     * Efface une photo enregistrée mais devenue inutile (la base a refusé l'écriture).
     *
     * @param array{fichier: string, alt: string}|null $image La photo, ou null.
     * @return void
     */
    private function discardPhoto(?array $image): void
    {
        if ($image !== null) {
            $this->images->delete($image['fichier']);
        }
    }

    /**
     * Texte d'une ligne : sans espaces superflus ; '' si la valeur n'est pas une chaîne.
     *
     * @param mixed $value Valeur reçue.
     * @return string
     */
    private static function cleanLine(mixed $value): string
    {
        return is_string($value) ? trim(preg_replace('/\s+/u', ' ', $value) ?? '') : '';
    }

    /**
     * Entier positif ou nul : un nombre entier, ou une chaîne de chiffres.
     * Toute autre valeur donne null.
     *
     * @param mixed $value Valeur reçue (JSON ou champ de formulaire).
     * @return int|null
     */
    private static function readInt(mixed $value): ?int
    {
        if (is_int($value) && $value >= 0) {
            return $value;
        }
        if (is_string($value) && preg_match('/^\d{1,9}$/', $value) === 1) {
            return (int) $value;
        }

        return null;
    }
}
