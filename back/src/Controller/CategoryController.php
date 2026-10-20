<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Response;
use App\Model\CategoryModel;

/**
 * Menu des catégories (US DEC-a).
 */
final class CategoryController
{
    /** Le modèle qui interroge les catégories, fourni à la construction. */
    private CategoryModel $categories;

    /**
     * @param CategoryModel $categories Modèle des catégories.
     */
    public function __construct(CategoryModel $categories)
    {
        $this->categories = $categories;
    }

    /**
     * GET /api/categories : l'arbre du menu.
     *
     * Réponse : { categories: [{ nom, slug, sousCategories: [{ nom, slug }] }] }
     */
    public function index(): void
    {
        Response::json([
            'categories' => $this->categories->findMenu(),
        ]);
    }
}
