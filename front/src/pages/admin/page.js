import { AdminData } from "../../data/admin.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateForm from "./formulaire.html?raw";
import templateError from "./erreur.html?raw";
import templateNotice from "./annonce.html?raw";
import templateDashboard from "./tableau-de-bord.html?raw";

/**
 * Page « Back-office » (US GOF-b) : /admin.
 *
 * La page ne protège rien : c'est le serveur qui décide de l'accès. Un 401 sur
 * GET /api/admin/compte affiche le formulaire de connexion ; une réponse 200
 * affiche l'accueil du back-office.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "guest" | "ready" | "error"
  admin: null, // { identifiant } de l'administrateur connecté, ou null
  pending: null, // action en cours : "connexion" | "deconnexion"
  loadError: null, // texte si l'accès n'a pas pu être vérifié
  loginError: null, // texte de l'erreur du formulaire de connexion
  notice: null, // annonce affichée au-dessus du formulaire
  loginValue: "", // identifiant saisi, conservé si le serveur refuse la connexion
};

/**
 * Remet les messages à zéro avant un nouvel affichage de la page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.reset = function () {
  M.status = "loading";
  M.pending = null;
  M.loadError = null;
  M.loginError = null;
  M.notice = null;
};

/**
 * Demande au serveur qui est connecté au back-office. Un 401 n'est pas une
 * erreur de chargement : il signifie seulement « pas encore connecté ».
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchAdmin = async function () {
  try {
    let account = await AdminData.fetch();
    M.admin = account.admin;
    M.status = "ready";
  } catch (error) {
    M.admin = null;
    if (error.statut === 401) {
      M.status = "guest";
    } else {
      M.status = "error";
      M.loadError = `Impossible de vérifier l'accès au back-office : ${error.message}`;
    }
  }
};

/**
 * Indique si une action peut partir : une seule à la fois, un double envoi
 * du formulaire ne crée qu'une requête.
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.canSubmit = function () {
  return M.pending === null;
};

/**
 * Passe une action en cours et efface les messages précédents.
 * . action : "connexion" | "deconnexion"
 * > aucune valeur de retour
 *
 * @param {string} action
 * @returns {void}
 */
M.startAction = function (action) {
  M.pending = action;
  M.loginError = null;
  M.notice = null;
};

/**
 * Connexion avec les champs du formulaire.
 * . values : { identifiant, motDePasse }
 * > Promise<boolean> : vrai si l'administrateur est connecté
 *
 * @param {{identifiant: string, motDePasse: string}} values
 * @returns {Promise<boolean>}
 */
M.login = async function (values) {
  M.loginValue = values.identifiant.trim();
  let isDone = false;

  try {
    let account = await AdminData.login(M.loginValue, values.motDePasse);
    M.admin = account.admin;
    M.status = "ready";
    isDone = true;
  } catch (error) {
    M.loginError = error.message;
  }

  M.pending = null;
  return isDone;
};

/**
 * Déconnexion du back-office.
 * . aucun paramètre
 * > Promise<boolean> : vrai si l'administrateur est déconnecté
 *
 * @returns {Promise<boolean>}
 */
M.logout = async function () {
  let isDone = false;

  try {
    await AdminData.logout();
    M.admin = null;
    M.status = "guest";
    M.notice = "Vous êtes déconnecté du back-office.";
    isDone = true;
  } catch (error) {
    M.loadError = `La déconnexion a échoué : ${error.message}`;
    M.status = "error";
  }

  M.pending = null;
  return isDone;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, admin, pending, loadError, loginError, notice, loginValue }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    admin: M.admin,
    pending: M.pending,
    loadError: M.loadError,
    loginError: M.loginError,
    notice: M.notice,
    loginValue: M.loginValue,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Vérifie l'accès auprès du serveur puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadAdmin = async function () {
  await M.fetchAdmin();
  V.renderPage(M.getState());
};

/**
 * Envoi du formulaire de connexion. Le navigateur a déjà vérifié les champs
 * obligatoires ; le serveur revérifie tout.
 * . ev : événement submit, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {SubmitEvent} ev
 * @returns {Promise<void>}
 */
C.handler_submitLogin = async function (ev) {
  let form = ev.target.closest('form[data-form="connexion-admin"]');

  if (form === null) {
    return;
  }
  ev.preventDefault();

  if (!M.canSubmit()) {
    return;
  }

  let values = Object.fromEntries(new FormData(form));

  M.startAction("connexion");
  V.renderBusy(M.getState());

  let isDone = await M.login(values);

  V.renderPage(M.getState());
  if (isDone) {
    V.focusWelcome();
  } else {
    V.focusError();
  }
};

