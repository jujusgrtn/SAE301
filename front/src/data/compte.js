import { getRequest, postRequest } from "../lib/api-request.js";

/**
 * Compte client (US CMD-c).
 *
 * La connexion est portée par la session du serveur : le front ne stocke ni
 * jeton ni rôle. Chaque appel renvoie l'état de connexion :
 * { connecte, utilisateur: { prenom, nom, email } | null }
 */
let AccountData = {};

/**
 * Nom de l'événement émis sur document après une connexion, une inscription
 * ou une déconnexion. Le layout l'écoute pour mettre à jour l'en-tête.
 * detail : { utilisateur } (null après une déconnexion)
 */
const ACCOUNT_CHANGED_EVENT = "compte:modifie";

/**
 * Le client connecté, s'il y en a un : GET /api/compte
 *
 * @returns {Promise<Object>}
 */
AccountData.fetch = async function () {
  return getRequest("compte");
};

/**
 * Connexion : POST /api/compte/connexion
 * Un e-mail ou un mot de passe faux lève une ErreurApi de statut 401.
 *
 * @param {string} email - E-mail du compte.
 * @param {string} password - Mot de passe.
 * @returns {Promise<Object>}
 */
AccountData.login = async function (email, password) {
  return postRequest("compte/connexion", { email: email, motDePasse: password });
};

/**
 * Inscription, suivie d'une connexion automatique : POST /api/compte/inscription
 * Un e-mail déjà utilisé lève une ErreurApi de statut 409.
 *
 * @param {{prenom: string, nom: string, email: string, motDePasse: string}} values - Champs du formulaire.
 * @returns {Promise<Object>}
 */
AccountData.register = async function (values) {
  return postRequest("compte/inscription", {
    prenom: values.prenom,
    nom: values.nom,
    email: values.email,
    motDePasse: values.motDePasse,
  });
};

/**
 * Déconnexion, qui vide aussi le panier : POST /api/compte/deconnexion
 *
 * @returns {Promise<Object>}
 */
AccountData.logout = async function () {
  return postRequest("compte/deconnexion");
};

export { AccountData, ACCOUNT_CHANGED_EVENT };
