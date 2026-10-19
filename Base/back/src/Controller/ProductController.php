<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Response;
use App\Model\ProductModel;

/**
 * Catalogue de bijoux (US DEC-b).
 */
final class ProductController
{
    /** Le modèle qui interroge la base, fourni à la construction. */
    private ProductModel $products;

    /**
     * @param ProductModel $products Modèle des bijoux.
     */
    public function __construct(ProductModel $products)
    {
        $this->products = $products;
    }

    /**
     * GET /api/produits : tous les bijoux du catalogue.
     *
     * Réponse : { produits: [...], total: 20 }
     */
    public function index(): void
    {
        $products = $this->products->findAll();

        Response::json([
            'produits' => $products,
            'total'    => count($products),
        ]);
    }
}
