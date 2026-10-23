import { getRequest } from "../lib/api-request.js";

/**
 * Journal des modifications des administrateurs (US PIL-b).
 *
 * Réservé aux administrateurs : sans connexion, le serveur répond 401
 * (ErreurApi de statut 401).
 */
let AdminJournalData = {};

/**
 * Une page du journal, les entrées les plus récentes d'abord : GET /api/admin/journal
 *
 * { entrees: [{ id, date, administrateur, action, cible, statutAvant, statutApres, detail, lot }],
 *   total, page, parPage, pages }
 *
 * @param {number} page - Numéro de page, à partir de 1.
 * @returns {Promise<Object>}
 */
AdminJournalData.fetch = async function (page) {
  return getRequest(page > 1 ? `admin/journal?page=${page}` : "admin/journal");
};

export { AdminJournalData };
