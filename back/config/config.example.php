<?php

declare(strict_types=1);

/**
 * Modèle de configuration : copier ce fichier en config.php (non versionné)
 * et y renseigner les vrais identifiants.
 *
 * Configuration de l'application.
 *
 * Les valeurs « a_completer » sont les identifiants de VOTRE base de données,
 * celle dans laquelle vous avez importé sql/import.sql. Tant qu'elles ne sont
 * pas renseignées, le catalogue restera vide.
 *
 * Sur le serveur de l'IUT, ce sont les identifiants MySQL qui vous ont été
 * communiqués, et « hote » reste « localhost » : la base est sur la même machine
 * que le serveur web.
 */

return [
    // Chemin du projet sur le serveur, avec la barre finale. C'est le chemin
    // des cookies (préférences et session) : avec « / », ils partiraient vers
    // les espaces de tous les autres utilisateurs du serveur.
    // Il doit être identique à BASE dans front/vite.config.js.
    'chemin' => '/~votre_login/SAE301-Starter/',

    'bdd' => [
        'hote'        => 'localhost',
        'port'        => 3306,
        'base'        => 'a_completer', 
        'utilisateur' => 'a_completer',
        'motdepasse'  => 'a_completer',
    ],

    // En développement, les erreurs sont détaillées dans la réponse JSON.
    // À passer à false en production.
    'debug' => true,
];
