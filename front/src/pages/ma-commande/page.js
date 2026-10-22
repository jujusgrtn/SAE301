import { CART_CHANGED_EVENT } from "../../data/panier.js";
import { OrderData } from "../../data/commande.js";
import { formatDate, formatPrice, splitLineName } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
import { ReorderResultView } from "../../ui/resultat-reutilisation/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateNotFound from "./introuvable.html?raw";
import templateDetail from "./detail.html?raw";
import templateLine from "./ligne.html?raw";

/**
 * Page « Détail d'une réservation » (US SUI-b) : /compte/commandes/:numero.
 *
 * Le nom de chaque ligne a été figé à la réservation et porte l'option
 * choisie (« Bague Rangiroa — Taille 54 ») : il reste exact même si le bijou
 * change ensuite. Le serveur ne renvoie la réservation qu'à son propriétaire.
 */

// Phrase qui dit au client ce qu'il lui reste à faire, selon le statut.
const STATUS_HINTS = {
  "en cours": "Votre réservation est enregistrée : nous préparons vos bijoux.",
  disponible: "Vos bijoux sont prêts : venez les essayer et les régler au centre Vaima, à Papeete.",
  retirée: "Vous avez retiré vos bijoux en boutique. Merci de votre confiance !",
  annulée: "Cette réservation a été annulée. Vous pouvez en faire une nouvelle depuis le catalogue.",
};

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage : une réponse d'un affichage précédent est ignorée
  number: null, // numéro lu dans l'adresse
  status: "loading", // "loading" | "unauthorized" | "notFound" | "error" | "ready"
  order: null, // { numero, statut, date, total, lignes }
  loadError: null, // texte si la réservation n'a pas pu être chargée
  reorder: { pending: null, result: null, error: null }, // « Commander à nouveau » : numéro en cours, résultat ou erreur
};

/**
 * Remet l'état à zéro pour un numéro de réservation.
 * . number : numéro lu dans l'adresse
 * > aucune valeur de retour
 *
 * @param {string} number
 * @returns {void}
 */
M.reset = function (number) {
  M.visit += 1;
  M.number = number;
  M.status = "loading";
  M.order = null;
  M.loadError = null;
  M.reorder = { pending: null, result: null, error: null };
};

/**
 * Charge la réservation. Un 401 (non connecté) et un 404 (inconnue, ou
 * d'un autre client) ne sont pas des pannes : chacun a son écran.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchOrder = async function () {
  let visit = M.visit;

  try {
    let response = await OrderData.fetchByNumber(M.number);
    if (visit !== M.visit) {
      return;
    }
    M.order = response.commande;
    M.status = "ready";
  } catch (error) {
    if (visit !== M.visit) {
      return;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else if (error.statut === 404 || error.statut === 400) {
      M.status = "notFound";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger cette réservation : ${error.message}`;
    }
  }
};

/**
 * Indique si « Commander à nouveau » peut partir : une seule demande à la
 * fois, un double clic ne transfère pas deux fois la réservation.
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.canReorder = function () {
  return M.reorder.pending === null;
};

/**
 * Transfère cette réservation dans le panier. Le détail (ce qui est ajouté,
 * ce qui ne l'est pas) est gardé dans l'état pour l'affichage.
 * . aucun paramètre
 * > Promise<number|null> : nombre d'articles du panier après le transfert, null si la demande a échoué
 *
 * @returns {Promise<number|null>}
 */
M.reorderOrder = async function () {
  let visit = M.visit;
  M.reorder = { pending: M.number, result: null, error: null };

  try {
    let response = await OrderData.reorder(M.number);
    if (visit !== M.visit) {
      return null;
    }
    M.reorder = { pending: null, result: response.resultat, error: null };
    return response.panier.nombreArticles;
  } catch (error) {
    if (visit !== M.visit) {
      return null;
    }
    let text = error.statut === 401 ? "Connectez-vous pour commander à nouveau." : error.message;
    M.reorder = { pending: null, result: null, error: text };
    return null;
  }
};

/**
 * Nombre d'exemplaires de la réservation, écrit pour un total : « 3 articles ».
 * . aucun paramètre
 * > chaîne
 *
 * @returns {string}
 */
M.formatArticleCount = function () {
  let count = M.order.lignes.reduce(function (sum, line) {
    return sum + line.quantite;
  }, 0);

  return `${count} ${count > 1 ? "articles" : "article"}`;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, order, indication, articles, loadError, reorderResult, reorderError }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    order: M.order,
    indication: M.order === null ? "" : (STATUS_HINTS[M.order.statut] ?? ""),
    articles: M.order === null ? "" : M.formatArticleCount(),
    loadError: M.loadError,
    reorderResult: M.reorder.result,
    reorderError: M.reorder.error,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge la réservation puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadOrder = async function () {
  let visit = M.visit;

  await M.fetchOrder();
  if (visit !== M.visit) {
    return;
  }
  V.renderPage(M.getState());
};

