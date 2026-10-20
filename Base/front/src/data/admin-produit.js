import { getRequest } from "../lib/api-request.js";

/**
 * Bijoux dans le back-office (US GOF-a).
 *
 * Toutes ces routes sont réservées aux administrateurs : sans connexion, le
 * serveur répond 401 (ErreurApi de statut 401).
 */
let AdminProductData = {};

/**
 * Tous les bijoux : GET /api/admin/produits
 *
 * { produits: [{ id, nom, slug, prix, stock, disponibilite, categorie,
 *   sousCategorie, image }], total }
 *
 * @returns {Promise<{produits: Array<Object>, total: number}>}
 */
AdminProductData.fetchAll = async function () {
  return getRequest("admin/produits");
};

export { AdminProductData };