/**
 * Clic sur « Se déconnecter ».
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnLogout = async function (ev) {
  if (ev.target.closest('[data-action="deconnexion"]') === null || !M.canSubmit()) {
    return;
  }

  M.startAction("deconnexion");
  V.renderBusy(M.getState());

  await M.logout();

  V.renderPage(M.getState());
  V.focusLogin();
};

/**
 * Point d'entrée : page en état de chargement, rendue au routeur, puis
 * vérification de l'accès lancée sans l'attendre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
C.init = function () {
  M.reset();
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadAdmin();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, mémorise sa racine et y délègue les
 * événements du formulaire et du bouton de déconnexion.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  V.root.addEventListener("submit", C.handler_submitLogin);
  V.root.addEventListener("click", C.handler_clickOnLogout);
  return fragment;
};

/**
 * Remplace un slot par un message, ou le retire s'il n'y en a pas.
 * . fragment : où chercher le slot, name : nom du slot, html : contenu ou null
 * > aucune valeur de retour
 *
 * @param {DocumentFragment} fragment
 * @param {string} name
 * @param {string|null} html
 * @returns {void}
 */
V.fillSlot = function (fragment, name, html) {
  let slot = fragment.querySelector(`slot[name="${name}"]`);

  if (html === null) {
    slot.remove();
  } else {
    slot.replaceWith(htmlToFragment(html));
  }
};

/**
 * Formulaire de connexion, pré-rempli avec l'identifiant conservé, et ses messages.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createFormFragment = function (state) {
  let fragment = htmlToFragment(genericRenderer(templateForm, { identifiant: state.loginValue }));

  V.fillSlot(fragment, "annonce", state.notice === null ? null : genericRenderer(templateNotice, { texte: state.notice }));
  V.fillSlot(
    fragment,
    "erreur",
    state.loginError === null ? null : genericRenderer(templateError, { texte: state.loginError })
  );

  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, erreur, formulaire ou accueil
 * du back-office.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createContentFragment = function (state) {
  if (state.status === "loading") {
    return htmlToFragment(templateLoading);
  }
  if (state.status === "error") {
    return htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError }));
  }
  if (state.status === "ready") {
    return htmlToFragment(genericRenderer(templateDashboard, {
        identifiant: state.admin.identifiant,
        urlProduits: routeUrl("/admin/produits"),
        urlCategories: routeUrl("/admin/categories"),
        urlCommandes: routeUrl("/admin/commandes"),
      }));
  }
  return V.createFormFragment(state);
};

/**
 * Remplace le contenu de la page par celui qui correspond à l'état reçu.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderPage = function (state) {
  let zone = V.root.querySelector('[data-zone="contenu"]');
  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(V.createContentFragment(state));
};

/**
 * Marque le bouton de l'action en cours, sans reconstruire la page : le mot
 * de passe saisi et le focus restent en place pendant l'envoi.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderBusy = function (state) {
  let selectors = {
    connexion: 'form[data-form="connexion-admin"] [type="submit"]',
    deconnexion: '[data-action="deconnexion"]',
  };
  let labels = { connexion: "Connexion…", deconnexion: "Déconnexion…" };
  let button = V.root.querySelector(selectors[state.pending]);

  button.setAttribute("aria-disabled", "true");
  button.textContent = labels[state.pending];
};

/**
 * Place le focus sur le message d'erreur du formulaire, pour qu'il soit lu.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusError = function () {
  let error = V.root.querySelector('[data-zone="erreur"]');

  if (error !== null) {
    error.focus();
  }
};

/**
 * Place le focus sur le message de bienvenue après une connexion réussie.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusWelcome = function () {
  let welcome = V.root.querySelector('[data-zone="bienvenue"]');

  if (welcome !== null) {
    welcome.focus();
  }
};

/**
 * Place le focus sur le champ identifiant après une déconnexion.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusLogin = function () {
  let field = V.root.querySelector("#admin-identifiant");

  if (field !== null) {
    field.focus();
  }
};

/**
 * Page appelée par le routeur sur la route « /admin ».
 *
 * @returns {DocumentFragment}
 */
export function AdminPage() {
  return C.init();
}
