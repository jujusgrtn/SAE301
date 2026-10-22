import { OrderData } from "../../data/commande.js";
import { formatDate, formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { PaginationView } from "../../ui/pagination/index.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
import { AccountNavigationView } from "../../ui/navigation-compte/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateEmpty from "./vide.html?raw";
import templateFilters from "./filtres.html?raw";
import templateStatus from "./statut.html?raw";
import templateReset from "./reinitialiser.html?raw";
import templateSummary from "./resume.html?raw";
import templateList from "./liste.html?raw";
import templateRow from "./ligne.html?raw";

/**
 * Page « Mes réservations » (US SUI-b) : /compte/commandes.
 *
 * L'historique du client connecté, les plus récentes d'abord, dix par page.
 * Les filtres (?statut=, ?du=, ?au=) et la page (?page=) sont dans l'adresse :
 * chaque vue se copie, se rouvre et se retrouve avec le bouton Précédent du
 * navigateur. Le serveur ne renvoie que les réservations du client connecté.
 */

// Les statuts d'une réservation, dans l'ordre du parcours, pour construire les filtres.
// Le serveur reste seul juge : une valeur inconnue dans l'adresse est ignorée ici
// et refusée (400) là-bas.
const STATUSES = ["en cours", "disponible", "retirée", "annulée"];

// Forme d'un jour dans l'adresse et dans un champ de date : AAAA-MM-JJ.
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Chemin de la page, sans le chemin du projet.
const PATH = "/compte/commandes";

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage : une réponse d'un affichage précédent est ignorée
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  filters: { statut: null, du: null, au: null, page: 1 }, // lus dans l'adresse
  orders: [], // réservations de la page affichée
  counts: {}, // nombre de réservations par statut (toutes, filtres ou non)
  total: 0, // réservations qui correspondent aux filtres, toutes pages confondues
  page: 1, // page réellement affichée (le serveur ramène une page trop loin à la dernière)
  pagesTotal: 1,
  loadError: null, // texte si la liste n'a pas pu être chargée
};

/**
 * Remet l'état à zéro et lit les filtres. Une valeur illisible est ignorée.
 * . params : paramètres de l'adresse (?statut=…&du=…&au=…&page=…)
 * > aucune valeur de retour
 *
 * @param {URLSearchParams} params
 * @returns {void}
 */
M.reset = function (params) {
  let status = params.get("statut");
  let from = params.get("du");
  let until = params.get("au");
  let page = Number(params.get("page"));

  M.visit += 1;
  M.status = "loading";
  M.filters = {
    statut: status !== null && STATUSES.includes(status) ? status : null,
    du: from !== null && DAY_PATTERN.test(from) ? from : null,
    au: until !== null && DAY_PATTERN.test(until) ? until : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
  M.orders = [];
  M.counts = {};
  M.total = 0;
  M.page = 1;
  M.pagesTotal = 1;
  M.loadError = null;
};

/**
 * Charge la page demandée. Un 401 n'est pas une panne : il signifie que le
 * client n'est pas connecté. Si l'on a changé de filtre ou de page pendant
 * l'attente, la réponse est ignorée.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchOrders = async function () {
  let visit = M.visit;

  try {
    let data = await OrderData.fetchHistory(M.filters);
    if (visit !== M.visit) {
      return;
    }
    M.orders = data.commandes;
    M.counts = data.effectifs;
    M.total = data.total;
    M.page = data.page;
    M.pagesTotal = data.pages;
    M.status = "ready";
  } catch (error) {
    if (visit !== M.visit) {
      return;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger vos réservations : ${error.message}`;
    }
  }
};

/**
 * Chemin de la page pour des filtres donnés : ceux de l'état, modifiés par
 * `changes`. La page 1 et les filtres vides ne s'écrivent pas.
 * . changes : propriétés de M.filters à remplacer (statut, du, au, page)
 * > chemin de route, par exemple « /compte/commandes?statut=retirée&page=2 »
 *
 * @param {Object} changes
 * @returns {string}
 */
M.buildPath = function (changes) {
  let filters = Object.assign({}, M.filters, changes);
  let params = new URLSearchParams();

  if (filters.statut !== null) {
    params.set("statut", filters.statut);
  }
  if (filters.du !== null) {
    params.set("du", filters.du);
  }
  if (filters.au !== null) {
    params.set("au", filters.au);
  }
  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }

  let query = params.toString();
  return query === "" ? PATH : `${PATH}?${query}`;
};

