<?php

declare(strict_types=1);

namespace App\Controller;

use App\Core\Request;
use App\Core\Response;
use App\Model\AdminCategoryModel;
use App\Model\AdminModel;
use App\Model\CategoryInUseException;
use App\Model\Slug;

/**
 * Gestion des catégories dans le back-office (US GOF-c).
 *
 * Chaque route vérifie d'abord l'accès administrateur (requireAdmin()), avant
 * toute lecture ou écriture. Les envois sont en JSON. Les routes qui
 * modifient l'arbre (déplacement, suppression) renvoient l'arbre à jour : le
 * front n'a pas à le recalculer.
 */
final class AdminCategoryController extends AdminAreaController
{
    /** Limites des champs : celles des colonnes SQL. */
    private const NAME_MAX_LENGTH        = 60;
    private const DESCRIPTION_MAX_LENGTH = 255;

    /** Sens de déplacement acceptés (liste blanche). */
    private const DIRECTIONS = ['haut', 'bas'];

    /** Le modèle des catégories du back-office, fourni à la construction. */
    private AdminCategoryModel $categories;

    /**
     * @param AdminModel         $admins     Modèle des comptes administrateurs.
     * @param AdminCategoryModel $categories Modèle des catégories du back-office.
     */
    public function __construct(AdminModel $admins, AdminCategoryModel $categories)
    {
        parent::__construct($admins);
        $this->categories = $categories;
    }

    /**
     * GET /api/admin/categories : l'arbre des catégories, avec les effectifs.
     *
     * Réponse : { categories: [{ id, nom, slug, description, nombreSousCategories,
     *             nombreProduits, sousCategories: [{ id, nom, slug, description, nombreProduits }] }] }
     * Erreur : 401 sans connexion administrateur.
     */
    public function index(): void
    {
        $this->requireAdmin();

        Response::json(['categories' => $this->categories->findTree()]);
    }

    /**
     * POST /api/admin/categories/creer : { nom, description?, parentId? }.
     * Sans parentId, crée une catégorie principale ; avec, une sous-catégorie.
     *
     * Réponse 201 : { categorie: { id, slug } }
     * Erreurs : 401 sans connexion administrateur, 400 si un champ est refusé
     * ou si parentId n'est pas une catégorie principale.
     *
     * @param Request $request Requête entrante.
     */
    public function create(Request $request): void
    {
        $this->requireAdmin();

        $body     = $request->corps();
        $fields   = $this->readFields($body);
        $parentId = null;

        if (array_key_exists('parentId', $body) && $body['parentId'] !== null && $body['parentId'] !== '') {
            $parentId = self::readInt($body['parentId']);

            if ($parentId === null) {
                Response::erreur('Catégorie principale invalide.', 400);
            }
        }

        $category = $this->categories->create($fields['nom'], $fields['description'], $parentId);

        if ($category === null) {
            Response::erreur('Choisissez une catégorie principale existante.', 400);
            return;
        }

        Response::json(['categorie' => $category], 201);
    }

