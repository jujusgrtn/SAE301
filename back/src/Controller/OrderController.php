<?php

declare(strict_types=1);

namespace App\Controller;

use DateTimeImmutable;
use App\Core\Request;
use App\Core\Response;
use App\Model\Cart;
use App\Model\OrderModel;
use App\Model\OrderStatus;
use App\Model\PromoModel;
use App\Model\Reorder;
use App\Model\StockException;
use App\Model\UserModel;
use App\Model\VariantModel;

/**
 * Validation, historique, consultation et réutilisation des réservations
 * (US CMD-a, SUI-c, SUI-a).
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

    /** Le modèle des variantes, pour relire prix et stock du panier après un transfert. */
    private VariantModel $variants;

    /** Le modèle des codes promotionnels, pour revérifier le code à la validation. */
    private PromoModel $promos;

    /**
     * @param OrderModel   $orders   Modèle des réservations.
     * @param UserModel    $users    Modèle des comptes clients.
     * @param VariantModel $variants Modèle des variantes.
     * @param PromoModel   $promos   Modèle des codes promotionnels.
     */
    public function __construct(OrderModel $orders, UserModel $users, VariantModel $variants, PromoModel $promos)
    {
        $this->orders   = $orders;
        $this->users    = $users;
        $this->variants = $variants;
        $this->promos   = $promos;
    }

    /**
     * POST /api/commandes : valide le panier de la session.
     *
     * Le panier est vidé dès la réservation créée. Un second envoi (double
     * clic) trouve donc un panier vide et ne crée pas de doublon : PHP
     * traite les requêtes d'une même session l'une après l'autre.
     *
     * Si un code promotionnel est appliqué au panier (US PRO-a), il est revérifié ici :
     * la réservation enregistre le code, son pourcentage et la réduction accordée.
     *
     * Réponse 201 : { commande: { numero, statut, total, reduction, codePromo, nombreArticles } }
     * Erreurs : 401 si le client n'est pas connecté, 400 si le panier est vide,
     * 409 si une ligne dépasse le stock (STK-c) ou si le code promo n'est plus valable
     * (il est alors retiré du panier et rien n'est enregistré).
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

        $promo = null;
        $code  = $_SESSION[CartController::PROMO_SESSION_KEY] ?? null;

        if (is_string($code)) {
            $promo = $this->promos->findActiveByCode($code);

            if ($promo === null) {
                unset($_SESSION[CartController::PROMO_SESSION_KEY]);
                Response::erreur('Votre code promo n\'est plus valable : il a été retiré. Vérifiez le total, puis validez à nouveau.', 409);
                return;
            }
        }

        try {
            $order = $this->orders->createFromItems($userId, $cart->toArray(), $promo);
        } catch (StockException $e) {
            // Le panier est conservé : le client l'ajuste puis revalide.
            Response::erreur($e->getMessage(), 409);
            return;
        }

        if ($order === null) {
            unset($_SESSION[CartController::SESSION_KEY]);
            Response::erreur('Les bijoux de votre panier ne sont plus proposés.', 400);
            return;
        }

        unset($_SESSION[CartController::SESSION_KEY], $_SESSION[CartController::PROMO_SESSION_KEY]);
        Response::json(['commande' => $order], 201);
    }

    /**
     * GET /api/commandes (?statut=…&du=…&au=…&page=…) : l'historique du client.
     *
     * Les réservations du client connecté, les plus récentes d'abord, dix par
     * page. `du` et `au` (AAAA-MM-JJ, jours inclus) bornent la date de validation.
     *
     * Réponse : { commandes: [{ numero, statut, date, total, nombreArticles }],
     *             total, page, parPage, pages,
     *             effectifs: { 'en cours': n, 'disponible': n, 'retirée': n, 'annulée': n } }
     * Les effectifs portent sur toutes les réservations du client, filtre ou non.
     * Erreurs : 401 si le client n'est pas connecté, 400 si le statut, une date ou la page est
     * invalide, ou si `du` est après `au`.
     *
     * @param Request $request Requête entrante.
     */
    public function index(Request $request): void
    {
        $userId = $this->requireUserId();

        $status = $request->parametre('statut');
        if ($status !== null && !OrderStatus::isValid($status)) {
            Response::erreur('Statut inconnu.', 400);
            return;
        }

        $from  = $this->readDate($request, 'du');
        $until = $this->readDate($request, 'au');
        if ($from === false || $until === false) {
            Response::erreur('Date invalide : utilisez le format AAAA-MM-JJ.', 400);
            return;
        }
        if ($from !== null && $until !== null && $from > $until) {
            Response::erreur('La date de début doit précéder la date de fin.', 400);
            return;
        }

        $page = $request->parametre('page') ?? '1';
        if (preg_match('/^[1-9]\d{0,5}$/', $page) !== 1) {
            Response::erreur('Numéro de page invalide.', 400);
            return;
        }

        Response::json(
            $this->orders->findPageForUser($userId, $status, $from, $until, (int) $page)
            + ['effectifs' => $this->orders->countByStatusForUser($userId)]
        );
    }

    /**
     * POST /api/commandes/reutiliser : { numero } transfère une ancienne
     * réservation du client dans son panier (« Commander à nouveau »).
     *
     * Le panier existant est conservé : les exemplaires s'y ajoutent. Seul ce
     * qui est disponible est transféré (voir Reorder) ; le reste est signalé
     * ligne par ligne, sans erreur. L'option choisie à l'époque est conservée
     * (la ligne désigne sa variante) et les prix sont ceux d'aujourd'hui. La
     * disponibilité définitive est revérifiée à la validation du panier.
     *
     * Réponse : { panier: { lignes, nombreArticles, total, estReservable },
     *             resultat: { lignes: [...], articlesDemandes, articlesAjoutes } }
     * Erreurs : 401 si le client n'est pas connecté, 400 si le numéro est mal formé,
     * 404 si la réservation n'existe pas ou appartient à un autre client.
     *
     * @param Request $request Requête entrante.
     */
    public function reorder(Request $request): void
    {
        $userId = $this->requireUserId();
        $number = $request->corps()['numero'] ?? null;

        if (!is_string($number) || preg_match(self::NUMBER_PATTERN, $number) !== 1) {
            Response::erreur('Numéro de réservation invalide.', 400);
            return;
        }

        $lines = $this->orders->findLinesForReorder($number, $userId);

        if ($lines === null) {
            Response::erreur('Réservation introuvable.', 404);
            return;
        }

        $items = $_SESSION[CartController::SESSION_KEY] ?? [];
        $cart  = new Cart(is_array($items) ? $items : []);

        $results = Reorder::apply($cart, $lines);

        $variants = $this->variants->findForCart($cart->variantIds());
        $cart->keepOnly(array_keys($variants));
        $_SESSION[CartController::SESSION_KEY] = $cart->toArray();

        Response::json([
            'panier'   => $cart->summarize($variants),
            'resultat' => [
                'lignes'           => $results,
                'articlesDemandes' => array_sum(array_column($results, 'quantiteDemandee')),
                'articlesAjoutes'  => array_sum(array_column($results, 'quantiteAjoutee')),
            ],
        ]);
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
     * Lit un paramètre de date AAAA-MM-JJ.
     *
     * @param Request $request Requête entrante.
     * @param string  $name    Nom du paramètre.
     * @return string|false|null La date si elle est valide, null si le paramètre est absent ou vide, false si elle est invalide.
     */
    private function readDate(Request $request, string $name): string|false|null
    {
        $value = $request->parametre($name);

        if ($value === null || $value === '') {
            return null;
        }

        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        // La comparaison avec format() refuse 2026-02-31, que createFromFormat accepterait en le décalant.
        return $date !== false && $date->format('Y-m-d') === $value ? $value : false;
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