/**
 * Vérifie la période saisie : le premier jour ne peut pas suivre le dernier.
 * . from : jour de début (AAAA-MM-JJ), ou null
 * . until : jour de fin (AAAA-MM-JJ), ou null
 * > message d'erreur, ou null si la période est correcte
 *
 * @param {string|null} from
 * @param {string|null} until
 * @returns {string|null}
 */
M.checkPeriod = function (from, until) {
  if (from !== null && until !== null && from > until) {
    return "La date de début doit précéder la date de fin.";
  }
  return null;
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
 * Indique si un filtre (statut ou période) est appliqué.
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.hasFilter = function () {
  return M.filters.statut !== null || M.filters.du !== null || M.filters.au !== null;
};

/**
 * Phrase qui annonce le résultat : « 14 réservations », « 3 réservations pour ces filtres ».
 * . aucun paramètre
 * > chaîne
 *
 * @returns {string}
 */
M.formatSummary = function () {
  let noun = M.total > 1 ? "réservations" : "réservation";
  return M.hasFilter() ? `${M.total} ${noun} pour ces filtres` : `${M.total} ${noun}`;
};

/**
 * Les liens de filtre par statut : « Toutes » puis un par statut. Changer de
 * filtre revient à la première page ; la période est conservée.
 * . aucun paramètre
 * > [{ status, count, path, isCurrent }] (status null pour « Toutes »)
 *
 * @returns {Array<Object>}
 */
M.getStatusEntries = function () {
  let entries = [
    { status: null, count: M.getTotalCount(), path: M.buildPath({ statut: null, page: 1 }), isCurrent: M.filters.statut === null },
  ];

  for (let i = 0; i < STATUSES.length; i++) {
    entries.push({
      status: STATUSES[i],
      count: M.counts[STATUSES[i]] ?? 0,
      path: M.buildPath({ statut: STATUSES[i], page: 1 }),
      isCurrent: M.filters.statut === STATUSES[i],
    });
  }
  return entries;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, filters, orders, summary, hasFilter, statusEntries, resetPeriodPath, page, pagesTotal,
 *     previousPath, nextPath, loadError }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    filters: M.filters,
    orders: M.orders,
    summary: M.formatSummary(),
    hasFilter: M.hasFilter(),
    statusEntries: M.getStatusEntries(),
    resetPeriodPath: M.buildPath({ du: null, au: null, page: 1 }),
    page: M.page,
    pagesTotal: M.pagesTotal,
    previousPath: M.page > 1 ? M.buildPath({ page: M.page - 1 }) : null,
    nextPath: M.page < M.pagesTotal ? M.buildPath({ page: M.page + 1 }) : null,
    loadError: M.loadError,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge l'historique puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadOrders = async function () {
  let visit = M.visit;

  await M.fetchOrders();
  if (visit !== M.visit) {
    return;
  }
  V.renderPage(M.getState());
};

/**
 * Envoi du formulaire de période : vérifie les jours, puis recharge la page
 * avec les nouveaux filtres (retour à la première page). Une période
 * incohérente n'est pas envoyée : le message s'affiche sous les champs.
 * . ev : événement submit du formulaire
 * > aucune valeur de retour
 *
 * @param {SubmitEvent} ev
 * @returns {void}
 */
C.handler_submitPeriod = function (ev) {
  ev.preventDefault();

  let values = V.readPeriod(ev.target);
  let message = M.checkPeriod(values.du, values.au);

  if (message !== null) {
    V.showPeriodError(message);
    return;
  }

  V.navigate(M.buildPath({ du: values.du, au: values.au, page: 1 }));
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
  M.reset(V.readQuery());
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
 * Crée la structure de la page, y place la navigation de l'espace, mémorise sa racine
 * et écoute l'envoi du formulaire de période (délégation : le formulaire est recréé à chaque rendu).
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  fragment.querySelector('slot[name="navigation"]').replaceWith(AccountNavigationView.dom());
  V.root.addEventListener("submit", C.handler_submitPeriod);
  return fragment;
};

/**
 * Paramètres de l'adresse (?statut=…&du=…&au=…&page=…).
 * . aucun paramètre
 * > URLSearchParams
 *
 * @returns {URLSearchParams}
 */
V.readQuery = function () {
  return new URLSearchParams(window.location.search);
};

/**
 * Jours saisis dans le formulaire de période ; un champ vide vaut null.
 * . form : le formulaire de période
 * > { du, au }
 *
 * @param {HTMLFormElement} form
 * @returns {{du: string|null, au: string|null}}
 */
V.readPeriod = function (form) {
  let from = form.elements["du"].value;
  let until = form.elements["au"].value;

  return {
    du: from === "" ? null : from,
    au: until === "" ? null : until,
  };
};

