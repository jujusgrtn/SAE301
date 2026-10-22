import { AccountData, ACCOUNT_CHANGED_EVENT } from "../../data/compte.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { AccountNavigationView } from "../../ui/navigation-compte/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateForms from "./formulaires.html?raw";
import templateSuccess from "./succes.html?raw";
import templateError from "./erreur.html?raw";

/**
 * Page « Mon profil » (US SUI-b) : /compte/profil.
 *
 * Deux formulaires indépendants : les informations (prénom, nom, e-mail) et le
 * mot de passe. Changer de mot de passe exige le mot de passe actuel, que le
 * serveur vérifie. Un client non connecté est renvoyé vers la connexion.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage : une réponse d'un affichage précédent est ignorée
  status: "loading", // "loading" | "anonymous" | "error" | "ready"
  user: null, // { prenom, nom, email } enregistrés
  draft: { prenom: "", nom: "", email: "" }, // valeurs du formulaire, conservées si le serveur refuse
  pending: null, // action en cours : "profil" | "mot-de-passe"
  messages: { profil: null, "mot-de-passe": null }, // { type: "succes" | "erreur", texte } par formulaire
  loadError: null, // texte si le compte n'a pas pu être chargé
};

/**
 * Remet l'état à zéro avant un nouvel affichage de la page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.reset = function () {
  M.visit += 1;
  M.status = "loading";
  M.user = null;
  M.draft = { prenom: "", nom: "", email: "" };
  M.pending = null;
  M.messages = { profil: null, "mot-de-passe": null };
  M.loadError = null;
};

/**
 * Charge le client connecté. Sans client connecté, l'état devient « anonymous ».
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchAccount = async function () {
  let visit = M.visit;

  try {
    let account = await AccountData.fetch();
    if (visit !== M.visit) {
      return;
    }
    if (account.utilisateur === null) {
      M.status = "anonymous";
      return;
    }
    M.user = account.utilisateur;
    M.draft = { prenom: M.user.prenom, nom: M.user.nom, email: M.user.email };
    M.status = "ready";
  } catch (error) {
    if (visit !== M.visit) {
      return;
    }
    M.status = "error";
    M.loadError = `Impossible de charger votre profil : ${error.message}`;
  }
};

/**
 * Indique si une action peut partir : une seule à la fois, un double envoi
 * ne crée qu'une requête.
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
 * . action : "profil" | "mot-de-passe"
 * > aucune valeur de retour
 *
 * @param {string} action
 * @returns {void}
 */
M.startAction = function (action) {
  M.pending = action;
  M.messages = { profil: null, "mot-de-passe": null };
};

/**
 * Traduit une erreur du serveur : un 401 signifie que la session a expiré.
 * . error : ErreurApi
 * > aucune valeur de retour
 *
 * @param {Error} error
 * @returns {void}
 */
M.handleSessionLost = function (error) {
  if (error.statut === 401) {
    M.status = "anonymous";
  }
};

/**
 * Enregistre le prénom, le nom et l'e-mail.
 * . values : { prenom, nom, email } saisis
 * > Promise<boolean> : vrai si le profil est enregistré
 *
 * @param {{prenom: string, nom: string, email: string}} values
 * @returns {Promise<boolean>}
 */
M.saveProfile = async function (values) {
  M.draft = { prenom: values.prenom.trim(), nom: values.nom.trim(), email: values.email.trim() };
  let isDone = false;

  try {
    let account = await AccountData.updateProfile(M.draft);
    M.user = account.utilisateur;
    M.draft = { prenom: M.user.prenom, nom: M.user.nom, email: M.user.email };
    M.messages.profil = { type: "succes", texte: "Vos informations sont enregistrées." };
    isDone = true;
  } catch (error) {
    M.handleSessionLost(error);
    M.messages.profil = { type: "erreur", texte: error.message };
  }

  M.pending = null;
  return isDone;
};

/**
 * Change le mot de passe. La confirmation est vérifiée ici pour éviter un
 * envoi voué à l'échec ; le mot de passe actuel, lui, est vérifié par le serveur.
 * . values : { motDePasseActuel, nouveauMotDePasse, confirmation } saisis
 * > Promise<boolean> : vrai si le mot de passe est changé
 *
 * @param {{motDePasseActuel: string, nouveauMotDePasse: string, confirmation: string}} values
 * @returns {Promise<boolean>}
 */
M.savePassword = async function (values) {
  let isDone = false;

  if (values.nouveauMotDePasse !== values.confirmation) {
    M.messages["mot-de-passe"] = { type: "erreur", texte: "La confirmation ne correspond pas au nouveau mot de passe." };
    M.pending = null;
    return false;
  }

  try {
    await AccountData.changePassword(values.motDePasseActuel, values.nouveauMotDePasse);
    M.messages["mot-de-passe"] = { type: "succes", texte: "Votre mot de passe est modifié." };
    isDone = true;
  } catch (error) {
    M.handleSessionLost(error);
    M.messages["mot-de-passe"] = { type: "erreur", texte: error.message };
  }

  M.pending = null;
  return isDone;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, draft, messages, loadError }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    draft: M.draft,
    messages: M.messages,
    loadError: M.loadError,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le profil puis l'affiche, ou renvoie vers la connexion si le client
 * n'est pas connecté.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadAccount = async function () {
  let visit = M.visit;

  await M.fetchAccount();
  if (visit !== M.visit) {
    return;
  }
  if (M.status === "anonymous") {
    V.redirect("/connexion");
    return;
  }
  V.renderPage(M.getState());
};

