import { ProductData } from "../../data/produit.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { buildListState, buildSearch, readFilters } from "../../lib/catalogue.js";
import { CatalogueView } from "../../ui/catalogue/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateHeader from "./entete.html?raw";
import templateParent from "./parent.html?raw";
import templateError from "./erreur.html?raw";

/**
 * Page « Catégorie » (US DEC-a) : /categorie/:slug.
 *
 * Le slug désigne une catégorie principale (Colliers : tous ses bijoux) ou une
 * sous-catégorie (Colliers plaqué or). La page s'affiche aussitôt en état de
 * chargement, puis se met à jour lorsque l'API a répondu.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  slug: null, // catégorie demandée par la dernière navigation
  status: "loading", // "loading" | "success" | "error"
  category: null, // { nom, slug, description }
  parent: null, // { nom, slug } pour une sous-catégorie, sinon null
  subCategories: [], // [{ nom, slug }] de la catégorie principale
  products: [],
  message: null, // { titre, texte } en cas d'erreur
  filters: { groupes: [], dispo: [], prix: [], tri: "nouveautes", page: 1 },
};

/**
 * Remet l'état à zéro pour une nouvelle catégorie.
 * . slug : slug lu dans l'URL
 * > aucune valeur de retour
 *
 * @param {string} slug
 * @returns {void}
 */
M.reset = function (slug) {
  M.slug = slug;
  M.status = "loading";
  M.category = null;
  M.parent = null;
  M.subCategories = [];
  M.products = [];
  M.message = null;
  M.filters = { groupes: [], dispo: [], prix: [], tri: "nouveautes", page: 1 };
};

/**
 * Charge une catégorie et ses bijoux, et range la réponse dans l'état.
 *
 * Si l'utilisateur a changé de catégorie pendant le chargement, la réponse
 * arrivée en retard est ignorée : elle ne doit pas écraser la plus récente.
 * . slug : slug de la catégorie
 * > Promise<boolean> : vrai si la réponse concerne toujours la catégorie affichée
 *
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
M.fetchCategory = async function (slug) {
  let response = null;
  let message = null;

  try {
    response = await ProductData.fetchByCategory(slug);
  } catch (error) {
    if (error.statut === 404) {
      message = { titre: "Catégorie introuvable", texte: "Cette catégorie n'existe pas ou n'est plus proposée." };
    } else {
      message = { titre: "Catégorie indisponible", texte: `Impossible de charger les bijoux : ${error.message}` };
    }
  }

  if (slug !== M.slug) {
    return false;
  }

  if (message !== null) {
    M.status = "error";
    M.message = message;
    return true;
  }

  M.category = response.categorie;
  M.parent = response.parent;
  M.subCategories = response.sousCategories;
  M.products = response.produits;
  M.status = "success";
  return true;
};

/**
 * Titre de la page : « Bagues · Acier inoxydable » pour une sous-catégorie,
 * dont le nom seul serait ambigu, sinon le nom de la catégorie.
 * . aucun paramètre
 * > chaîne, ou chaîne vide tant que la catégorie n'est pas chargée
 *
 * @returns {string}
 */
M.getTitle = function () {
  if (M.category === null) {
    return "";
  }
  if (M.parent === null) {
    return M.category.nom;
  }
  return `${M.parent.nom} · ${M.category.nom}`;
};

/**
 * Sous-catégories proposées en filtre : celles de la catégorie principale
 * affichée, et aucune sur une page de sous-catégorie (déjà filtrée).
 * . aucun paramètre
 * > [{ valeur, libelle }]
 *
 * @returns {Array<{valeur: string, libelle: string}>}
 */
M.getGroups = function () {
  if (M.parent !== null) {
    return [];
  }
  return M.subCategories.map(function (sub) {
    return { valeur: sub.slug, libelle: sub.nom };
  });
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
 * . filter : « groupe », « dispo » ou « prix » ; value ; checked
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
  M.filters = { groupes: [], dispo: [], prix: [], tri: M.filters.tri, page: 1 };
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, title, category, parent, message, list, search }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    title: M.getTitle(),
    category: M.category,
    parent: M.parent,
    message: M.message,
    search: buildSearch(M.filters),
    list:
      M.status === "success"
        ? buildListState(M.products, M.filters, M.getGroups(), "Sous-catégorie", function (product) {
            return product.sousCategorie.slug;
          })
        : null,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge la catégorie puis rafraîchit l'affichage, sauf si une autre
 * catégorie a été demandée entre-temps.
 * . slug : slug de la catégorie
 * > Promise<void>
 *
 * @param {string} slug
 * @returns {Promise<void>}
 */
C.loadCategory = async function (slug) {
  let isCurrent = await M.fetchCategory(slug);

  if (isCurrent) {
    M.setFiltersFromSearch(V.readSearch());
    V.renderPage(M.getState(), C.actions);
  }
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
 * Point d'entrée : page en état de chargement, rendue au routeur, puis
 * chargement lancé sans l'attendre.
 * . slug : slug lu dans l'URL
 * > DocumentFragment de la page
 *
 * @param {string} slug
 * @returns {DocumentFragment}
 */
C.init = function (slug) {
  M.reset(slug);
  let fragment = V.init();
  V.renderPage(M.getState(), C.actions);
  C.loadCategory(slug);
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
 * Remonte en haut de la page après un changement de page.
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
 * Message d'erreur, avec un lien de retour vers le catalogue.
 * . message : { titre, texte }
 * > DocumentFragment
 *
 * @param {{titre: string, texte: string}} message
 * @returns {DocumentFragment}
 */
V.createErrorFragment = function (message) {
  return htmlToFragment(
    genericRenderer(templateError, {
      titre: message.titre,
      texte: message.texte,
      urlCatalogue: routeUrl("/bijoux"),
    })
  );
};

/**
 * En-tête de la catégorie (fil d'Ariane, titre, description), filtres et grille.
 * . state : état renvoyé par M.getState() ; actions : callbacks de C
 * > DocumentFragment
 *
 * @param {Object} state
 * @param {Object} actions
 * @returns {DocumentFragment}
 */
V.createCategoryFragment = function (state, actions) {
  let fragment = htmlToFragment(
    genericRenderer(templateHeader, {
      urlAccueil: routeUrl("/"),
      urlCatalogue: routeUrl("/bijoux"),
      nom: state.category.nom,
      titre: state.title,
      description: state.category.description,
    })
  );

  let parentSlot = fragment.querySelector('slot[name="parent"]');
  if (state.parent === null) {
    parentSlot.remove();
  } else {
    parentSlot.replaceWith(
      htmlToFragment(
        genericRenderer(templateParent, {
          url: routeUrl(`/categorie/${encodeURIComponent(state.parent.slug)}`),
          nom: state.parent.nom,
        })
      )
    );
  }

  fragment.querySelector('slot[name="liste"]').replaceWith(CatalogueView.dom(state.list, actions));

  return fragment;
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
  let content = null;

  if (state.status === "loading") {
    content = htmlToFragment(templateLoading);
  } else if (state.status === "error") {
    content = V.createErrorFragment(state.message);
  } else {
    content = V.createCategoryFragment(state, actions);
  }

  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(content);
};

/**
 * Page appelée par le routeur sur la route « /categorie/:slug ».
 *
 * @param {{slug: string}} params - Paramètres de l'URL.
 * @returns {DocumentFragment}
 */
export function CategoryPage(params) {
  return C.init(params.slug);
}
