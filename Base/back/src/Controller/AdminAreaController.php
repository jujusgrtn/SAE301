<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Response;
use App\Model\AdminModel;

/**
 * Base commune des contrôleurs du back-office (US GOF-b).
 *
 * Toute route /api/admin/... protégée appelle requireAdmin() avant d'agir :
 * l'accès est décidé ici, côté serveur, à partir de la session et de la base,
 * jamais à partir de ce que le front affiche. Les contrôleurs de GOF-a, GOF-c
 * et PIL-b hériteront de cette classe.
 */
abstract class AdminAreaController
{
    /** Clé de l'identifiant de l'administrateur dans $_SESSION. */
    public const SESSION_KEY = 'adminId';

    /** Le modèle des administrateurs, fourni à la construction. */
    protected AdminModel $admins;

    /**
     * @param AdminModel $admins Modèle des comptes administrateurs.
     */
    public function __construct(AdminModel $admins)
    {
        $this->admins = $admins;
    }

    /**
     * L'administrateur connecté, relu en base ; répond 401 et termine le
     * script s'il n'y en a pas.
     *
     * Relire la base à chaque requête fait qu'un compte supprimé perd l'accès
     * immédiatement, même si sa session est encore ouverte.
     *
     * @return array{id: int, nom: string, email: string}
     */
    protected function requireAdmin(): array
    {
        $adminId = $_SESSION[self::SESSION_KEY] ?? null;
        $admin   = is_int($adminId) ? $this->admins->findById($adminId) : null;

        if ($admin === null) {
            unset($_SESSION[self::SESSION_KEY]);
            Response::erreur('Connectez-vous avec un compte administrateur.', 401);
        }

        return $admin;
    }
}
