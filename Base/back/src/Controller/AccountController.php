<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\UserModel;

/**
 * Compte client : état de connexion, connexion, inscription et déconnexion
 * (US CMD-c).
 *
 * Seul l'identifiant du client est rangé en session ($_SESSION['clientId']) :
 * son identité est relue en base à chaque demande, et le client ne détient
 * que le cookie de session.
 *
 * Les comptes d'administration sont gérés à part par AdminController (GOF-b).
 *
 * Réponse commune : { connecte: bool, utilisateur: { prenom, nom, email } | null }
 */
final class AccountController
{
    /** Clé de l'identifiant du client dans $_SESSION. */
    public const SESSION_KEY = 'clientId';

    /** Longueur minimale du mot de passe à l'inscription. */
    private const PASSWORD_MIN_LENGTH = 8;

    /**
     * Longueur maximale, en octets : bcrypt ignore tout ce qui dépasse 72
     * octets, deux mots de passe ne différant qu'au-delà seraient confondus.
     */
    private const PASSWORD_MAX_BYTES = 72;

    /** Longueur maximale du prénom et du nom (colonnes VARCHAR(60)). */
    private const NAME_MAX_LENGTH = 60;

    /** Longueur maximale de l'e-mail (colonne VARCHAR(190)). */
    private const EMAIL_MAX_LENGTH = 190;

    /**
     * Empreinte factice, vérifiée quand l'e-mail est inconnu : la réponse prend
     * alors le même temps qu'avec un e-mail existant, et ne révèle pas quels
     * e-mails ont un compte.
     */
    private const DUMMY_HASH = '$2y$10$G608CcdOXR16quwM1zlCIexDlh/MgzctwjKUwjqoVeiq.KRkRwxW6';

    /** Le modèle qui interroge les comptes, fourni à la construction. */
    private UserModel $users;

    /**
     * @param UserModel $users Modèle des comptes clients.
     */
    public function __construct(UserModel $users)
    {
        $this->users = $users;
    }

    /**
     * GET /api/compte : le client connecté, s'il y en a un.
     *
     * Répond toujours 200 : ne pas être connecté est un état normal, pas une
     * erreur.
     */
    public function show(): void
    {
        $clientId = $_SESSION[self::SESSION_KEY] ?? null;
        $user     = is_int($clientId) ? $this->users->findById($clientId) : null;

        if ($user === null) {
            // Compte supprimé entre-temps : la session ne doit plus y faire référence.
            unset($_SESSION[self::SESSION_KEY]);
        }

        $this->respond($user);
    }

    /**
     * POST /api/compte/connexion : { email, motDePasse }.
     *
     * Erreurs : 400 si un champ manque, 401 si l'e-mail ou le mot de passe est
     * faux (sans dire lequel).
     *
     * @param Request $request Requête entrante.
     */
    public function login(Request $request): void
    {
        $body     = $request->corps();
        $email    = self::normalizeEmail($body['email'] ?? null);
        $password = $body['motDePasse'] ?? null;

        if ($email === '' || !is_string($password) || $password === '') {
            Response::erreur('Saisissez votre e-mail et votre mot de passe.', 400);
            return;
        }

        $user = $this->users->findByEmail($email);
        $hash = $user === null ? self::DUMMY_HASH : $user['motDePasse'];

        if (!password_verify($password, $hash) || $user === null) {
            Response::erreur('E-mail ou mot de passe incorrect.', 401);
            return;
        }

        unset($user['motDePasse']);
        $this->openSession($user['id']);
        $this->respond($user);
    }

    /**
     * POST /api/compte/inscription : { prenom, nom, email, motDePasse }.
     *
     * Le client est connecté dès son compte créé.
     *
     * Erreurs : 400 si un champ est invalide (message précis), 409 si l'e-mail
     * a déjà un compte.
     *
     * @param Request $request Requête entrante.
     */
    public function register(Request $request): void
    {
        $body      = $request->corps();
        $firstName = self::normalizeName($body['prenom'] ?? null);
        $lastName  = self::normalizeName($body['nom'] ?? null);
        $email     = self::normalizeEmail($body['email'] ?? null);
        $password  = $body['motDePasse'] ?? null;

        $error = self::validateRegistration($firstName, $lastName, $email, $password);

        if ($error !== null) {
            Response::erreur($error, 400);
            return;
        }

        $id = $this->users->create($firstName, $lastName, $email, password_hash($password, PASSWORD_BCRYPT));

        if ($id === null) {
            Response::erreur('Un compte existe déjà avec cet e-mail. Connectez-vous.', 409);
            return;
        }

        $this->openSession($id);
        Response::json([
            'connecte'    => true,
            'utilisateur' => ['prenom' => $firstName, 'nom' => $lastName, 'email' => $email],
        ], 201);
    }

