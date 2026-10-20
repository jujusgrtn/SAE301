import { getRequest, postRequest } from "../lib/api-request.js";

/**
 * Réservations click & collect (US CMD-a).
 *
 * Le front n'envoie rien à la validation : le serveur lit le panier de la
 * session et les prix en base. Il faut être connecté (sinon ErreurApi 401).
 */
let OrderData = {};

/**
 * Valide le panier de la session : POST /api/commandes
 * Réponse : { commande: { numero, statut, total, nombreArticles } }
 *
 * @returns {Promise<Object>}
 */
OrderData.create = async function () {
  return postRequest("commandes");
};

/**
 * Une réservation du client connecté : GET /api/commande?numero=…
 * Réponse : { commande: { numero, statut, date, total, lignes } }
 * Une réservation inconnue (ou d'un autre client) lève une ErreurApi 404.
 *
 * @param {string} number - Numéro de réservation, par exemple MC-2026-00042.
 * @returns {Promise<Object>}
 */
OrderData.fetchByNumber = async function (number) {
  return getRequest(`commande?numero=${encodeURIComponent(number)}`);
};

export { OrderData };
