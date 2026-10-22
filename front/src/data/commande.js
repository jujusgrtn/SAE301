import { getRequest, postRequest } from "../lib/api-request.js";

/**
 * Réservations click & collect (US CMD-a, SUI-b).
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
 * L'historique du client connecté : GET /api/commandes
 * Réponse : { commandes: [{ numero, statut, date, total, nombreArticles }], total, page, parPage, pages,
 *             effectifs: { 'en cours': n, 'disponible': n, 'retirée': n, 'annulée': n } }
 * Les effectifs portent sur toutes les réservations du client, filtres ou non (US SUI-b).
 * Sans connexion, le serveur répond 401 (ErreurApi de statut 401).
 *
 * @param {{statut: string|null, du: string|null, au: string|null, page: number}} filters
 *        Statut, jours de début et de fin inclus (AAAA-MM-JJ) et numéro de page ; null = pas de filtre.
 * @returns {Promise<Object>}
 */
OrderData.fetchHistory = async function (filters) {
  let params = new URLSearchParams();

  if (filters.statut !== null) {
    params.set("statut", filters.statut);
  }
  if (filters.du !== null) {
    params.set("du", filters.du);
  }
  if (filters.au !== null) {
    params.set("au", filters.au);
  }
  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }

  let query = params.toString();
  return getRequest(query === "" ? "commandes" : `commandes?${query}`);
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
