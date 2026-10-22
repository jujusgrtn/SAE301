import { OrderData } from "../../data/commande.js";
import { formatDate, formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
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
 * > { status, order, indication, articles, loadError }
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
        nom: line.nomProduit,
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
 * Page appelée par le routeur sur la route « /compte/commandes/:numero ».
 *
 * @param {{numero: string}} params - Paramètres de l'adresse.
 * @returns {DocumentFragment}
 */
export function MyOrderPage(params) {
  return C.init(params.numero);
}