    /**
     * POST /api/admin/categories/modifier : { id, nom, description? }.
     * Le slug et la place de la catégorie ne changent pas.
     *
     * Réponse : { categorie: { id, nom, slug, description } }
     * Erreurs : 401 sans connexion administrateur, 400 si un champ est refusé,
     * 404 si la catégorie n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function update(Request $request): void
    {
        $this->requireAdmin();

        $body   = $request->corps();
        $fields = $this->readFields($body);
        $id     = self::readInt($body['id'] ?? null);

        if ($id === null) {
            Response::erreur('Catégorie invalide.', 400);
            return;
        }

        $category = $this->categories->update($id, $fields['nom'], $fields['description']);

        if ($category === null) {
            Response::erreur('Cette catégorie n\'existe pas.', 404);
            return;
        }

        Response::json(['categorie' => $category]);
    }

    /**
     * POST /api/admin/categories/deplacer : { id, sens } avec sens = « haut » ou « bas ».
     * Échange la catégorie avec sa voisine du même niveau.
     *
     * Réponse : { categories: [...] } (l'arbre à jour)
     * Erreurs : 401 sans connexion administrateur, 400 si id ou sens est invalide,
     * 404 si la catégorie n'existe pas.
     *
     * @param Request $request Requête entrante.
     */
    public function move(Request $request): void
    {
        $this->requireAdmin();

        $body      = $request->corps();
        $id        = self::readInt($body['id'] ?? null);
        $direction = $body['sens'] ?? null;

        if ($id === null || !is_string($direction) || !in_array($direction, self::DIRECTIONS, true)) {
            Response::erreur('Déplacement invalide.', 400);
            return;
        }

        if (!$this->categories->move($id, $direction)) {
            Response::erreur('Cette catégorie n\'existe pas.', 404);
            return;
        }

        Response::json(['categories' => $this->categories->findTree()]);
    }

    /**
     * POST /api/admin/categories/supprimer : { id }.
     * Refusée tant que la catégorie contient des sous-catégories ou des bijoux.
     *
     * Réponse : { categories: [...] } (l'arbre à jour)
     * Erreurs : 401 sans connexion administrateur, 400 si id est invalide,
     * 404 si la catégorie n'existe pas, 409 si elle est encore utilisée.
     *
     * @param Request $request Requête entrante.
     */
    public function remove(Request $request): void
    {
        $this->requireAdmin();

        $id = self::readInt($request->corps()['id'] ?? null);

        if ($id === null) {
            Response::erreur('Catégorie invalide.', 400);
            return;
        }

        try {
            $isDeleted = $this->categories->delete($id);
        } catch (CategoryInUseException $e) {
            Response::erreur($e->getMessage(), 409);
            return;
        }

        if (!$isDeleted) {
            Response::erreur('Cette catégorie n\'existe pas.', 404);
            return;
        }

        Response::json(['categories' => $this->categories->findTree()]);
    }

    /**
     * Lit et valide le nom et la description. Répond 400 et termine le script
     * au premier champ refusé.
     *
     * @param array<string, mixed> $body Corps JSON décodé.
     * @return array{nom: string, description: string}
     */
    private function readFields(array $body): array
    {
        $name        = self::cleanLine($body['nom'] ?? null);
        $description = self::cleanLine($body['description'] ?? null);

        if ($name === '' || mb_strlen($name) > self::NAME_MAX_LENGTH) {
            Response::erreur('Saisissez le nom de la catégorie (' . self::NAME_MAX_LENGTH . ' caractères au plus).', 400);
        }
        if (Slug::fromText($name) === '') {
            Response::erreur('Le nom doit contenir au moins une lettre ou un chiffre.', 400);
        }
        if (mb_strlen($description) > self::DESCRIPTION_MAX_LENGTH) {
            Response::erreur('La description est trop longue (' . self::DESCRIPTION_MAX_LENGTH . ' caractères au plus).', 400);
        }

        return ['nom' => $name, 'description' => $description];
    }

    /**
     * Texte d'une ligne : sans espaces superflus ; '' si la valeur n'est pas une chaîne.
     *
     * @param mixed $value Valeur reçue.
     * @return string
     */
    private static function cleanLine(mixed $value): string
    {
        return is_string($value) ? trim(preg_replace('/\s+/u', ' ', $value) ?? '') : '';
    }

    /**
     * Entier positif ou nul : un nombre entier, ou une chaîne de chiffres.
     * Toute autre valeur donne null.
     *
     * @param mixed $value Valeur reçue (JSON).
     * @return int|null
     */
    private static function readInt(mixed $value): ?int
    {
        if (is_int($value) && $value >= 0) {
            return $value;
        }
        if (is_string($value) && preg_match('/^\d{1,9}$/', $value) === 1) {
            return (int) $value;
        }

        return null;
    }
}
