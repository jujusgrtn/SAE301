<?php

declare(strict_types=1);

use App\Controller\CatalogueController;
use App\Controller\ProductController;
use App\Controller\CategoryController;
use App\Controller\CartController;
use App\Controller\AccountController;
use App\Controller\OrderController;
use App\Controller\AdminController;

/**
 * Table des routes de l'API.
 *
 * Clé    : méthode HTTP et chemin, séparés par un ou plusieurs espaces.
 * Valeur : [classe du contrôleur, méthode à appeler].
 *
 * Toute instance de contrôleur utilisée ici doit également être enregistrée
 * dans back/index.php.
 */

return [
    'GET  /api/films'       => [CatalogueController::class, 'index'],
    'GET  /api/produits'    => [ProductController::class,   'index'],
    'GET  /api/produit'     => [ProductController::class,   'show'],
    'GET  /api/categories'  => [CategoryController::class,  'index'],
    'GET  /api/panier'          => [CartController::class, 'show'],
    'POST /api/panier/ajouter'  => [CartController::class, 'add'],
    'POST /api/panier/modifier' => [CartController::class, 'update'],
    'POST /api/panier/retirer'  => [CartController::class, 'remove'],
    'GET  /api/compte'              => [AccountController::class, 'show'],
    'POST /api/compte/connexion'    => [AccountController::class, 'login'],
    'POST /api/compte/inscription'  => [AccountController::class, 'register'],
    'POST /api/compte/deconnexion'  => [AccountController::class, 'logout'],
    'POST /api/commandes'           => [OrderController::class, 'create'],
    'GET  /api/commande'            => [OrderController::class, 'show'],
    'GET  /api/admin/compte'        => [AdminController::class, 'show'],
    'POST /api/admin/connexion'     => [AdminController::class, 'login'],
    'POST /api/admin/deconnexion'   => [AdminController::class, 'logout'],
];
