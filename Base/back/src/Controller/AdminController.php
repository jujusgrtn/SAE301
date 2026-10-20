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
 * Réponse commune : { connecte: true, admin: { nom, email } }
 */
final class AdminController extends AdminAreaController
{
    /**
     * Empreinte factice, vérifiée quand l'e-mail est inconnu : la réponse prend
     * alors le même temps qu'avec un e-mail existant, et ne révèle pas quels
     * e-mails ont un compte administrateur.
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
     * POST /api/admin/connexion : { email, motDePasse }.
     *
     * Erreurs : 400 si un champ manque, 401 si l'e-mail ou le mot de passe est
     * faux (sans dire lequel).
     *
     * @param Request $request Requête entrante.
     */
    public function login(Request $request): void
    {
        $body     = $request->corps();
        $email    = is_string($body['email'] ?? null) ? mb_strtolower(trim($body['email'])) : '';
        $password = $body['motDePasse'] ?? null;

        if ($email === '' || !is_string($password) || $password === '') {
            Response::erreur('Saisissez votre e-mail et votre mot de passe.', 400);
            return;
        }

        $admin = $this->admins->findByEmail($email);
        $hash  = $admin === null ? self::DUMMY_HASH : $admin['motDePasse'];

        if (!password_verify($password, $hash) || $admin === null) {
            Response::erreur('E-mail ou mot de passe incorrect.', 401);
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
            'admin'    => ['nom' => $admin['nom'], 'email' => $admin['email']],
        ]);
    }
}
