import { getRequest, postRequest } from "../lib/api-request.js";

/**
 * Codes promotionnels dans le back-office (US PRO-b).
 *
 * Toutes ces routes sont réservées aux administrateurs : sans connexion, le
 * serveur répond 401 (ErreurApi de statut 401). Chaque écriture renvoie la liste
 * à jour des codes avec leurs statistiques : un champ refusé donne un 400, un code
 * déjà existant un 409, un code absent un 404, avec un message destiné à l'écran.
 */
let AdminPromoData = {};

/**
 * Les codes avec leurs statistiques d'utilisation : GET /api/admin/codes-promo
 *
 * { codes: [{ id, code, pourcentage, actif, utilisations, annulees, reductionTotale, montantReserve }],
 *   supprimes: { utilisations, reductionTotale } }
 * utilisations ne compte que les réservations non annulées.
 *
 * @returns {Promise<Object>}
 */
AdminPromoData.fetchAll = async function () {
  return getRequest("admin/codes-promo");
};

/**
 * Crée un code : POST /api/admin/codes-promo/creer
 *
 * @param {{code: string, pourcentage: number, actif: boolean}} values
 * @returns {Promise<Object>} La liste à jour.
 */
AdminPromoData.create = async function (values) {
  return postRequest("admin/codes-promo/creer", values);
};

/**
 * Modifie le pourcentage et l'état d'un code : POST /api/admin/codes-promo/modifier
 * (le texte du code ne change pas).
 *
 * @param {{id: number, pourcentage: number, actif: boolean}} values
 * @returns {Promise<Object>} La liste à jour.
 */
AdminPromoData.update = async function (values) {
  return postRequest("admin/codes-promo/modifier", values);
};

/**
 * Supprime un code : POST /api/admin/codes-promo/supprimer
 * Les réservations passées gardent leur réduction.
 *
 * @param {number} id - Identifiant du code.
 * @returns {Promise<Object>} La liste à jour.
 */
AdminPromoData.remove = async function (id) {
  return postRequest("admin/codes-promo/supprimer", { id: id });
};

export { AdminPromoData };
