<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\CategoryModel;
use App\Model\ProductModel;

/**
 * Catalogue de bijoux (US DEC-b) et bijoux d'une catégorie (US DEC-a).
 */
final class ProductController
{
    /**
     * Forme d'un slug de catégorie : minuscules, chiffres et tirets.
     * Tout autre texte est refusé avant d'interroger la base.
     */
    private const SLUG_PATTERN = '/^[a-z0-9-]{1,60}$/';

    /** Même règle pour un slug de bijou, dont la colonne est plus longue. */
    private const PRODUCT_SLUG_PATTERN = '/^[a-z0-9-]{1,120}$/';

    /** Le modèle qui interroge les bijoux, fourni à la construction. */
    private ProductModel $products;

    /** Le modèle qui interroge les catégories, fourni à la construction. */
    private CategoryModel $categories;

    /**
     * @param ProductModel  $products   Modèle des bijoux.
     * @param CategoryModel $categories Modèle des catégories.
     */
    public function __construct(ProductModel $products, CategoryModel $categories)
    {
        $this->products   = $products;
        $this->categories = $categories;
    }

    /**
     * GET /api/produits : tous les bijoux du catalogue.
     * GET /api/produits?categorie=slug : les bijoux d'une catégorie.
     *
     * Réponse sans filtre : { produits: [...], total: 20 }
     *
     * @param Request $request Requête entrante.
     */
    public function index(Request $request): void
    {
        $slug = $request->parametre('categorie');

        if ($slug !== null) {
            $this->indexByCategory($slug);
            return;
        }

        $products = $this->products->findAll();

        Response::json([
            'produits' => $products,
            'total'    => count($products),
        ]);
    }

    /**
     * GET /api/produit?slug=… : la fiche d'un bijou (US DEC-c).
     *
     * Réponse : { produit: { id, nom, slug, prix, description, categorie,
     *                        sousCategorie, images: [{ fichier, alt }] } }
     *
     * Erreurs : 400 si le slug est absent ou mal formé, 404 s'il n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function show(Request $request): void
    {
        $slug = $request->parametre('slug');

        if ($slug === null || preg_match(self::PRODUCT_SLUG_PATTERN, $slug) !== 1) {
            Response::erreur('Bijou invalide.', 400);
            return;
        }

        $product = $this->products->findBySlug($slug);

        if ($product === null) {
            Response::erreur('Ce bijou n\'existe pas.', 404);
            return;
        }

        Response::json(['produit' => $product]);
    }

    /**
     * Les bijoux d'une catégorie, avec de quoi construire l'en-tête de la page.
     *
     * Réponse : { categorie: { nom, slug, description },
     *             parent: { nom, slug } | null,
     *             sousCategories: [{ nom, slug }],
     *             produits: [...], total }
     *
     * sousCategories est toujours la liste de la catégorie principale : sur
     * une sous-catégorie, ce sont ses « sœurs », pour passer de l'une à l'autre.
     *
     * Erreurs : 400 si le slug est mal formé, 404 s'il n'existe pas.
     *
     * @param string $slug Slug reçu dans ?categorie=.
     */
    private function indexByCategory(string $slug): void
    {
        if (preg_match(self::SLUG_PATTERN, $slug) !== 1) {
            Response::erreur('Catégorie invalide.', 400);
            return;
        }

        $category = $this->categories->findBySlug($slug);

        if ($category === null) {
            Response::erreur('Cette catégorie n\'existe pas.', 404);
            return;
        }

        $parent = $category['parentId'] === null
            ? null
            : $this->categories->findById($category['parentId']);

        $mainCategory = $parent ?? $category;
        $products     = $this->products->findByCategory($category['id']);

        Response::json([
            'categorie'      => [
                'nom'         => $category['nom'],
                'slug'        => $category['slug'],
                'description' => $category['description'],
            ],
            'parent'         => $parent === null
                ? null
                : ['nom' => $parent['nom'], 'slug' => $parent['slug']],
            'sousCategories' => $this->categories->findChildren($mainCategory['id']),
            'produits'       => $products,
            'total'          => count($products),
        ]);
    }
}
