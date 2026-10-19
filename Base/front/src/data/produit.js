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

export { ProductData };
