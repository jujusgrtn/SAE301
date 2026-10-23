<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\AdminModel;
use App\Model\AdminPromoModel;
use App\Model\Promo;

/**
 * Gestion des codes promotionnels dans le back-office (US PRO-b).
 *
 * Chaque route vérifie d'abord l'accès administrateur. Toutes renvoient la liste à
 * jour des codes avec leurs statistiques : l'écran n'a qu'à la remplacer.
 */
final class AdminPromoController extends AdminAreaController
{
    /** Le modèle des codes, fourni à la construction. */
    private AdminPromoModel $promos;

    /**
     * @param AdminModel      $admins Modèle des comptes administrateurs.
     * @param AdminPromoModel $promos Modèle des codes promotionnels.
     */
    public function __construct(AdminModel $admins, AdminPromoModel $promos)
    {
        parent::__construct($admins);
        $this->promos = $promos;
    }

    /**
     * GET /api/admin/codes-promo : les codes avec leurs statistiques d'utilisation.
     *
     * Réponse : { codes: [{ id, code, pourcentage, actif, utilisations, annulees, reductionTotale,
     *             montantReserve }], supprimes: { utilisations, reductionTotale } }
     * Erreur : 401 sans connexion administrateur.
     */
    public function index(): void
    {
        $this->requireAdmin();

        $this->respond();
    }

    /**
     * POST /api/admin/codes-promo/creer : { code, pourcentage, actif? } crée un code.
     *
     * Le code est enregistré en majuscules. `actif` vaut vrai par défaut.
     *
     * Réponse 201 : la liste à jour (comme GET /api/admin/codes-promo).
     * Erreurs : 401 sans connexion administrateur, 400 si le code ou le pourcentage est refusé,
     * 409 si ce code existe déjà.
     *
     * @param Request $request Requête entrante.
     */
    public function create(Request $request): void
    {
        $this->requireAdmin();

        $body       = $request->corps();
        $code       = Promo::normalizeCode($body['code'] ?? null);
        $percentage = self::readPercentage($body['pourcentage'] ?? null);

        if ($code === '') {
            Response::erreur('Saisissez un code de ' . Promo::CODE_MAX_LENGTH . ' caractères au plus : lettres, chiffres, tiret ou tiret bas.', 400);
            return;
        }
        if ($percentage === null) {
            Response::erreur('Le pourcentage doit être un entier de 1 à 100.', 400);
            return;
        }

        if ($this->promos->create($code, $percentage, ($body['actif'] ?? true) === true) === null) {
            Response::erreur('Ce code existe déjà.', 409);
            return;
        }

        $this->respond(201);
    }

    /**
     * POST /api/admin/codes-promo/modifier : { id, pourcentage, actif } modifie un code.
     * Le texte du code ne change pas.
     *
     * Réponse : la liste à jour.
     * Erreurs : 401 sans connexion administrateur, 400 si l'identifiant ou le pourcentage est invalide,
     * 404 si le code n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function update(Request $request): void
    {
        $this->requireAdmin();

        $body       = $request->corps();
        $id         = self::readId($body['id'] ?? null);
        $percentage = self::readPercentage($body['pourcentage'] ?? null);

        if ($id === null) {
            Response::erreur('Code invalide.', 400);
            return;
        }
        if ($percentage === null) {
            Response::erreur('Le pourcentage doit être un entier de 1 à 100.', 400);
            return;
        }
        if (!$this->promos->update($id, $percentage, ($body['actif'] ?? false) === true)) {
            Response::erreur('Ce code n\'existe pas.', 404);
            return;
        }

        $this->respond();
    }

    /**
     * POST /api/admin/codes-promo/supprimer : { id } supprime un code. Les réservations
     * passées gardent leur réduction.
     *
     * Réponse : la liste à jour.
     * Erreurs : 401 sans connexion administrateur, 400 si l'identifiant est invalide, 404 si le code n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function remove(Request $request): void
    {
        $this->requireAdmin();

        $id = self::readId($request->corps()['id'] ?? null);

        if ($id === null) {
            Response::erreur('Code invalide.', 400);
            return;
        }
        if (!$this->promos->delete($id)) {
            Response::erreur('Ce code n\'existe pas.', 404);
            return;
        }

        $this->respond();
    }

    /**
     * Envoie la liste des codes à jour.
     *
     * @param int $status Code HTTP de la réponse.
     */
    private function respond(int $status = 200): void
    {
        header('Cache-Control: no-store');
        Response::json(['codes' => $this->promos->findAll(), 'supprimes' => $this->promos->findDeletedUsage()], $status);
    }

    /**
     * Un pourcentage entier de 1 à 100 (nombre ou chaîne de chiffres).
     *
     * @param mixed $value Valeur reçue.
     * @return int|null Null si la valeur est refusée.
     */
    private static function readPercentage(mixed $value): ?int
    {
        $number = is_int($value) ? $value : (is_string($value) && preg_match('/^\d{1,3}$/', $value) === 1 ? (int) $value : null);

        return $number !== null && $number >= 1 && $number <= 100 ? $number : null;
    }

    /**
     * Un identifiant entier positif.
     *
     * @param mixed $value Valeur reçue.
     * @return int|null Null si la valeur est refusée.
     */
    private static function readId(mixed $value): ?int
    {
        if (is_int($value) && $value > 0) {
            return $value;
        }

        return is_string($value) && preg_match('/^[1-9]\d{0,5}$/', $value) === 1 ? (int) $value : null;
    }
}
