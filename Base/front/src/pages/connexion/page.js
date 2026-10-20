import { AccountData, ACCOUNT_CHANGED_EVENT } from "../../data/compte.js";
import { CART_CHANGED_EVENT } from "../../data/panier.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateForms from "./formulaires.html?raw";
import templateError from "./erreur.html?raw";
import templateNotice from "./annonce.html?raw";
import templateConnected from "./connecte.html?raw";

/**
 * Page « Mon compte » (US CMD-c) : /connexion.
 *
 * Déconnecté, le client voit deux formulaires : connexion et inscription.
 * Connecté, il voit son identité et peut se déconnecter. C'est toujours la
 * réponse du serveur qui dit si le client est connecté.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "ready" | "error"
  user: null, // { prenom, nom, email } du client connecté, ou null
  pending: null, // action en cours : "connexion" | "inscription" | "deconnexion"
  loadError: null, // texte si l'état du compte n'a pas pu être chargé
  loginError: null, // texte de l'erreur du formulaire de connexion
  registerError: null, // texte de l'erreur du formulaire d'inscription
  notice: null, // annonce affichée au-dessus des formulaires
  // Valeurs saisies, conservées si le serveur refuse le formulaire. Jamais le
  // mot de passe : il est ressaisi.
  loginEmail: "",
  registerValues: { prenom: "", nom: "", email: "" },
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
  M.registerError = null;
  M.notice = null;
};

/**
 * Charge l'état de connexion depuis la session du serveur.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchAccount = async function () {
  try {
    let account = await AccountData.fetch();
    M.user = account.utilisateur;
    M.status = "ready";
  } catch (error) {
    M.status = "error";
    M.loadError = `Impossible de vérifier votre connexion : ${error.message}`;
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
 * . action : "connexion" | "inscription" | "deconnexion"
 * > aucune valeur de retour
 *
 * @param {string} action
 * @returns {void}
 */
M.startAction = function (action) {
  M.pending = action;
  M.loginError = null;
  M.registerError = null;
  M.notice = null;
};

/**
 * Connexion avec les champs du formulaire.
 * . values : { email, motDePasse }
 * > Promise<boolean> : vrai si le client est connecté
 *
 * @param {{email: string, motDePasse: string}} values
 * @returns {Promise<boolean>}
 */
M.login = async function (values) {
  M.loginEmail = values.email.trim();
  let isDone = false;

  try {
    let account = await AccountData.login(M.loginEmail, values.motDePasse);
    M.user = account.utilisateur;
    isDone = true;
  } catch (error) {
    M.loginError = error.message;
  }

  M.pending = null;
  return isDone;
};

/**
 * Inscription avec les champs du formulaire ; le serveur connecte le client.
 * . values : { prenom, nom, email, motDePasse }
 * > Promise<boolean> : vrai si le compte est créé
 *
 * @param {{prenom: string, nom: string, email: string, motDePasse: string}} values
 * @returns {Promise<boolean>}
 */
M.register = async function (values) {
  M.registerValues = { prenom: values.prenom.trim(), nom: values.nom.trim(), email: values.email.trim() };
  let isDone = false;

  try {
    let account = await AccountData.register({ ...M.registerValues, motDePasse: values.motDePasse });
    M.user = account.utilisateur;
    M.registerValues = { prenom: "", nom: "", email: "" };
    isDone = true;
  } catch (error) {
    M.registerError = error.message;
  }

  M.pending = null;
  return isDone;
};

/**
 * Déconnexion : le serveur détruit la session, panier compris.
 * . aucun paramètre
 * > Promise<boolean> : vrai si le client est déconnecté
 *
 * @returns {Promise<boolean>}
 */
M.logout = async function () {
  let isDone = false;

  try {
    await AccountData.logout();
    M.user = null;
    M.notice = "Vous êtes déconnecté. Votre panier a été vidé.";
    isDone = true;
  } catch (error) {
    M.notice = `La déconnexion a échoué : ${error.message}`;
  }

  M.pending = null;
  return isDone;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, user, pending, loadError, loginError, registerError, notice,
 *     loginEmail, registerValues }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    user: M.user,
    pending: M.pending,
    loadError: M.loadError,
    loginError: M.loginError,
    registerError: M.registerError,
    notice: M.notice,
    loginEmail: M.loginEmail,
    registerValues: M.registerValues,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge l'état du compte puis l'affiche.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadAccount = async function () {
  await M.fetchAccount();
  V.renderPage(M.getState());
};

