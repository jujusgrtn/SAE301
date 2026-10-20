<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\Cart;
use App\Model\OrderModel;
use App\Model\UserModel;

/**
 * Validation et consultation d'une réservation (US CMD-a).
 *
 * Réservé au client connecté : son identifiant est lu dans la session, jamais
 * dans la requête. Le contenu de la réservation vient du panier de la session
 * et les prix de la base : le front n'envoie aucune donnée.
 */
final class OrderController
{
    /** Forme d'un numéro de réservation : MC-2026-00042. */
    private const NUMBER_PATTERN = '/^MC-\d{4}-\d{5,10}$/';

    /** Le modèle des réservations, fourni à la construction. */
    private OrderModel $orders;

    /** Le modèle des comptes, pour vérifier que le client existe toujours. */
    private UserModel $users;

    /**
     * @param OrderModel $orders Modèle des réservations.
     * @param UserModel  $users  Modèle des comptes clients.
     */
    public function __construct(OrderModel $orders, UserModel $users)
    {
        $this->orders = $orders;
        $this->users  = $users;
    }

    /**
     * POST /api/commandes : valide le panier de la session.
     *
     * Le panier est vidé dès la réservation créée. Un second envoi (double
     * clic) trouve donc un panier vide et ne crée pas de doublon : PHP
     * traite les requêtes d'une même session l'une après l'autre.
     *
     * Réponse 201 : { commande: { numero, statut, total, nombreArticles } }
     * Erreurs : 401 si le client n'est pas connecté, 400 si le panier est vide.
     */
    public function create(): void
    {
        $userId = $this->requireUserId();

        $items = $_SESSION[CartController::SESSION_KEY] ?? [];
        $cart  = new Cart(is_array($items) ? $items : []);

        if (count($cart->variantIds()) === 0) {
            Response::erreur('Votre panier est vide.', 400);
            return;
        }

        $order = $this->orders->createFromItems($userId, $cart->toArray());

        if ($order === null) {
            unset($_SESSION[CartController::SESSION_KEY]);
            Response::erreur('Les bijoux de votre panier ne sont plus proposés.', 400);
            return;
        }

        unset($_SESSION[CartController::SESSION_KEY]);
        Response::json(['commande' => $order], 201);
    }

    /**
     * GET /api/commande?numero=MC-2026-00042 : une réservation du client.
     *
     * Erreurs : 401 si le client n'est pas connecté, 400 si le numéro est mal
     * formé, 404 si la réservation n'existe pas ou appartient à un autre client
     * (même réponse : on ne révèle pas l'existence d'une réservation d'autrui).
     *
     * @param Request $request Requête entrante.
     */
    public function show(Request $request): void
    {
        $userId = $this->requireUserId();
        $number = $request->parametre('numero');

        if ($number === null || preg_match(self::NUMBER_PATTERN, $number) !== 1) {
            Response::erreur('Numéro de réservation invalide.', 400);
            return;
        }

        $order = $this->orders->findByNumberForUser($number, $userId);

        if ($order === null) {
            Response::erreur('Réservation introuvable.', 404);
            return;
        }

        Response::json(['commande' => $order]);
    }

    /**
     * Identifiant du client connecté ; sinon, répond 401 et termine.
     *
     * @return int
     */
    private function requireUserId(): int
    {
        $userId = $_SESSION[AccountController::SESSION_KEY] ?? null;

        if (!is_int($userId) || $this->users->findById($userId) === null) {
            Response::erreur('Connectez-vous pour accéder à vos réservations.', 401);
        }

        return $userId;
    }
}
