import { getRequest, postRequest } from "../lib/api-request.js";

/**
 * Réservations dans le back-office (US PIL-b).
 *
 * Toutes ces routes sont réservées aux administrateurs : sans connexion, le
 * serveur répond 401 (ErreurApi de statut 401). Un changement de statut non
 * permis donne un 409 dont le message est destiné à l'écran.
 */
let AdminOrderData = {};

/**
 * Les réservations de tous les clients : GET /api/admin/commandes
 *
 * { commandes: [{ numero, statut, date, total, nombreArticles, client: { prenom, nom, email } }],
 *   total, effectifs: { 'en cours': n, 'disponible': n, 'retirée': n, 'annulée': n } }
 * Les effectifs portent sur toutes les réservations, même quand un filtre est appliqué.
 *
 * @param {string|null} status - Un des quatre statuts, ou null pour toutes.
 * @returns {Promise<Object>}
 */
AdminOrderData.fetchAll = async function (status) {
  return getRequest(status === null ? "admin/commandes" : `admin/commandes?statut=${encodeURIComponent(status)}`);
};

/**
 * Une réservation avec ses lignes : GET /api/admin/commande?numero=…
 *
 * { commande: { numero, statut, date, total, nombreArticles, client,
 *   transitions: [statuts possibles], lignes: [{ nomProduit, prixUnitaire, quantite, sousTotal }] } }
 * Une réservation inconnue lève une ErreurApi de statut 404.
 *
 * @param {string} number - Numéro de réservation, par exemple MC-2026-00042.
 * @returns {Promise<{commande: Object}>}
 */
AdminOrderData.fetchOne = async function (number) {
  return getRequest(`admin/commande?numero=${encodeURIComponent(number)}`);
};

/**
 * Change le statut : POST /api/admin/commandes/statut
 * Annuler rend au stock ce que la réservation en avait retiré (stockRendu).
 * Un passage non permis lève une ErreurApi de statut 409.
 *
 * @param {string} number - Numéro de réservation.
 * @param {string} status - Nouveau statut : « disponible », « retirée » ou « annulée ».
 * @returns {Promise<{commande: Object, stockRendu: number}>}
 */
AdminOrderData.changeStatus = async function (number, status) {
  return postRequest("admin/commandes/statut", { numero: number, statut: status });
};

export { AdminOrderData };
