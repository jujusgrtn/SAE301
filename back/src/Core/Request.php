<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Représente la requête HTTP entrante.
 *
 * Les cookies ne passent pas par cette classe : les contrôleurs lisent
 * $_COOKIE et appellent setcookie() directement.
 */
final class Request
{
    /** Méthode HTTP, en majuscules : GET, POST… */
    private string $methode;

    /** Chemin demandé, à partir de /api/. */
    private string $chemin;

    /** Paramètres de la chaîne de requête ($_GET). */
    private array $parametres;

    /** Corps de la requête : le JSON reçu, ou les champs d'un formulaire multipart. */
    private array $corps;

    /** Fichiers envoyés par un formulaire multipart ($_FILES). */
    private array $fichiers;

    /** Vrai si PHP a rejeté l'envoi, par exemple au-delà de post_max_size. */
    private bool $envoiRefuse;

    private function __construct(
        string $methode,
        string $chemin,
        array $parametres,
        array $corps,
        array $fichiers,
        bool $envoiRefuse
    ) {
        $this->methode     = $methode;
        $this->chemin      = $chemin;
        $this->parametres  = $parametres;
        $this->corps       = $corps;
        $this->fichiers    = $fichiers;
        $this->envoiRefuse = $envoiRefuse;
    }

    /**
     * Construit la requête à partir des variables du serveur.
     */
    public static function depuisGlobals(): self
    {
        // Deux opérateurs voisins, à ne pas confondre :
        //   ?? se déclenche si la valeur de gauche n'existe pas (ou vaut null) ;
        //   ?: se déclenche si elle existe mais est « fausse » — ici parse_url()
        //      renvoie false quand l'URL est inexploitable.
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

        // L'application est déployée dans un sous-dossier, donc l'URL reçue
        // ressemble à /~votre_login/SAE301-Starter/api/films. On ne conserve que la partie
        // qui nous concerne, à partir du marqueur /api/.
        $position = strpos($uri, '/api/');
        $chemin   = $position === false ? '/' : substr($uri, $position);

        $corps       = [];
        $fichiers    = [];
        $envoiRefuse = false;

        if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));

            if (str_starts_with($type, 'multipart/form-data')) {
                // PHP a déjà décodé le formulaire. Si le corps dépasse
                // post_max_size, il vide $_POST et $_FILES sans prévenir : on le
                // détecte à leur vide malgré un corps annoncé.
                $corps       = $_POST;
                $fichiers    = $_FILES;
                $envoiRefuse = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0 && $_POST === [] && $_FILES === [];
            } else {
                $brut   = file_get_contents('php://input') ?: '';
                $decode = json_decode($brut, true);
                $corps  = is_array($decode) ? $decode : [];
            }
        }

        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            $chemin,
            $_GET,
            $corps,
            $fichiers,
            $envoiRefuse,
        );
    }

    public function methode(): string
    {
        return $this->methode;
    }

    public function chemin(): string
    {
        return $this->chemin;
    }

    /**
     * Un paramètre de la chaîne de requête (?page=2).
     */
    public function parametre(string $cle, ?string $defaut = null): ?string
    {
        $valeur = $this->parametres[$cle] ?? null;

        return is_string($valeur) ? $valeur : $defaut;
    }

    /**
     * Le corps JSON de la requête, décodé en tableau associatif.
     */
    public function corps(): array
    {
        return $this->corps;
    }

    /**
     * Un fichier envoyé par un formulaire multipart (US GOF-a).
     *
     * @param string $cle Nom du champ de fichier.
     * @return array{name: string, type: string, tmp_name: string, error: int, size: int}|null
     *         Les informations de PHP, ou null si le champ est absent. Un champ
     *         laissé vide donne error = UPLOAD_ERR_NO_FILE.
     */
    public function fichier(string $cle): ?array
    {
        $fichier = $this->fichiers[$cle] ?? null;

        return is_array($fichier) && is_int($fichier['error'] ?? null) && is_string($fichier['tmp_name'] ?? null)
            ? $fichier
            : null;
    }

    /**
     * Indique si PHP a rejeté l'envoi parce qu'il dépassait la taille permise
     * (post_max_size). Les champs et les fichiers sont alors tous perdus.
     *
     * @return bool
     */
    public function envoiRefuse(): bool
    {
        return $this->envoiRefuse;
    }

    /**
     * Identifiant de route, par exemple « GET /api/films ».
     */
    public function signature(): string
    {
        return $this->methode . ' ' . $this->chemin;
    }
}
