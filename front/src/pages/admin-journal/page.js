import { AdminJournalData } from "../../data/admin-journal.js";
import { formatDate } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { PaginationView } from "../../ui/pagination/index.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateEmpty from "./vide.html?raw";
import templateList from "./liste.html?raw";
import templateRow from "./ligne.html?raw";

/**
 * Page « Journal » du back-office (US PIL-b) : /admin/journal.
 *
 * Les modifications faites par les administrateurs, les plus récentes d'abord,
 * 30 par page (?page=2). Le journal est écrit par le serveur en même temps que
 * chaque modification : cette page ne fait que le lire. Un 401 affiche une invite
 * à se connecter au back-office.
 */

const PATH = "/admin/journal";

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage : une réponse d'un affichage précédent est ignorée
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  requestedPage: 1, // page demandée dans l'adresse
  journal: null, // réponse de GET /api/admin/journal
  loadError: null, // texte si le journal n'a pas pu être chargé
};

/**
 * Remet l'état à zéro avant un nouvel affichage de la page.
 * . pageValue : valeur de ?page= dans l'adresse, ou null
 * > aucune valeur de retour
 *
 * @param {string|null} pageValue
 * @returns {void}
 */
M.reset = function (pageValue) {
  let page = Number(pageValue);

  M.visit += 1;
  M.status = "loading";
  M.requestedPage = Number.isInteger(page) && page > 1 ? page : 1;
  M.journal = null;
  M.loadError = null;
};

/**
 * Charge la page du journal. Un 401 n'est pas une panne : il signifie que
 * l'administrateur n'est pas connecté.
 * . aucun paramètre
 * > Promise<boolean> : vrai si la réponse concerne toujours la page affichée
 *
 * @returns {Promise<boolean>}
 */
M.fetchJournal = async function () {
  let visit = M.visit;

  try {
    let journal = await AdminJournalData.fetch(M.requestedPage);
    if (visit !== M.visit) {
      return false;
    }
    M.journal = journal;
    M.status = "ready";
  } catch (error) {
    if (visit !== M.visit) {
      return false;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger le journal : ${error.message}`;
    }
  }
  return true;
};

/**
 * Chemin d'une page du journal.
 * . page : numéro de page
 * > chemin de route
 *
 * @param {number} page
 * @returns {string}
 */
M.buildPath = function (page) {
  return page > 1 ? `${PATH}?page=${page}` : PATH;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, loadError, entries, totalLabel, page, pagesTotal, previousPath, nextPath }
 *
 * @returns {Object}
 */
M.getState = function () {
  let journal = M.journal;

  return {
    status: M.status,
    loadError: M.loadError,
    entries: journal === null ? [] : journal.entrees,
    totalLabel: journal === null ? "" : `${journal.total} modification${journal.total > 1 ? "s" : ""}`,
    page: journal === null ? 1 : journal.page,
    pagesTotal: journal === null ? 1 : journal.pages,
    previousPath: journal !== null && journal.page > 1 ? M.buildPath(journal.page - 1) : null,
    nextPath: journal !== null && journal.page < journal.pages ? M.buildPath(journal.page + 1) : null,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le journal puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadJournal = async function () {
  if (await M.fetchJournal()) {
    V.renderPage(M.getState());
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
  M.reset(V.readPage());
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadJournal();
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
 * Valeur de ?page= dans l'adresse.
 * . aucun paramètre
 * > chaîne, ou null si elle est absente
 *
 * @returns {string|null}
 */
V.readPage = function () {
  return new URLSearchParams(window.location.search).get("page");
};

/**
 * Ce qui a changé, en toutes lettres : « En cours → Disponible au retrait ».
 * . entry : entrée du journal
 * > chaîne
 *
 * @param {Object} entry
 * @returns {string}
 */
V.formatOneChange = function (entry) {
  if (entry.statutAvant === null || entry.statutApres === null) {
    return entry.action;
  }
  return `${StatusBadgeView.formatOneLabel(entry.statutAvant)} → ${StatusBadgeView.formatOneLabel(entry.statutApres)}`;
};

/**
 * Ligne du journal.
 * . entry : entrée renvoyée par GET /api/admin/journal
 * > DocumentFragment
 *
 * @param {Object} entry
 * @returns {DocumentFragment}
 */
V.formatOneRow = function (entry) {
  let details = [];
  if (entry.detail !== "") {
    details.push(entry.detail);
  }
  if (entry.lot !== null) {
    details.push("action en lot");
  }

  return htmlToFragment(
    genericRenderer(templateRow, {
      date: formatDate(entry.date),
      administrateur: entry.administrateur,
      href: routeUrl(`/admin/commandes/${encodeURIComponent(entry.cible)}`),
      cible: entry.cible,
      changement: V.formatOneChange(entry),
      precision: details.join(" · "),
    })
  );
};

/**
 * Liste des entrées et pagination, ou message si le journal est vide.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createListFragment = function (state) {
  if (state.entries.length === 0) {
    return htmlToFragment(templateEmpty);
  }

  let fragment = htmlToFragment(genericRenderer(templateList, { total: state.totalLabel }));
  let list = fragment.querySelector('[data-zone="entrees"]');

  for (let i = 0; i < state.entries.length; i++) {
    list.append(V.formatOneRow(state.entries[i]));
  }

  let slot = fragment.querySelector('slot[name="pagination"]');
  if (state.pagesTotal > 1) {
    slot.replaceWith(
      PaginationView.dom({
        page: state.page,
        pagesTotal: state.pagesTotal,
        hrefPrecedente: state.previousPath === null ? null : routeUrl(state.previousPath),
        hrefSuivante: state.nextPath === null ? null : routeUrl(state.nextPath),
      })
    );
  } else {
    slot.remove();
  }
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
  } else if (state.status === "unauthorized") {
    content = htmlToFragment(genericRenderer(templateUnauthorized, { urlBackOffice: routeUrl("/admin") }));
  } else if (state.status === "error") {
    content = htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError }));
  } else {
    content = V.createListFragment(state);
  }

  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(content);
};

/**
 * Page appelée par le routeur sur la route « /admin/journal ».
 *
 * @returns {DocumentFragment}
 */
export function AdminJournalPage() {
  return C.init();
}
