import { AdminOrderData } from "../../data/admin-commande.js";
import { formatDate, formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateEmpty from "./vide.html?raw";
import templateFilters from "./filtres.html?raw";
import templateFilter from "./filtre.html?raw";
import templateList from "./liste.html?raw";
import templateRow from "./ligne.html?raw";

/**
 * Page « Réservations » du back-office (US PIL-b) : /admin/commandes.
 *
 * Liste les réservations de tous les clients, les plus récentes d'abord, avec
 * des filtres par statut (?statut=disponible…). L'accès est décidé par le
 * serveur : un 401 affiche une invite à se connecter au back-office. Le détail
 * et les changements de statut sont sur la page de chaque réservation.
 */

// Les statuts d'une réservation, dans l'ordre du parcours, pour construire les filtres.
// Le serveur reste seul juge : une valeur inconnue dans l'adresse est ignorée ici
// et refusée (400) là-bas.
const STATUSES = ["en cours", "disponible", "retirée", "annulée"];

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  filter: null, // statut filtré, ou null pour toutes les réservations
  orders: [], // réservations renvoyées par l'API
  counts: {}, // nombre de réservations par statut (toutes, filtre ou non)
  loadError: null, // texte si la liste n'a pas pu être chargée
};

/**
 * Remet l'état à zéro avant un nouvel affichage de la page.
 * . filterValue : valeur de ?statut= dans l'adresse, ou null
 * > aucune valeur de retour
 *
 * @param {string|null} filterValue
 * @returns {void}
 */
M.reset = function (filterValue) {
  M.status = "loading";
  M.filter = filterValue !== null && STATUSES.includes(filterValue) ? filterValue : null;
  M.orders = [];
  M.counts = {};
  M.loadError = null;
};

/**
 * Charge les réservations. Un 401 n'est pas une panne : il signifie que
 * l'administrateur n'est pas connecté.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchOrders = async function () {
  try {
    let data = await AdminOrderData.fetchAll(M.filter);
    M.orders = data.commandes;
    M.counts = data.effectifs;
    M.status = "ready";
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger les réservations : ${error.message}`;
    }
  }
};

/**
 * Nombre de réservations, tous statuts confondus.
 * . aucun paramètre
 * > entier
 *
 * @returns {number}
 */
M.getTotalCount = function () {
  return STATUSES.reduce(function (sum, status) {
    return sum + (M.counts[status] ?? 0);
  }, 0);
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, filter, statuses, orders, counts, totalCount, loadError }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    filter: M.filter,
    statuses: STATUSES,
    orders: M.orders,
    counts: M.counts,
    totalCount: M.getTotalCount(),
    loadError: M.loadError,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge les réservations puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadOrders = async function () {
  await M.fetchOrders();
  V.renderPage(M.getState());
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
  M.reset(V.readFilter());
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadOrders();
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
  let fragment = htmlToFragment(genericRenderer(template, { urlBackOffice: routeUrl("/admin") }));
  V.root = fragment.firstElementChild;
  return fragment;
};

/**
 * Valeur de ?statut= dans l'adresse (liens des filtres).
 * . aucun paramètre
 * > chaîne, ou null si elle est absente
 *
 * @returns {string|null}
 */
V.readFilter = function () {
  return new URLSearchParams(window.location.search).get("statut");
};

/**
 * Barre des filtres : « Toutes » puis un lien par statut, avec le nombre de
 * réservations. Le filtre actif porte aria-current="page".
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createFiltersFragment = function (state) {
  let fragment = htmlToFragment(templateFilters);
  let list = fragment.querySelector('[data-zone="filtres"]');

  let entries = [{ valeur: null, libelle: "Toutes", effectif: state.totalCount }];
  for (let i = 0; i < state.statuses.length; i++) {
    entries.push({
      valeur: state.statuses[i],
      libelle: StatusBadgeView.formatOneLabel(state.statuses[i]),
      effectif: state.counts[state.statuses[i]] ?? 0,
    });
  }

  for (let i = 0; i < entries.length; i++) {
    let item = htmlToFragment(
      genericRenderer(templateFilter, {
        href: routeUrl(
          entries[i].valeur === null ? "/admin/commandes" : `/admin/commandes?statut=${encodeURIComponent(entries[i].valeur)}`
        ),
        libelle: entries[i].libelle,
        effectif: entries[i].effectif,
      })
    );

    if (entries[i].valeur === state.filter) {
      item.querySelector("a").setAttribute("aria-current", "page");
    }
    list.append(item);
  }
  return fragment;
};

/**
 * Ligne d'une réservation dans la liste.
 * . order : réservation renvoyée par GET /api/admin/commandes
 * > DocumentFragment
 *
 * @param {Object} order
 * @returns {DocumentFragment}
 */
V.formatOneRow = function (order) {
  let fragment = htmlToFragment(
    genericRenderer(templateRow, {
      href: routeUrl(`/admin/commandes/${encodeURIComponent(order.numero)}`),
      numero: order.numero,
      date: formatDate(order.date),
      client: `${order.client.prenom} ${order.client.nom}`,
      email: order.client.email,
      articles: order.nombreArticles,
      total: formatPrice(order.total),
    })
  );
  fragment.querySelector('slot[name="statut"]').replaceWith(StatusBadgeView.dom(order.statut));
  return fragment;
};

/**
 * Filtres et liste des réservations, ou message si aucune ne correspond.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createListFragment = function (state) {
  let fragment = V.createFiltersFragment(state);

  if (state.orders.length === 0) {
    let text =
      state.filter === null
        ? "Aucune réservation pour l'instant."
        : `Aucune réservation « ${state.filter} » pour l'instant.`;

    fragment.append(htmlToFragment(genericRenderer(templateEmpty, { texte: text })));
    return fragment;
  }

  let list = htmlToFragment(templateList);
  let rows = list.querySelector('[data-zone="lignes"]');
  for (let i = 0; i < state.orders.length; i++) {
    rows.append(V.formatOneRow(state.orders[i]));
  }
  fragment.append(list);
  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, erreur ou liste.
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
    return htmlToFragment(genericRenderer(templateUnauthorized, { urlBackOffice: routeUrl("/admin") }));
  }
  if (state.status === "error") {
    return htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError }));
  }
  return V.createListFragment(state);
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
 * Page appelée par le routeur sur la route « /admin/commandes ».
 *
 * @returns {DocumentFragment}
 */
export function AdminOrdersPage() {
  return C.init();
}
