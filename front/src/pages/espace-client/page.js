import { AccountData, ACCOUNT_CHANGED_EVENT } from "../../data/compte.js";
import { CART_CHANGED_EVENT } from "../../data/panier.js";
import { OrderData } from "../../data/commande.js";
import { formatDate, formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { AccountNavigationView } from "../../ui/navigation-compte/index.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateHome from "./accueil.html?raw";
import templateActivity from "./activite.html?raw";
import templateNoActivity from "./activite-vide.html?raw";
import templateActivityError from "./activite-erreur.html?raw";
import templateRecent from "./recente.html?raw";

/**
 * Page « Mon espace » (US SUI-b) : /compte, l'accueil personnalisé du client.
 *
 * Elle réunit ses informations, un aperçu de son activité (les réservations
 * récentes) et la déconnexion. Un client non connecté est renvoyé vers la
 * page de connexion : c'est toujours le serveur qui dit si la session existe.
 */

// Nombre de réservations récentes affichées dans l'aperçu.
const RECENT_COUNT = 3;

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage : une réponse d'un affichage précédent est ignorée
  status: "loading", // "loading" | "anonymous" | "error" | "ready"
  user: null, // { prenom, nom, email } du client connecté
  recent: [], // les dernières réservations
  counts: {}, // nombre de réservations par statut
  activityError: null, // texte si l'aperçu n'a pas pu être chargé (le reste de la page reste utilisable)
  logoutError: null, // texte si la déconnexion a échoué
  loadError: null, // texte si le compte n'a pas pu être chargé
  isLoggingOut: false,
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
  M.recent = [];
  M.counts = {};
  M.activityError = null;
  M.logoutError = null;
  M.loadError = null;
  M.isLoggingOut = false;
};

/**
 * Charge le client connecté puis son aperçu d'activité. Sans client connecté,
 * la page n'a rien à montrer : l'état devient « anonymous ». Un aperçu qui ne
 * charge pas n'empêche pas d'afficher le reste.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchSpace = async function () {
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
  } catch (error) {
    if (visit !== M.visit) {
      return;
    }
    M.status = "error";
    M.loadError = `Impossible de vérifier votre connexion : ${error.message}`;
    return;
  }

  try {
    let history = await OrderData.fetchHistory({ statut: null, du: null, au: null, page: 1 });
    if (visit !== M.visit) {
      return;
    }
    M.recent = history.commandes.slice(0, RECENT_COUNT);
    M.counts = history.effectifs;
  } catch (error) {
    if (visit !== M.visit) {
      return;
    }
    M.activityError = `Impossible de charger vos réservations : ${error.message}`;
  }

  M.status = "ready";
};

/**
 * Déconnexion : le serveur détruit la session, panier compris.
 * . aucun paramètre
 * > Promise<boolean> : vrai si le client est déconnecté
 *
 * @returns {Promise<boolean>}
 */
M.logout = async function () {
  M.isLoggingOut = true;
  M.logoutError = null;

  try {
    await AccountData.logout();
    M.user = null;
    return true;
  } catch (error) {
    M.logoutError = `La déconnexion a échoué : ${error.message}`;
    return false;
  } finally {
    M.isLoggingOut = false;
  }
};

/**
 * Phrase qui résume l'activité : réservations en cours ou à retirer.
 * . aucun paramètre
 * > chaîne
 *
 * @returns {string}
 */
