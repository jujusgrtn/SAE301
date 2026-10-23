import { ProductData } from "../../data/produit.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { buildListState, buildSearch, readFilters } from "../../lib/catalogue.js";
import { MessageView } from "../../ui/message/index.js";
import { CatalogueView } from "../../ui/catalogue/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";

/**
 * Page « Nos bijoux » (US DEC-b) : tous les bijoux de Matira Création, avec
 * filtres par catégorie, disponibilité et prix, tri et pagination. Les filtres
 * s'écrivent dans l'adresse (?groupe=…&pour=…).
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "success" | "error"
  products: [], // bijoux renvoyés par GET /api/produits
  message: null, // { type, texte }, ou null
  filters: { groupes: [], pour: [], prix: [], tri: "nouveautes", page: 1 },
};

/**
 * Charge tous les bijoux et range le résultat dans l'état.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchProducts = async function () {
  M.status = "loading";
  M.message = null;

  try {
    let response = await ProductData.fetchAll();
    M.products = response.produits;
    M.status = "success";
  } catch (error) {
    M.products = [];
    M.status = "error";
    M.message = { type: "erreur", texte: `Impossible de charger le catalogue : ${error.message}` };
  }
};

/**
 * Les catégories principales présentes dans le catalogue, dans l'ordre du catalogue.
 * . aucun paramètre
 * > [{ valeur, libelle }]
 *
 * @returns {Array<{valeur: string, libelle: string}>}
 */
M.getGroups = function () {
  let groups = [];

  M.products.map(function (product) {
    let known = groups.some(function (group) {
      return group.valeur === product.categorie.slug;
    });
    if (!known) {
      groups.push({ valeur: product.categorie.slug, libelle: product.categorie.nom });
    }
  });
  return groups;
};

/**
 * Lit les filtres de l'adresse (valeurs inconnues ignorées).
 * . search : chaîne de requête de l'adresse
 * > aucune valeur de retour
 *
 * @param {string} search
 * @returns {void}
 */
M.setFiltersFromSearch = function (search) {
  let slugs = M.getGroups().map(function (group) {
    return group.valeur;
  });
  M.filters = readFilters(search, slugs);
};

/**
 * Coche ou décoche une valeur d'un filtre ; la pagination repart de la page 1.
 * . filter : « groupe », « pour » ou « prix » ; value ; checked
 * > aucune valeur de retour
 *
 * @param {string} filter
 * @param {string} value
 * @param {boolean} checked
 * @returns {void}
 */
M.toggleFilter = function (filter, value, checked) {
  let key = filter === "groupe" ? "groupes" : filter;
  let others = M.filters[key].filter(function (item) {
    return item !== value;
  });

  M.filters[key] = checked ? others.concat(value) : others;
  M.filters.page = 1;
};

/**
 * Change le tri ; la pagination repart de la page 1.
 * . sort : valeur du tri
 * > aucune valeur de retour
 *
 * @param {string} sort
 * @returns {void}
 */
M.setSort = function (sort) {
  M.filters.tri = sort;
  M.filters.page = 1;
};

/**
 * Change de page.
 * . page : numéro
 * > aucune valeur de retour
 *
 * @param {number} page
 * @returns {void}
 */
M.setPage = function (page) {
  M.filters.page = page;
};

/**
 * Efface tous les filtres, en gardant le tri.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.resetFilters = function () {
  M.filters = { groupes: [], pour: [], prix: [], tri: M.filters.tri, page: 1 };
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, message, list, search }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    message: M.message,
    search: buildSearch(M.filters),
    list:
      M.status === "success"
        ? buildListState(M.products, M.filters, M.getGroups(), "Catégorie", function (product) {
            return product.categorie.slug;
          })
        : null,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le catalogue, applique les filtres de l'adresse puis rafraîchit l'affichage.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadCatalogue = async function () {
  await M.fetchProducts();
  M.setFiltersFromSearch(V.readSearch());
  V.renderPage(M.getState(), C.actions);
};

/**
 * Réaffiche la page après un changement de filtre et garde l'adresse à jour.
 * . focus : { filter, value } du contrôle à refocaliser
 * > aucune valeur de retour
 *
 * @param {{filter: string, value: string}} focus
 * @returns {void}
 */
C.refresh = function (focus) {
  let state = M.getState();

  V.writeSearch(state.search);
  V.renderPage(state, C.actions);
  V.restoreFocus(focus);
};

