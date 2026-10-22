<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\AdminModel;
use App\Model\AdminOrderModel;
use App\Model\OrderStatus;
use App\Model\OrderTransitionException;

/**
 * Gestion des réservations dans le back-office (US PIL-b).
 *
 * Chaque route vérifie d'abord l'accès administrateur (requireAdmin()), avant
 * toute lecture ou écriture. Le statut reçu est comparé à la liste blanche de
 * OrderStatus ; le passage d'un statut à l'autre est vérifié par le modèle.
 */
final class AdminOrderController extends AdminAreaController
{
    /** Forme d'un numéro de réservation : MC-2026-00042. */
    private const NUMBER_PATTERN = '/^MC-\d{4}-\d{5,10}$/';

    /** Le modèle des réservations du back-office, fourni à la construction. */
    private AdminOrderModel $orders;

    /**
     * @param AdminModel      $admins Modèle des comptes administrateurs.
     * @param AdminOrderModel $orders Modèle des réservations du back-office.
     */
    public function __construct(AdminModel $admins, AdminOrderModel $orders)
    {
        parent::__construct($admins);
        $this->orders = $orders;
    }

    /**
     * GET /api/admin/commandes (?statut=…&tri=…&ordre=…) : les réservations.
     *
     * Tri : `tri` = date (par défaut), statut ou montant ; `ordre` = desc (par défaut) ou asc.
     *
     * Réponse : { commandes: [{ numero, statut, date, total, nombreArticles, client }],
     *             total, effectifs: { 'en cours': n, 'disponible': n, 'retirée': n, 'annulée': n } }
     * Les effectifs portent sur toutes les réservations, filtre ou non.
     * Erreurs : 401 sans connexion administrateur, 400 si statut, tri ou ordre n'est pas une valeur connue.
     *
     * @param Request $request Requête entrante.
     */
    public function index(Request $request): void
    {
        $this->requireAdmin();

        $status = $request->parametre('statut');

        if ($status !== null && !OrderStatus::isValid($status)) {
            Response::erreur('Statut inconnu.', 400);
            return;
        }

        $sort      = $request->parametre('tri') ?? 'date';
        $direction = $request->parametre('ordre') ?? 'desc';

        if (!array_key_exists($sort, AdminOrderModel::SORTS) || !array_key_exists($direction, AdminOrderModel::DIRECTIONS)) {
            Response::erreur('Tri inconnu.', 400);
            return;
        }

        $orders = $this->orders->findAll($status, $sort, $direction);

        Response::json([
            'commandes'  => $orders,
            'total'      => count($orders),
            'effectifs'  => $this->orders->countByStatus(),
        ]);
    }

    /**
     * GET /api/admin/commande?numero=… : une réservation avec ses lignes.
     *
     * Réponse : { commande: { numero, statut, date, total, nombreArticles, client,
     *             transitions: [statuts possibles], lignes: [...] } }
     * Erreurs : 401 sans connexion administrateur, 400 si le numéro est mal formé, 404 s'il n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function show(Request $request): void
    {
        $this->requireAdmin();

        $number = $request->parametre('numero');

        if ($number === null || preg_match(self::NUMBER_PATTERN, $number) !== 1) {
            Response::erreur('Numéro de réservation invalide.', 400);
            return;
        }

        $order = $this->orders->findByNumber($number);

        if ($order === null) {
            Response::erreur('Réservation introuvable.', 404);
            return;
        }

        Response::json(['commande' => $order]);
    }

    /**
     * POST /api/admin/commandes/statut : { numero, statut } change le statut.
     * Annuler rend au stock ce que la réservation en avait retiré. Le changement est
     * inscrit dans le journal des administrateurs.
     *
     * Réponse : { commande: { … } (la réservation à jour), stockRendu: n }
     * Erreurs : 401 sans connexion administrateur, 400 si le numéro ou le statut est invalide,
     * 404 si la réservation n'existe pas, 409 si le passage n'est pas permis.
     *
     * @param Request $request Requête entrante.
     */
    public function changeStatus(Request $request): void
    {
        $admin = $this->requireAdmin();

        $body   = $request->corps();
        $number = $body['numero'] ?? null;
        $status = $body['statut'] ?? null;

        if (!is_string($number) || preg_match(self::NUMBER_PATTERN, $number) !== 1) {
            Response::erreur('Numéro de réservation invalide.', 400);
            return;
        }
        if (!is_string($status) || !OrderStatus::isValid($status)) {
            Response::erreur('Statut inconnu.', 400);
            return;
        }

        try {
            $result = $this->orders->changeStatus($number, $status, $admin);
        } catch (OrderTransitionException $e) {
            Response::erreur($e->getMessage(), 409);
            return;
        }

        if ($result === null) {
            Response::erreur('Réservation introuvable.', 404);
            return;
        }

        Response::json(['commande' => $this->orders->findByNumber($number), 'stockRendu' => $result['stockRendu']]);
    }

    /**
     * POST /api/admin/commandes/lot : { numeros: [...], statut } change le statut de plusieurs
     * réservations d'un coup (action en lot).
     *
     * Chaque réservation est traitée séparément : une réservation refusée n'empêche pas les
     * autres. Les doublons sont ignorés. Chaque changement réussi est inscrit au journal, avec un
     * repère commun à tout le lot.
     *
     * Réponse : { resultats: [{ numero, ok, message, stockRendu }], reussies, refusees }
     * Erreurs : 401 sans connexion administrateur, 400 si la liste est vide, trop longue (100 au
     * plus) ou contient un numéro mal formé, ou si le statut est inconnu.
     *
     * @param Request $request Requête entrante.
     */
    public function changeStatusBatch(Request $request): void
    {
        $admin = $this->requireAdmin();

        $body    = $request->corps();
        $numbers = $body['numeros'] ?? null;
        $status  = $body['statut'] ?? null;

        if (!is_string($status) || !OrderStatus::isValid($status)) {
            Response::erreur('Statut inconnu.', 400);
            return;
        }
        if (!is_array($numbers) || count($numbers) === 0 || count($numbers) > AdminOrderModel::BATCH_MAX) {
            Response::erreur('Choisissez de 1 à ' . AdminOrderModel::BATCH_MAX . ' réservations.', 400);
            return;
        }

        for ($i = 0; $i < count($numbers); $i++) {
            if (!is_string($numbers[$i]) || preg_match(self::NUMBER_PATTERN, $numbers[$i]) !== 1) {
                Response::erreur('Numéro de réservation invalide.', 400);
                return;
            }
        }

        $results = $this->orders->changeStatusBatch(array_values(array_unique($numbers)), $status, $admin);
        $success = count(array_filter($results, function (array $result): bool {
            return $result['ok'];
        }));

        Response::json([
            'resultats' => $results,
            'reussies'  => $success,
            'refusees'  => count($results) - $success,
        ]);
    }
}
