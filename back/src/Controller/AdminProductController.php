<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Response;
use App\Model\AdminModel;
use App\Model\ProductModel;

/**
 * Gestion des bijoux dans le back-office (US GOF-a).
 *
 * Chaque route vérifie d'abord l'accès administrateur (requireAdmin()), avant
 * toute lecture ou écriture.
 */
final class AdminProductController extends AdminAreaController
{
    /** Le modèle qui interroge les bijoux, fourni à la construction. */
    private ProductModel $products;

    /**
     * @param AdminModel   $admins   Modèle des comptes administrateurs.
     * @param ProductModel $products Modèle des bijoux.
     */
    public function __construct(AdminModel $admins, ProductModel $products)
    {
        parent::__construct($admins);
        $this->products = $products;
    }

    /**
     * GET /api/admin/produits : tous les bijoux, dans l'ordre du catalogue.
     *
     * Réponse : { produits: [{ id, nom, slug, prix, stock, disponibilite,
     *             categorie, sousCategorie, image }], total }
     * Erreur : 401 sans connexion administrateur.
     */
    public function index(): void
    {
        $this->requireAdmin();

        $products = $this->products->findAll();

        Response::json(['produits' => $products, 'total' => count($products)]);
    }
}
