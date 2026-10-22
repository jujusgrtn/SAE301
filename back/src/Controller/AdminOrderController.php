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
     * GET /api/admin/commandes (?statut=…) : les réservations, les plus récentes d'abord.
     *
     * Réponse : { commandes: [{ numero, statut, date, total, nombreArticles, client }],
     *             total, effectifs: { 'en cours': n, 'disponible': n, 'retirée': n, 'annulée': n } }
     * Les effectifs portent sur toutes les réservations, filtre ou non.
     * Erreurs : 401 sans connexion administrateur, 400 si statut n'est pas un statut connu.
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

        $orders = $this->orders->findAll($status);

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
     * Annuler rend au stock ce que la réservation en avait retiré.
     *
     * Réponse : { commande: { … } (la réservation à jour), stockRendu: n }
     * Erreurs : 401 sans connexion administrateur, 400 si le numéro ou le statut est invalide,
     * 404 si la réservation n'existe pas, 409 si le passage n'est pas permis.
     *
     * @param Request $request Requête entrante.
     */
    public function changeStatus(Request $request): void
    {
        $this->requireAdmin();

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
            $result = $this->orders->changeStatus($number, $status);
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
}
