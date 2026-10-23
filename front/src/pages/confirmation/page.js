import { OrderData } from "../../data/commande.js";
import { formatDate, formatPrice, splitLineName } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { TotalsView } from "../../ui/lignes-totaux/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateError from "./erreur.html?raw";
import templateContent from "./contenu.html?raw";
import templateLine from "./ligne.html?raw";

/**
 * Page « Confirmation » (US CMD-a) : /commande/confirmation?numero=MC-2026-00042.
 *
 * La réservation est relue auprès du serveur, qui ne la renvoie qu'à son
 * propriétaire : le numéro dans l'adresse ne suffit pas pour la consulter.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  number: null, // numéro lu dans l'adresse
  status: "loading", // "loading" | "success" | "error"
  order: null, // { numero, statut, date, total, lignes }
  error: null, // { texte, lien, path } en cas d'erreur
};

// Libellés des statuts de la table commande, pour le client.
M.STATUS_LABELS = {
  "en cours": "En cours de préparation",
  disponible: "Prête à retirer",
  retirée: "Retirée",
  annulée: "Annulée",
};

/**
 * Remet l'état à zéro pour un numéro de réservation.
 * . number : numéro lu dans l'adresse, ou null s'il manque
 * > aucune valeur de retour
 *
 * @param {string|null} number
 * @returns {void}
 */
M.reset = function (number) {
  M.number = number;
  M.status = "loading";
  M.order = null;
  M.error = null;
};

/**
 * Charge la réservation et range la réponse dans l'état.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchOrder = async function () {
  if (M.number === null || M.number === "") {
    M.status = "error";
    M.error = { texte: "Aucun numéro de réservation n'est indiqué.", lien: "Retour au catalogue", path: "/" };
    return;
  }

  try {
    let response = await OrderData.fetchByNumber(M.number);
    M.order = response.commande;
    M.status = "success";
  } catch (error) {
    M.status = "error";
    M.error = { texte: error.message, lien: "Retour au catalogue", path: "/" };

    if (error.statut === 401) {
      M.error = { texte: "Connectez-vous pour consulter votre réservation.", lien: "Me connecter", path: "/connexion" };
    }
  }
};

/**
 * Libellé d'un statut pour le client ; le statut brut s'il est inconnu.
 * . status : valeur de commande.statut
 * > chaîne
 *
 * @param {string} status
 * @returns {string}
 */
M.formatStatus = function (status) {
  return M.STATUS_LABELS[status] ?? status;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, order, statusLabel, error }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    order: M.order,
    statusLabel: M.order === null ? "" : M.formatStatus(M.order.statut),
    error: M.error,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge la réservation puis l'affiche.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadOrder = async function () {
  await M.fetchOrder();
  V.renderPage(M.getState());
};

/**
 * Point d'entrée : lit le numéro dans l'adresse, affiche le chargement, puis
 * charge la réservation sans l'attendre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
C.init = function () {
  M.reset(V.readOrderNumber());
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
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  return fragment;
};

/**
 * Numéro de réservation présent dans l'adresse (?numero=…).
 * . aucun paramètre
 * > chaîne, ou null s'il est absent
 *
 * @returns {string|null}
 */
V.readOrderNumber = function () {
  return new URLSearchParams(window.location.search).get("numero");
};

/**
 * Réservation confirmée : numéro, date, statut, lignes et total.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createOrderFragment = function (state) {
  let order = state.order;
  let fragment = htmlToFragment(
    genericRenderer(templateContent, {
      numero: order.numero,
      date: formatDate(order.date),
      statut: state.statusLabel,
      total: formatPrice(order.total),
      urlCatalogue: routeUrl("/bijoux"),
      urlCommandes: routeUrl("/compte/commandes"),
    })
  );

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
  fragment.querySelector('slot[name="reduction"]').replaceWith(TotalsView.dom(order));

  return fragment;
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
  let content = null;

  if (state.status === "loading") {
    content = htmlToFragment(templateLoading);
  } else if (state.status === "error") {
    content = htmlToFragment(
      genericRenderer(templateError, { texte: state.error.texte, lien: state.error.lien, url: routeUrl(state.error.path) })
    );
  } else {
    content = V.createOrderFragment(state);
  }

  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(content);
};

/**
 * Page appelée par le routeur sur la route « /commande/confirmation ».
 *
 * @returns {DocumentFragment}
 */
export function ConfirmationPage() {
  return C.init();
}