    /**
     * POST /api/compte/deconnexion : ferme la session.
     *
     * Toute la session est détruite, panier compris : sur un poste partagé, le
     * client suivant ne retrouve rien du précédent.
     */
    public function logout(): void
    {
        $_SESSION = [];

        // Même chemin que celui réglé par index.php avant session_start().
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path'    => session_get_cookie_params()['path'],
        ]);
        session_destroy();

        $this->respond(null);
    }

    /**
     * Attache le client à la session, sous un identifiant de session neuf :
     * un identifiant connu avant la connexion ne donne plus accès au compte.
     * Le contenu de la session (le panier) est conservé.
     *
     * @param int $clientId Identifiant du compte.
     */
    private function openSession(int $clientId): void
    {
        session_regenerate_id(true);
        $_SESSION[self::SESSION_KEY] = $clientId;
    }

    /**
     * Envoie l'état de connexion, sans l'identifiant interne.
     *
     * @param array<string, mixed>|null $user Compte connecté, ou null.
     */
    private function respond(?array $user): void
    {
        Response::json([
            'connecte'    => $user !== null,
            'utilisateur' => $user === null
                ? null
                : ['prenom' => $user['prenom'], 'nom' => $user['nom'], 'email' => $user['email']],
        ]);
    }

    /**
     * Vérifie les champs de l'inscription, dans l'ordre du formulaire.
     *
     * @param string $firstName Prénom normalisé.
     * @param string $lastName  Nom normalisé.
     * @param string $email     E-mail normalisé.
     * @param mixed  $password  Mot de passe reçu.
     * @return string|null Message d'erreur pour l'utilisateur, ou null si tout est valide.
     */
    private static function validateRegistration(string $firstName, string $lastName, string $email, mixed $password): ?string
    {
        if ($firstName === '' || mb_strlen($firstName) > self::NAME_MAX_LENGTH) {
            return 'Saisissez votre prénom (' . self::NAME_MAX_LENGTH . ' caractères au plus).';
        }
        if ($lastName === '' || mb_strlen($lastName) > self::NAME_MAX_LENGTH) {
            return 'Saisissez votre nom (' . self::NAME_MAX_LENGTH . ' caractères au plus).';
        }
        if (strlen($email) > self::EMAIL_MAX_LENGTH || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return 'Saisissez une adresse e-mail valide.';
        }
        if (!is_string($password) || mb_strlen($password) < self::PASSWORD_MIN_LENGTH) {
            return 'Le mot de passe doit contenir au moins ' . self::PASSWORD_MIN_LENGTH . ' caractères.';
        }
        if (strlen($password) > self::PASSWORD_MAX_BYTES) {
            return 'Le mot de passe est trop long (' . self::PASSWORD_MAX_BYTES . ' octets au plus).';
        }

        return null;
    }

    /**
     * Prénom ou nom sans espaces superflus ; '' si la valeur n'est pas une chaîne.
     *
     * @param mixed $value Valeur reçue.
     * @return string
     */
    private static function normalizeName(mixed $value): string
    {
        return is_string($value) ? trim(preg_replace('/\s+/u', ' ', $value) ?? '') : '';
    }

    /**
     * E-mail sans espaces et en minuscules, pour qu'une même adresse ne
     * puisse pas ouvrir deux comptes ; '' si la valeur n'est pas une chaîne.
     *
     * @param mixed $value Valeur reçue.
     * @return string
     */
    private static function normalizeEmail(mixed $value): string
    {
        return is_string($value) ? mb_strtolower(trim($value)) : '';
    }
}
