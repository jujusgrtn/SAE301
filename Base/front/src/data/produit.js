import { getRequest } from "../lib/api-request.js";

let ProductData = {};

/**
 * Tous les bijoux du catalogue : GET /api/produits (US DEC-b).
 *
 * La réponse contient les bijoux et leur nombre :
 * { produits: [{ id, nom, slug, prix, categorie, sousCategorie, image }], total }
 * Une erreur HTTP est levée sous forme d'ErreurApi (voir lib/api-request.js).
 *
 * @returns {Promise<{produits: Array<Object>, total: number}>}
 */
ProductData.fetchAll = async function () {
  return getRequest("produits");
};

/**
 * Les bijoux d'une catégorie : GET /api/produits?categorie=slug (US DEC-a).
 *
 * La réponse contient la catégorie, de quoi construire sa navigation, et ses
 * bijoux : { categorie, parent, sousCategories, produits, total }
 * Une catégorie inconnue lève une ErreurApi de statut 404.
 *
 * @param {string} slug - Slug de la catégorie, tel qu'il apparaît dans l'URL.
 * @returns {Promise<Object>}
 */
ProductData.fetchByCategory = async function (slug) {
  return getRequest(`produits?categorie=${encodeURIComponent(slug)}`);
};

/**
 * La fiche d'un bijou : GET /api/produit?slug=… (US DEC-c).
 *
 * La réponse contient le bijou et toutes ses photos :
 * { produit: { id, nom, slug, prix, description, categorie, sousCategorie, images } }
 * Un bijou inconnu lève une ErreurApi de statut 404.
 *
 * @param {string} slug - Slug du bijou, tel qu'il apparaît dans l'URL.
 * @returns {Promise<{produit: Object}>}
 */
ProductData.fetchBySlug = async function (slug) {
  return getRequest(`produit?slug=${encodeURIComponent(slug)}`);
};

export { ProductData };
