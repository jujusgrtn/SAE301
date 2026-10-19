<?php

declare(strict_types=1);

use App\Controller\AuthController;
use App\Controller\CatalogueController;
use App\Controller\StatsController;
use App\Controller\ProductController;

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
    'POST /api/login'       => [AuthController::class,      'login'],
    'POST /api/logout'      => [AuthController::class,      'logout'],
    'GET  /api/admin/stats' => [StatsController::class,     'index'],
];
