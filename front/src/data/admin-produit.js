import { getRequest, postRequest, postFormRequest } from "../lib/api-request.js";

/**
 * Bijoux dans le back-office (US GOF-a).
 *
 * Toutes ces routes sont réservées aux administrateurs : sans connexion, le
 * serveur répond 401 (ErreurApi de statut 401). Le serveur revalide chaque
 * champ : un champ refusé donne un 400 dont le message est destiné à l'écran.
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

/**
 * Un bijou, pour le formulaire de modification : GET /api/admin/produit?id=…
 *
 * { produit: { id, nom, slug, description, prix, stock, sousCategorie: { nom, slug },
 *   nombreVariantes, image } }
 * Un bijou inconnu lève une ErreurApi de statut 404.
 *
 * @param {number} id - Identifiant du bijou.
 * @returns {Promise<{produit: Object}>}
 */
AdminProductData.fetchOne = async function (id) {
  return getRequest(`admin/produit?id=${encodeURIComponent(id)}`);
};

/**
 * Crée un bijou : POST /api/admin/produits/creer
 *
 * @param {FormData} formData - Champs nom, description, prix, publicCible, stock, sousCategorie,
 *   et facultativement photo (fichier) et altPhoto.
 * @returns {Promise<{produit: {id: number, slug: string}}>}
 */
AdminProductData.create = async function (formData) {
  return postFormRequest("admin/produits/creer", formData);
};

/**
 * Modifie un bijou : POST /api/admin/produits/modifier
 *
 * @param {FormData} formData - Les mêmes champs que pour la création, plus id. Un bijou à options
 *   envoie `stocks[<id de la variante>]` pour chaque combinaison, au lieu de `stock` (US OPT-b).
 * @returns {Promise<{produit: Object}>} Le bijou à jour.
 */
AdminProductData.update = async function (formData) {
  return postFormRequest("admin/produits/modifier", formData);
};

/**
 * Supprime un bijou, ses variantes et ses photos : POST /api/admin/produits/supprimer
 *
 * @param {number} id - Identifiant du bijou.
 * @returns {Promise<{supprime: boolean}>}
 */
AdminProductData.remove = async function (id) {
  return postRequest("admin/produits/supprimer", { id: id });
};

export { AdminProductData };