/**
 * Envoi d'un des deux formulaires. Le navigateur a déjà vérifié les champs
 * obligatoires ; le serveur revérifie tout. Après l'envoi, le focus va sur le
 * message du formulaire concerné.
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
  let values = V.readForm(form);

  M.startAction(action);
  V.renderBusy(action);

  let isDone = action === "profil" ? await M.saveProfile(values) : await M.savePassword(values);

  if (M.status === "anonymous") {
    V.redirect("/connexion");
    return;
  }

  V.renderPage(M.getState());
  V.focusMessage(action);

  if (isDone && action === "profil") {
    V.notifyAccountChanged(M.user);
  }
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
 * Crée la structure de la page, y place la navigation de l'espace et écoute
 * l'envoi des formulaires (délégation : ils sont recréés à chaque rendu).
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  fragment.querySelector('slot[name="navigation"]').replaceWith(AccountNavigationView.dom());
  V.root.addEventListener("submit", C.handler_submitForm);
  return fragment;
};

/**
 * Change d'adresse sans empiler l'historique et sans recharger le navigateur.
 * Le routeur n'écoute que popstate : on remplace l'adresse, puis on le
 * prévient, comme le ferait le bouton Précédent du navigateur.
 * . path : chemin de route
 * > aucune valeur de retour
 *
 * @param {string} path
 * @returns {void}
 */
V.redirect = function (path) {
  window.history.replaceState(null, "", routeUrl(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Valeurs saisies dans un formulaire.
 * . form : le formulaire envoyé
 * > objet { nomDuChamp: valeur }
 *
 * @param {HTMLFormElement} form
 * @returns {Object}
 */
V.readForm = function (form) {
  return Object.fromEntries(new FormData(form));
};

/**
 * Remplace un slot par un message, ou le retire s'il n'y en a pas.
 * . fragment : où chercher le slot, name : nom du slot, message : { type, texte } ou null
 * > aucune valeur de retour
 *
 * @param {DocumentFragment} fragment
 * @param {string} name
 * @param {{type: string, texte: string}|null} message
 * @returns {void}
 */
V.fillMessage = function (fragment, name, message) {
  let slot = fragment.querySelector(`slot[name="${name}"]`);

  if (message === null) {
    slot.remove();
    return;
  }
  let html = message.type === "succes" ? templateSuccess : templateError;
  slot.replaceWith(htmlToFragment(genericRenderer(html, { texte: message.texte })));
};

/**
 * Les deux formulaires, le premier pré-rempli. Les champs de mot de passe ne
 * sont jamais pré-remplis : ils sont ressaisis.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createFormsFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateForms, {
      prenom: state.draft.prenom,
      nom: state.draft.nom,
      email: state.draft.email,
    })
  );

  V.fillMessage(fragment, "message-profil", state.messages.profil);
  V.fillMessage(fragment, "message-mot-de-passe", state.messages["mot-de-passe"]);
  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, erreur ou formulaires.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createContentFragment = function (state) {
  if (state.status === "error") {
    return htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError }));
  }
  if (state.status === "ready") {
    return V.createFormsFragment(state);
  }
  return htmlToFragment(templateLoading);
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
 * Marque le bouton du formulaire envoyé, sans reconstruire la page : les
 * valeurs saisies et le focus restent en place pendant l'envoi.
 * . action : "profil" | "mot-de-passe"
 * > aucune valeur de retour
 *
 * @param {string} action
 * @returns {void}
 */
V.renderBusy = function (action) {
  let button = V.root.querySelector(`form[data-form="${action}"] [type="submit"]`);

  button.setAttribute("aria-disabled", "true");
  button.textContent = "Enregistrement…";
};

/**
 * Place le focus sur le message du formulaire envoyé, pour qu'il soit lu et
 * que le clavier reparte de là.
 * . action : "profil" | "mot-de-passe"
 * > aucune valeur de retour
 *
 * @param {string} action
 * @returns {void}
 */
V.focusMessage = function (action) {
  let message = V.root.querySelector(`form[data-form="${action}"] [data-zone="message"]`);

  if (message !== null) {
    message.focus();
  }
};

/**
 * Annonce au layout le client à jour (l'en-tête affiche son prénom).
 * . user : { prenom, nom, email }
 * > aucune valeur de retour
 *
 * @param {Object} user
 * @returns {void}
 */
V.notifyAccountChanged = function (user) {
  document.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT, { detail: { utilisateur: user } }));
};

/**
 * Page appelée par le routeur sur la route « /compte/profil ».
 *
 * @returns {DocumentFragment}
 */
export function ProfilePage() {
  return C.init();
}