/**
 * Envoi d'un des deux formulaires. Le navigateur a déjà vérifié les champs
 * obligatoires ; le serveur revérifie tout.
 * . ev : événement submit, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {SubmitEvent} ev
 * @returns {Promise<void>}
 */
C.handler_submitForm = async function (ev) {
  let form = ev.target.closest("form[data-form]");

  if (form === null) {
    return;
  }
  ev.preventDefault();

  if (!M.canSubmit()) {
    return;
  }

  let action = form.dataset.form;
  let values = Object.fromEntries(new FormData(form));

  M.startAction(action);
  V.renderBusy(M.getState());

  let isDone = action === "connexion" ? await M.login(values) : await M.register(values);

  V.renderPage(M.getState());
  if (isDone) {
    V.notifyAccountChanged(M.getState().user);
    V.focusWelcome();
  } else {
    V.focusError(action);
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

  let isDone = await M.logout();

  V.renderPage(M.getState());
  if (isDone) {
    V.notifyAccountChanged(null);
    V.notifyCartChanged(0);
  }
  V.focusTitle();
};

/**
 * Point d'entrée : page en état de chargement, rendue au routeur, puis
 * chargement lancé sans l'attendre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
C.init = function () {
  M.reset();
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadAccount();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, mémorise sa racine et y délègue les
 * événements des formulaires et du bouton de déconnexion.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  V.root.addEventListener("submit", C.handler_submitForm);
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
 * Formulaires de connexion et d'inscription, pré-remplis avec les valeurs
 * conservées dans l'état, et leurs messages éventuels.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createFormsFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateForms, {
      emailConnexion: state.loginEmail,
      prenom: state.registerValues.prenom,
      nom: state.registerValues.nom,
      emailInscription: state.registerValues.email,
    })
  );

  V.fillSlot(fragment, "annonce", state.notice === null ? null : genericRenderer(templateNotice, { texte: state.notice }));
  V.fillSlot(
    fragment,
    "erreur-connexion",
    state.loginError === null ? null : genericRenderer(templateError, { texte: state.loginError })
  );
  V.fillSlot(
    fragment,
    "erreur-inscription",
    state.registerError === null ? null : genericRenderer(templateError, { texte: state.registerError })
  );

  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, erreur, client connecté ou
 * formulaires.
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
  if (state.user !== null) {
    return htmlToFragment(
      genericRenderer(templateConnected, {
        prenom: state.user.prenom,
        email: state.user.email,
        urlPanier: routeUrl("/panier"),
        urlCatalogue: routeUrl("/"),
      })
    );
  }
  return V.createFormsFragment(state);
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
    connexion: 'form[data-form="connexion"] [type="submit"]',
    inscription: 'form[data-form="inscription"] [type="submit"]',
    deconnexion: '[data-action="deconnexion"]',
  };
  let labels = { connexion: "Connexion…", inscription: "Création du compte…", deconnexion: "Déconnexion…" };
  let button = V.root.querySelector(selectors[state.pending]);

  button.setAttribute("aria-disabled", "true");
  button.textContent = labels[state.pending];
};

/**
 * Place le focus sur le message d'erreur du formulaire envoyé, pour qu'il
 * soit lu et que le clavier reparte de là.
 * . action : "connexion" | "inscription"
 * > aucune valeur de retour
 *
 * @param {string} action
 * @returns {void}
 */
V.focusError = function (action) {
  let error = V.root.querySelector(`form[data-form="${action}"] [data-zone="erreur"]`);

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
 * Place le focus sur le premier champ après une déconnexion.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusTitle = function () {
  let field = V.root.querySelector("#connexion-email");

  if (field !== null) {
    field.focus();
  }
};

/**
 * Annonce au layout le nouveau client connecté (null après déconnexion).
 * . user : { prenom, nom, email } ou null
 * > aucune valeur de retour
 *
 * @param {Object|null} user
 * @returns {void}
 */
V.notifyAccountChanged = function (user) {
  document.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT, { detail: { utilisateur: user } }));
};

/**
 * Annonce au layout le nouveau nombre d'articles du panier.
 * . count : nombre d'articles
 * > aucune valeur de retour
 *
 * @param {number} count
 * @returns {void}
 */
V.notifyCartChanged = function (count) {
  document.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT, { detail: { nombreArticles: count } }));
};

/**
 * Page appelée par le routeur sur la route « /connexion ».
 *
 * @returns {DocumentFragment}
 */
export function LoginPage() {
  return C.init();
}
