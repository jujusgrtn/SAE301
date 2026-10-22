import { getRequest } from "../lib/api-request.js";
import { routeUrl } from "../lib/utils.js";

/**
 * Statistiques du back-office (US PIL-a).
 *
 * Réservé aux administrateurs : sans connexion, le serveur répond 401
 * (ErreurApi de statut 401). Rien n'est mis en cache : chaque appel renvoie
 * l'état de la base à cet instant.
 */
let AdminStatsData = {};

/**
 * Toutes les statistiques : GET /api/admin/statistiques
 *
 * { genereLe, stocks: [{ id, nom, stock, disponibilite }],
 *   alertesStock: [{ variantId, produit, libelle, stock, disponibilite }],
 *   revenus: { jours: [{ jour, total, nombre }], total, nombre },  (réservations retirées seulement)
 *   commandes: { total, parStatut, montantReserve },
 *   produitsLesPlusVendus: [{ nom, quantite, montant }] }
 *
 * @returns {Promise<Object>}
 */
AdminStatsData.fetch = async function () {
  return getRequest("admin/statistiques");
};

/**
 * Adresse du fichier CSV des statistiques. C'est un simple lien de
 * téléchargement : le navigateur joint lui-même le cookie de session.
 *
 * @returns {string}
 */
AdminStatsData.exportUrl = function () {
  return routeUrl("/api/admin/statistiques/export");
};

export { AdminStatsData };
