<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;

/**
 * Accès au back-office : administrateur connecté, connexion et déconnexion
 * (US GOF-b).
 *
 * Seul l'identifiant de l'administrateur est rangé en session
 * ($_SESSION['adminId']), à côté d'une éventuelle session client : les deux
 * connexions sont indépendantes.
 *
 * Réponse commune : { connecte: true, admin: { identifiant } }
 */
final class AdminController extends AdminAreaController
{
    /**
     * Empreinte factice, vérifiée quand l'identifiant est inconnu : la réponse
     * prend alors le même temps qu'avec un identifiant existant, et ne révèle
     * pas quels identifiants existent.
     */
    private const DUMMY_HASH = '$2y$12$Cyu45dhPbzbdQZDeOfDTCObrDT27LoStZejzAikQEKCj3BwC277ry';

    /**
     * GET /api/admin/compte : l'administrateur connecté.
     *
     * Erreur : 401 sans connexion administrateur. Le front s'en sert pour
     * afficher le formulaire de connexion.
     */
    public function show(): void
    {
        $this->respond($this->requireAdmin());
    }

    /**
     * POST /api/admin/connexion : { identifiant, motDePasse }.
     *
     * Erreurs : 400 si un champ manque, 401 si l'identifiant ou le mot de passe
     * est faux (sans dire lequel).
     *
     * @param Request $request Requête entrante.
     */
    public function login(Request $request): void
    {
        $body     = $request->corps();
        $login    = is_string($body['identifiant'] ?? null) ? trim($body['identifiant']) : '';
        $password = $body['motDePasse'] ?? null;

        if ($login === '' || !is_string($password) || $password === '') {
            Response::erreur('Saisissez votre identifiant et votre mot de passe.', 400);
            return;
        }

        $admin = $this->admins->findByLogin($login);
        $hash  = $admin === null ? self::DUMMY_HASH : $admin['motDePasse'];

        if (!password_verify($password, $hash) || $admin === null) {
            Response::erreur('Identifiant ou mot de passe incorrect.', 401);
            return;
        }

        // Élévation de privilège : identifiant de session neuf, l'ancien est
        // détruit et ne donne plus accès au back-office.
        session_regenerate_id(true);
        $_SESSION[self::SESSION_KEY] = $admin['id'];

        $this->respond($admin);
    }

    /**
     * POST /api/admin/deconnexion : retire l'accès au back-office.
     *
     * Seul l'administrateur quitte la session : un panier ou une connexion
     * client ouverts dans le même navigateur sont conservés.
     */
    public function logout(): void
    {
        unset($_SESSION[self::SESSION_KEY]);
        session_regenerate_id(true);

        Response::json(['connecte' => false, 'admin' => null]);
    }

    /**
     * Envoie l'administrateur connecté, sans l'identifiant interne ni l'empreinte.
     *
     * @param array<string, mixed> $admin Administrateur connecté.
     */
    private function respond(array $admin): void
    {
        Response::json([
            'connecte' => true,
            'admin'    => ['identifiant' => $admin['identifiant']],
        ]);
    }
}