/**
 * Une case ou une pastille de filtre a changé.
 * . filter, value, checked : lus par la Vue dans l'événement
 * > aucune valeur de retour
 *
 * @param {string} filter
 * @param {string} value
 * @param {boolean} checked
 * @returns {void}
 */
C.handler_toggleFilter = function (filter, value, checked) {
  M.toggleFilter(filter, value, checked);
  C.refresh({ filter: filter, value: value });
};

/**
 * Le tri a changé.
 * . sort : valeur choisie
 * > aucune valeur de retour
 *
 * @param {string} sort
 * @returns {void}
 */
C.handler_changeSort = function (sort) {
  M.setSort(sort);
  C.refresh({ filter: "tri", value: "" });
};

/**
 * Un bouton de pagination a été activé.
 * . page : numéro demandé
 * > aucune valeur de retour
 *
 * @param {number} page
 * @returns {void}
 */
C.handler_goToPage = function (page) {
  M.setPage(page);
  C.refresh({ filter: "page", value: String(page) });
  V.scrollToTop();
};

/**
 * Le bouton « Réinitialiser les filtres » a été activé.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
C.handler_resetFilters = function () {
  M.resetFilters();
  C.refresh({ filter: "tri", value: "" });
};

C.actions = {
  onToggle: C.handler_toggleFilter,
  onSort: C.handler_changeSort,
  onPage: C.handler_goToPage,
  onReset: C.handler_resetFilters,
};

/**
 * Point d'entrée : construit la page en état de chargement, la rend au
 * routeur, puis lance le chargement sans l'attendre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
C.init = function () {
  M.status = "loading";
  let fragment = V.init();
  V.renderPage(M.getState(), C.actions);
  C.loadCatalogue();
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
  let fragment = htmlToFragment(genericRenderer(template, { urlAccueil: routeUrl("/") }));
  V.root = fragment.firstElementChild;
  return fragment;
};

/**
 * Chaîne de requête de l'adresse affichée.
 * . aucun paramètre
 * > chaîne, par exemple « ?groupe=bagues »
 *
 * @returns {string}
 */
V.readSearch = function () {
  return window.location.search;
};

/**
 * Remplace la chaîne de requête de l'adresse, sans ajouter d'entrée à l'historique.
 * . search : chaîne de requête (vide pour aucun filtre)
 * > aucune valeur de retour
 *
 * @param {string} search
 * @returns {void}
 */
V.writeSearch = function (search) {
  window.history.replaceState(window.history.state, "", window.location.pathname + search);
};

/**
 * Construit le contenu correspondant à l'état reçu.
 * . state : état renvoyé par M.getState() ; actions : callbacks de C
 * > DocumentFragment (chargement, erreur ou liste)
 *
 * @param {Object} state
 * @param {Object} actions
 * @returns {DocumentFragment}
 */
V.createContentFragment = function (state, actions) {
  if (state.status === "loading") {
    return htmlToFragment(templateLoading);
  }

  if (state.status === "error") {
    return MessageView.dom(state.message);
  }

  return CatalogueView.dom(state.list, actions);
};

/**
 * Remplace le contenu de la page par celui qui correspond à l'état reçu.
 * . state : état renvoyé par M.getState() ; actions : callbacks de C
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @param {Object} actions
 * @returns {void}
 */
V.renderPage = function (state, actions) {
  let zone = V.root.querySelector('[data-zone="contenu"]');
  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(V.createContentFragment(state, actions));
};

/**
 * Redonne le focus au contrôle qui vient d'être activé (il a été recréé par le rendu).
 * . focus : { filter, value }
 * > aucune valeur de retour
 *
 * @param {{filter: string, value: string}} focus
 * @returns {void}
 */
V.restoreFocus = function (focus) {
  let selector = focus.value === "" ? `[data-filter="${focus.filter}"]` : `[data-filter="${focus.filter}"][data-value="${focus.value}"]`;
  let candidates = Array.from(V.root.querySelectorAll(selector));
  // Les filtres existent en double (colonne desktop, pastilles mobile) : on cible celui qui est visible.
  let visible = candidates.find(function (element) {
    return element.getClientRects().length > 0;
  });
  let target = visible ?? candidates[0];

  if (target !== undefined) {
    target.focus();
  }
};

/**
 * Remonte en haut de la liste après un changement de page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.scrollToTop = function () {
  if (typeof V.root.scrollIntoView === "function") {
    V.root.scrollIntoView({ block: "start" });
  }
};

/**
 * Page appelée par le routeur sur la route « /bijoux ».
 *
 * @returns {DocumentFragment}
 */
export function CataloguePage() {
  return C.init();
}
