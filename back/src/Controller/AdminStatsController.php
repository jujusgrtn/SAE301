<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Response;
use App\Model\AdminModel;
use App\Model\AdminStatsModel;
use App\Model\StatsExport;

/**
 * Statistiques du back-office (US PIL-a).
 *
 * Chaque route vérifie d'abord l'accès administrateur. Les réponses ne sont
 * jamais mises en cache : chaque consultation montre l'état de la base à cet instant.
 */
final class AdminStatsController extends AdminAreaController
{
    /** Le modèle des statistiques, fourni à la construction. */
    private AdminStatsModel $stats;

    /**
     * @param AdminModel      $admins Modèle des comptes administrateurs.
     * @param AdminStatsModel $stats  Modèle des statistiques.
     */
    public function __construct(AdminModel $admins, AdminStatsModel $stats)
    {
        parent::__construct($admins);
        $this->stats = $stats;
    }

    /**
     * GET /api/admin/statistiques : toutes les statistiques.
     *
     * Réponse : { genereLe, stocks: [{ id, nom, stock, disponibilite }],
     *             alertesStock: [{ variantId, produit, libelle, stock, disponibilite }],
     *             revenus: { jours: [{ jour, total, nombre }], total, nombre } (réservations retirées seulement),
     *             commandes: { total, parStatut, montantReserve },
     *             produitsLesPlusVendus: [{ nom, quantite, montant }] }
     * Erreur : 401 sans connexion administrateur.
     */
    public function index(): void
    {
        $this->requireAdmin();

        header('Cache-Control: no-store');
        Response::json($this->stats->all());
    }

    /**
     * GET /api/admin/statistiques/export : les mêmes statistiques en fichier CSV à télécharger.
     *
     * Erreur : 401 sans connexion administrateur.
     */
    public function export(): void
    {
        $this->requireAdmin();

        header('Cache-Control: no-store');
        Response::fichier(
            StatsExport::toCsv($this->stats->all()),
            'statistiques-matira-' . date('Y-m-d') . '.csv',
            'text/csv; charset=utf-8'
        );
    }
}
