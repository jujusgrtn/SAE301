<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\AdminJournalModel;
use App\Model\AdminModel;

/**
 * Journal des modifications des administrateurs (US PIL-b).
 */
final class AdminJournalController extends AdminAreaController
{
    /** Le modèle du journal, fourni à la construction. */
    private AdminJournalModel $journal;

    /**
     * @param AdminModel        $admins  Modèle des comptes administrateurs.
     * @param AdminJournalModel $journal Modèle du journal.
     */
    public function __construct(AdminModel $admins, AdminJournalModel $journal)
    {
        parent::__construct($admins);
        $this->journal = $journal;
    }

    /**
     * GET /api/admin/journal (?page=…) : les modifications, les plus récentes d'abord, 30 par page.
     *
     * Réponse : { entrees: [{ id, date, administrateur, action, cible, statutAvant, statutApres, detail, lot }],
     *             total, page, parPage, pages }
     * Erreurs : 401 sans connexion administrateur, 400 si la page est invalide.
     *
     * @param Request $request Requête entrante.
     */
    public function index(Request $request): void
    {
        $this->requireAdmin();

        $page = $request->parametre('page') ?? '1';

        if (preg_match('/^[1-9]\d{0,5}$/', $page) !== 1) {
            Response::erreur('Numéro de page invalide.', 400);
            return;
        }

        header('Cache-Control: no-store');
        Response::json($this->journal->findPage((int) $page));
    }
}
