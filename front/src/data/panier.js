import { getRequest, postRequest } from "../lib/api-request.js";

/**
 * Panier d'achat (US CMD-b), conservé en session par le serveur.
 *
 * Chaque appel renvoie le panier complet, recalculé par le serveur :
 * { lignes: [{ variantId, libelle, prixUnitaire, quantite, sousTotal,
 *              produit: { nom, slug, image } }],
 *   nombreArticles, total }
 * Le front n'envoie que des identifiants de variante et des quantités : il ne
 * transmet jamais de prix.
 */
let CartData = {};

/**
 * Nom de l'événement émis sur document après une modification du panier.
 * Le layout l'écoute pour mettre à jour le compteur de l'en-tête.
 * detail : { nombreArticles }
 */
const CART_CHANGED_EVENT = "panier:modifie";

/**
 * Le contenu du panier : GET /api/panier
 *
 * @returns {Promise<Object>}
 */
CartData.fetch = async function () {
  return getRequest("panier");
};

/**
 * Ajoute des exemplaires d'une variante : POST /api/panier/ajouter
 *
 * @param {number} variantId - Identifiant de la variante.
 * @param {number} quantity - Nombre d'exemplaires à ajouter.
 * @returns {Promise<Object>}
 */
CartData.add = async function (variantId, quantity) {
  return postRequest("panier/ajouter", { variantId: variantId, quantite: quantity });
};

/**
 * Fixe la quantité d'une ligne : POST /api/panier/modifier
 *
 * @param {number} variantId - Identifiant de la variante.
 * @param {number} quantity - Nouvelle quantité (0 retire la ligne).
 * @returns {Promise<Object>}
 */
CartData.update = async function (variantId, quantity) {
  return postRequest("panier/modifier", { variantId: variantId, quantite: quantity });
};

/**
 * Retire une ligne : POST /api/panier/retirer
 *
 * @param {number} variantId - Identifiant de la variante.
 * @returns {Promise<Object>}
 */
CartData.remove = async function (variantId) {
  return postRequest("panier/retirer", { variantId: variantId });
};

export { CartData, CART_CHANGED_EVENT };
