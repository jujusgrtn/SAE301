import { CategoryData } from "../../data/categorie.js";
import { htmlToFragment } from "../../lib/utils.js";
import { HeaderView } from "../../ui/header/index.js";
import { CategoryMenuView } from "../../ui/menu-categories/index.js";
import template from "./template.html?raw";

/**
 * Layout principal : l'en-tête et son menu des catégories, puis la page.
 *
 * Le routeur reconstruit le layout à chaque navigation, sans l'attendre : le
 * menu est donc chargé une seule fois, gardé dans le modèle, puis réaffiché
 * directement aux navigations suivantes.
 */

// ---------------------------------------------------------------------------
// M — Modèle : catégories du menu
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "success" | "error"
  categories: [], // arbre renvoyé par GET /api/categories
  isFetching: false, // vrai pendant la requête, pour ne pas la doubler
};

/**
 * Charge l'arbre des catégories et le garde dans l'état.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchCategories = async function () {
  M.isFetching = true;

  try {
    let response = await CategoryData.fetchMenu();
    M.categories = response.categories;
    M.status = "success";
  } catch (error) {
    // Le menu n'est pas indispensable : la page reste utilisable sans lui.
    M.categories = [];
    M.status = "error";
  }

  M.isFetching = false;
};

/**
 * Indique s'il faut lancer le chargement : pas encore réussi, et pas déjà en cours.
 * Après une erreur, la navigation suivante retente donc sa chance.
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.shouldFetch = function () {
  return M.status !== "success" && !M.isFetching;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, categories }
 *
 * @returns {{status: string, categories: Array<Object>}}
 */
M.getState = function () {
  return { status: M.status, categories: M.categories };
};

// ---------------------------------------------------------------------------
// C — Contrôleur
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le menu puis l'affiche dans le layout courant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadMenu = async function () {
  await M.fetchCategories();
  V.renderMenu(M.getState());
};

/**
 * Construit le layout, affiche le menu connu, et le charge si besoin.
 * . aucun paramètre
 * > DocumentFragment du layout
 *
 * @returns {DocumentFragment}
 */
C.init = function () {
  let fragment = V.init();
  V.renderMenu(M.getState());

  if (M.shouldFetch()) {
    C.loadMenu();
  }

  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue
// ---------------------------------------------------------------------------

let V = {};

V.menuZone = null; // zone du menu dans le dernier layout construit

/**
 * Crée le layout et l'en-tête, et mémorise la zone du menu.
 * Le slot sans nom est laissé au routeur, qui y place la page.
 * . aucun paramètre
 * > DocumentFragment du layout
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let layout = htmlToFragment(template);
  layout.querySelector('slot[name="header"]').replaceWith(HeaderView.dom());
  V.menuZone = layout.querySelector('[data-zone="menu"]');
  return layout;
};

/**
 * Affiche le menu selon l'état : rien pendant le chargement (la zone garde sa
 * hauteur), les liens en cas de succès, un message en cas d'erreur.
 * . state : { status, categories }
 * > aucune valeur de retour
 *
 * @param {{status: string, categories: Array<Object>}} state
 * @returns {void}
 */
V.renderMenu = function (state) {
  if (state.status === "loading") {
    V.menuZone.replaceChildren();
    return;
  }

  let categories = state.status === "success" ? state.categories : null;
  V.menuZone.replaceChildren(CategoryMenuView.dom(categories, window.location.pathname));
};

/**
 * Layout appelé par le routeur à chaque navigation.
 *
 * @returns {DocumentFragment}
 */
export function RootLayout() {
  return C.init();
}