M.formatActivitySummary = function () {
  let inProgress = M.counts["en cours"] ?? 0;
  let ready = M.counts["disponible"] ?? 0;

  if (M.recent.length === 0) {
    return "Vous n'avez pas encore de réservation.";
  }
  if (inProgress + ready === 0) {
    return "Aucune réservation en attente. Voici les dernières :";
  }

  let parts = [];
  if (inProgress > 0) {
    parts.push(`${inProgress} en cours de préparation`);
  }
  if (ready > 0) {
    parts.push(`${ready} prête${ready > 1 ? "s" : ""} à retirer`);
  }
  return `${parts.join(" et ")}. Voici les dernières :`;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, user, recent, summary, activityError, logoutError, loadError, isLoggingOut }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    user: M.user,
    recent: M.recent,
    summary: M.formatActivitySummary(),
    activityError: M.activityError,
    logoutError: M.logoutError,
    loadError: M.loadError,
    isLoggingOut: M.isLoggingOut,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge l'espace puis l'affiche, ou renvoie vers la connexion si le client
 * n'est pas connecté.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadSpace = async function () {
  let visit = M.visit;

  await M.fetchSpace();
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
 * Clic sur « Se déconnecter » : une seule demande à la fois. Une fois le
 * client déconnecté, le layout est prévenu (en-tête, compteur du panier) et
 * la page de connexion annonce la déconnexion.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnLogout = async function (ev) {
  if (ev.target.closest('[data-action="deconnexion"]') === null || M.isLoggingOut) {
    return;
  }

  V.renderLoggingOut();
  let isDone = await M.logout();

  if (!isDone) {
    V.renderPage(M.getState());
    return;
  }

  V.notifyAccountChanged(null);
  V.notifyCartChanged(0);
  V.redirect("/connexion?deconnecte=1");
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
  C.loadSpace();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, y place la navigation de l'espace et écoute
 * le bouton de déconnexion (délégation : il est recréé à chaque rendu).
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  fragment.querySelector('slot[name="navigation"]').replaceWith(AccountNavigationView.dom());
  V.root.addEventListener("click", C.handler_clickOnLogout);
  return fragment;
};

/**
 * Change d'adresse sans empiler l'historique et sans recharger le navigateur.
 * Le routeur n'écoute que popstate : on remplace l'adresse, puis on le
 * prévient, comme le ferait le bouton Précédent du navigateur.
 * . path : chemin de route, avec sa chaîne de requête
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
 * Aperçu de l'activité : résumé et réservations récentes, ou message.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createActivityFragment = function (state) {
  if (state.activityError !== null) {
    return htmlToFragment(genericRenderer(templateActivityError, { texte: state.activityError }));
  }
  if (state.recent.length === 0) {
    return htmlToFragment(
      genericRenderer(templateNoActivity, { resume: state.summary, urlCatalogue: routeUrl("/") })
    );
  }

  let fragment = htmlToFragment(
    genericRenderer(templateActivity, { resume: state.summary, urlCommandes: routeUrl("/compte/commandes") })
  );
  let list = fragment.querySelector('[data-zone="recentes"]');

  for (let i = 0; i < state.recent.length; i++) {
    let order = state.recent[i];
    let item = htmlToFragment(
      genericRenderer(templateRecent, {
        href: routeUrl(`/compte/commandes/${encodeURIComponent(order.numero)}`),
        numero: order.numero,
        date: formatDate(order.date),
        total: formatPrice(order.total),
      })
    );
    item.querySelector('slot[name="statut"]').replaceWith(StatusBadgeView.dom(order.statut));
    list.append(item);
  }
  return fragment;
};

/**
 * Accueil du client : salutation, informations, aperçu d'activité, actions.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createHomeFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateHome, {
      prenom: state.user.prenom,
      nomComplet: `${state.user.prenom} ${state.user.nom}`,
      email: state.user.email,
      urlProfil: routeUrl("/compte/profil"),
      urlPanier: routeUrl("/panier"),
      urlCatalogue: routeUrl("/"),
    })
  );

  fragment.querySelector('slot[name="activite"]').replaceWith(V.createActivityFragment(state));

  if (state.logoutError !== null) {
    fragment.prepend(htmlToFragment(genericRenderer(templateLoadError, { texte: state.logoutError })));
  }
  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, erreur ou accueil.
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
    return V.createHomeFragment(state);
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
 * Marque le bouton de déconnexion comme occupé, sans reconstruire la page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.renderLoggingOut = function () {
  let button = V.root.querySelector('[data-action="deconnexion"]');

  button.setAttribute("aria-disabled", "true");
  button.textContent = "Déconnexion…";
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
 * Page appelée par le routeur sur la route « /compte ».
 *
 * @returns {DocumentFragment}
 */
export function AccountHomePage() {
  return C.init();
}
