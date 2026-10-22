import { getRequest, postRequest } from "../lib/api-request.js";

/**
 * Catégories dans le back-office (US GOF-c).
 *
 * Toutes ces routes sont réservées aux administrateurs : sans connexion, le
 * serveur répond 401 (ErreurApi de statut 401). Le serveur revalide chaque
 * champ : un champ refusé donne un 400, une suppression d'une catégorie encore
 * utilisée un 409, avec un message destiné à l'écran.
 */
let AdminCategoryData = {};

/**
 * L'arbre des catégories avec les effectifs : GET /api/admin/categories
 *
 * { categories: [{ id, nom, slug, description, nombreSousCategories, nombreProduits,
 *   sousCategories: [{ id, nom, slug, description, nombreProduits }] }] }
 *
 * @returns {Promise<{categories: Array<Object>}>}
 */
AdminCategoryData.fetchAll = async function () {
  return getRequest("admin/categories");
};

/**
 * Crée une catégorie : POST /api/admin/categories/creer
 *
 * @param {{nom: string, description: string, parentId: number|null}} values - parentId vaut null pour une catégorie principale.
 * @returns {Promise<{categorie: {id: number, slug: string}}>}
 */
AdminCategoryData.create = async function (values) {
  return postRequest("admin/categories/creer", values);
};

/**
 * Modifie le nom et la description : POST /api/admin/categories/modifier
 *
 * @param {{id: number, nom: string, description: string}} values
 * @returns {Promise<{categorie: Object}>}
 */
AdminCategoryData.update = async function (values) {
  return postRequest("admin/categories/modifier", values);
};

/**
 * Monte ou descend une catégorie d'un cran : POST /api/admin/categories/deplacer
 *
 * @param {number} id - Identifiant de la catégorie.
 * @param {string} direction - « haut » ou « bas ».
 * @returns {Promise<{categories: Array<Object>}>} L'arbre à jour.
 */
AdminCategoryData.move = async function (id, direction) {
  return postRequest("admin/categories/deplacer", { id: id, sens: direction });
};

/**
 * Supprime une catégorie vide : POST /api/admin/categories/supprimer
 * Une catégorie qui contient encore des bijoux ou des sous-catégories lève une
 * ErreurApi de statut 409.
 *
 * @param {number} id - Identifiant de la catégorie.
 * @returns {Promise<{categories: Array<Object>}>} L'arbre à jour.
 */
AdminCategoryData.remove = async function (id) {
  return postRequest("admin/categories/supprimer", { id: id });
};

export { AdminCategoryData };
