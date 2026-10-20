import { getRequest, postRequest } from "../lib/api-request.js";

/**
 * Accès au back-office (US GOF-b).
 *
 * L'accès est décidé par le serveur, à partir de la session : le front ne
 * stocke ni jeton ni rôle. Les réponses ont la forme
 * { connecte, admin: { nom, email } | null }
 */
let AdminData = {};

/**
 * L'administrateur connecté : GET /api/admin/compte
 * Sans connexion administrateur, lève une ErreurApi de statut 401.
 *
 * @returns {Promise<Object>}
 */
AdminData.fetch = async function () {
  return getRequest("admin/compte");
};

/**
 * Connexion au back-office : POST /api/admin/connexion
 * Un e-mail ou un mot de passe faux lève une ErreurApi de statut 401.
 *
 * @param {string} email - E-mail de l'administrateur.
 * @param {string} password - Mot de passe.
 * @returns {Promise<Object>}
 */
AdminData.login = async function (email, password) {
  return postRequest("admin/connexion", { email: email, motDePasse: password });
};

/**
 * Déconnexion du back-office : POST /api/admin/deconnexion
 * Une session client ouverte dans le même navigateur est conservée.
 *
 * @returns {Promise<Object>}
 */
AdminData.logout = async function () {
  return postRequest("admin/deconnexion");
};

export { AdminData };