/**
 * Clic sur « Commander à nouveau » : transfère la réservation dans le panier,
 * affiche le détail du transfert et prévient l'en-tête du nouveau compteur.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnReorder = async function (ev) {
  let button = ev.target.closest('[data-action="reutiliser"]');

  if (button === null || !M.canReorder()) {
    return;
  }

  V.markReorderBusy(button);
  let count = await M.reorderOrder();
  V.markReorderIdle(button);
  V.renderReorder(M.getState());

  if (count !== null) {
    V.notifyCartChanged(count);
  }
};

/**
 * Point d'entrée : page en état de chargement, rendue au routeur, puis
 * chargement lancé sans l'attendre.
 * . number : numéro de réservation de l'adresse
 * > DocumentFragment de la page
 *
 * @param {string} number
 * @returns {DocumentFragment}
 */
C.init = function (number) {
  M.reset(number);
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadOrder();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page et mémorise sa racine.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(genericRenderer(template, { urlListe: routeUrl("/compte/commandes") }));
  V.root = fragment.firstElementChild;
  V.root.addEventListener("click", C.handler_clickOnReorder);
  return fragment;
};

/**
 * Détail : numéro, statut, date, indication, lignes avec leur option, total.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createOrderFragment = function (state) {
  let order = state.order;
  let fragment = htmlToFragment(
    genericRenderer(templateDetail, {
      numero: order.numero,
      date: formatDate(order.date),
      indication: state.indication,
      articles: state.articles,
      total: formatPrice(order.total),
    })
  );

  fragment.querySelector('slot[name="statut"]').replaceWith(StatusBadgeView.dom(order.statut));

  let lines = order.lignes.map(function (line) {
    return htmlToFragment(
      genericRenderer(templateLine, {
        nom: splitLineName(line.nomProduit).nom,
        options: splitLineName(line.nomProduit).options,
        quantite: line.quantite,
        prixUnitaire: formatPrice(line.prixUnitaire),
        sousTotal: formatPrice(line.sousTotal),
      })
    );
  });
  fragment.querySelector('slot[name="lignes"]').replaceWith(...lines);

  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, introuvable,
 * erreur ou détail.
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
  if (state.status === "unauthorized") {
    return htmlToFragment(genericRenderer(templateUnauthorized, { urlConnexion: routeUrl("/connexion") }));
  }
  if (state.status === "notFound") {
    return htmlToFragment(genericRenderer(templateNotFound, { urlListe: routeUrl("/compte/commandes") }));
  }
  if (state.status === "error") {
    return htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError }));
  }
  return V.createOrderFragment(state);
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
 * Affiche le résultat de « Commander à nouveau » (ou son erreur) sous le lien
 * de retour et y place le focus, pour qu'il soit lu.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderReorder = function (state) {
  let zone = V.root.querySelector('[data-zone="reutilisation"]');

  if (state.reorderResult !== null) {
    zone.replaceChildren(ReorderResultView.dom(state.reorderResult, routeUrl("/panier")));
  } else if (state.reorderError !== null) {
    zone.replaceChildren(ReorderResultView.domError(state.reorderError));
  } else {
    zone.replaceChildren();
    return;
  }
  zone.querySelector('[data-zone="resultat-reutilisation"]').focus();
};

/**
 * Marque le bouton « Commander à nouveau » comme occupé.
 * . button : le bouton cliqué
 * > aucune valeur de retour
 *
 * @param {HTMLElement} button
 * @returns {void}
 */
V.markReorderBusy = function (button) {
  button.setAttribute("aria-disabled", "true");
  button.textContent = "Ajout au panier…";
};

/**
 * Rend son état normal au bouton « Commander à nouveau ».
 * . button : le bouton cliqué
 * > aucune valeur de retour
 *
 * @param {HTMLElement} button
 * @returns {void}
 */
V.markReorderIdle = function (button) {
  button.removeAttribute("aria-disabled");
  button.textContent = "Commander à nouveau";
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
 * Page appelée par le routeur sur la route « /compte/commandes/:numero ».
 *
 * @param {{numero: string}} params - Paramètres de l'adresse.
 * @returns {DocumentFragment}
 */
export function MyOrderPage(params) {
  return C.init(params.numero);
}