/**
 * Affiche l'erreur de période sous les champs et place le focus sur le champ
 * de début, pour qu'on la corrige sans chercher.
 * . message : texte à afficher
 * > aucune valeur de retour
 *
 * @param {string} message
 * @returns {void}
 */
V.showPeriodError = function (message) {
  V.root.querySelector('[data-zone="erreur-periode"]').textContent = message;
  V.root.querySelector("#filtre-du").focus();
};

/**
 * Change d'adresse sans recharger le navigateur. Le routeur n'écoute que
 * popstate : on change l'adresse, puis on le prévient, comme le ferait le
 * bouton Précédent du navigateur.
 * . path : chemin de route, avec sa chaîne de requête
 * > aucune valeur de retour
 *
 * @param {string} path
 * @returns {void}
 */
V.navigate = function (path) {
  window.history.pushState(null, "", routeUrl(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Filtres par statut (lien actif : aria-current="page") et formulaire de période.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createFiltersFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateFilters, {
      statut: state.filters.statut ?? "",
      du: state.filters.du ?? "",
      au: state.filters.au ?? "",
    })
  );
  let list = fragment.querySelector('[data-zone="statuts"]');

  for (let i = 0; i < state.statusEntries.length; i++) {
    let entry = state.statusEntries[i];
    let item = htmlToFragment(
      genericRenderer(templateStatus, {
        href: routeUrl(entry.path),
        libelle: entry.status === null ? "Toutes" : StatusBadgeView.formatOneLabel(entry.status),
        effectif: entry.count,
      })
    );

    if (entry.isCurrent) {
      item.querySelector("a").setAttribute("aria-current", "page");
    }
    list.append(item);
  }

  let slot = fragment.querySelector('slot[name="reinitialiser"]');
  if (state.filters.du !== null || state.filters.au !== null) {
    slot.replaceWith(htmlToFragment(genericRenderer(templateReset, { href: routeUrl(state.resetPeriodPath) })));
  } else {
    slot.remove();
  }
  return fragment;
};

/**
 * Ligne d'une réservation dans la liste.
 * . order : réservation renvoyée par GET /api/commandes
 * > DocumentFragment
 *
 * @param {Object} order
 * @returns {DocumentFragment}
 */
V.formatOneRow = function (order) {
  let fragment = htmlToFragment(
    genericRenderer(templateRow, {
      href: routeUrl(`${PATH}/${encodeURIComponent(order.numero)}`),
      numero: order.numero,
      date: formatDate(order.date),
      articles: order.nombreArticles,
      total: formatPrice(order.total),
    })
  );
  fragment.querySelector('slot[name="statut"]').replaceWith(StatusBadgeView.dom(order.statut));
  return fragment;
};

/**
 * Message affiché quand aucune réservation ne correspond.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createEmptyFragment = function (state) {
  if (state.hasFilter) {
    return htmlToFragment(
      genericRenderer(templateEmpty, {
        texte: "Aucune réservation ne correspond à ces filtres.",
        href: routeUrl(PATH),
        lien: "Voir toutes mes réservations",
      })
    );
  }
  return htmlToFragment(
    genericRenderer(templateEmpty, {
      texte: "Vous n'avez pas encore de réservation.",
      href: routeUrl("/"),
      lien: "Découvrir les bijoux",
    })
  );
};

/**
 * Filtres, résultat et liste paginée des réservations, ou message si aucune
 * ne correspond.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createListFragment = function (state) {
  let fragment = V.createFiltersFragment(state);

  if (state.orders.length === 0) {
    fragment.append(V.createEmptyFragment(state));
    return fragment;
  }

  fragment.append(htmlToFragment(genericRenderer(templateSummary, { texte: state.summary })));

  let list = htmlToFragment(templateList);
  let rows = list.querySelector('[data-zone="lignes"]');
  for (let i = 0; i < state.orders.length; i++) {
    rows.append(V.formatOneRow(state.orders[i]));
  }
  fragment.append(list);

  if (state.pagesTotal > 1) {
    fragment.append(
      PaginationView.dom({
        page: state.page,
        pagesTotal: state.pagesTotal,
        hrefPrecedente: state.previousPath === null ? null : routeUrl(state.previousPath),
        hrefSuivante: state.nextPath === null ? null : routeUrl(state.nextPath),
      })
    );
  }
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
    return htmlToFragment(genericRenderer(templateUnauthorized, { urlConnexion: routeUrl("/connexion") }));
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
 * Page appelée par le routeur sur la route « /compte/commandes ».
 *
 * @returns {DocumentFragment}
 */
export function OrderHistoryPage() {
  return C.init();
}
