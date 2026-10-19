import { CategoryData } from "../../data/categorie.js";
import { CartData, CART_CHANGED_EVENT } from "../../data/panier.js";
import { htmlToFragment } from "../../lib/utils.js";
import { HeaderView } from "../../ui/header/index.js";
import { CategoryMenuView } from "../../ui/menu-categories/index.js";
import { CartBadgeView } from "../../ui/compteur-panier/index.js";
import template from "./template.html?raw";

/**
 * Layout principal : l'en-tête, son menu des catégories et le compteur du
 * panier, puis la page.
 *
 * Le routeur reconstruit le layout à chaque navigation, sans l'attendre : le
 * menu et le compteur sont donc chargés une seule fois, gardés dans le modèle,
 * puis réaffichés directement aux navigations suivantes. Le compteur est
 * ensuite tenu à jour par l'événement CART_CHANGED_EVENT, émis par les pages
 * qui modifient le panier.
 */

// ---------------------------------------------------------------------------
// M — Modèle : catégories du menu et nombre d'articles du panier
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "success" | "error"
  categories: [], // arbre renvoyé par GET /api/categories
  isFetching: false, // vrai pendant la requête, pour ne pas la doubler
  cartCount: null, // nombre d'articles du panier, null tant qu'il est inconnu
  isFetchingCart: false,
};

/**
 * Charge le nombre d'articles du panier de la session.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchCartCount = async function () {
  M.isFetchingCart = true;

  try {
    let cart = await CartData.fetch();
    M.cartCount = cart.nombreArticles;
  } catch (error) {
    // Sans compteur, le lien « Panier » reste utilisable : on retentera à la
    // navigation suivante.
    M.cartCount = null;
  }

  M.isFetchingCart = false;
};

/**
 * Indique s'il faut charger le compteur : inconnu, et pas déjà en cours.
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.shouldFetchCart = function () {
  return M.cartCount === null && !M.isFetchingCart;
};

/**
 * Enregistre le nombre d'articles annoncé par une page ; une valeur qui n'est
 * pas un entier positif ou nul est ignorée.
 * . count : nombre d'articles
 * > aucune valeur de retour
 *
 * @param {number} count
 * @returns {void}
 */
M.setCartCount = function (count) {
  if (Number.isInteger(count) && count >= 0) {
    M.cartCount = count;
  }
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
 * > { status, categories, cartCount }
 *
 * @returns {{status: string, categories: Array<Object>, cartCount: number|null}}
 */
M.getState = function () {
  return { status: M.status, categories: M.categories, cartCount: M.cartCount };
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
 * Charge le compteur du panier puis l'affiche dans le layout courant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadCartCount = async function () {
  await M.fetchCartCount();
  V.renderCartCount(M.getState());
};

/**
 * Une page a modifié le panier : le compteur prend la valeur annoncée.
 * . ev : CustomEvent CART_CHANGED_EVENT, detail { nombreArticles }
 * > aucune valeur de retour
 *
 * @param {CustomEvent} ev
 * @returns {void}
 */
C.handler_cartChanged = function (ev) {
  M.setCartCount(ev.detail.nombreArticles);
  V.renderCartCount(M.getState());
};

/**
 * Construit le layout, affiche le menu et le compteur connus, et les charge
 * si besoin.
 * . aucun paramètre
 * > DocumentFragment du layout
 *
 * @returns {DocumentFragment}
 */
C.init = function () {
  let fragment = V.init();
  V.renderMenu(M.getState());
  V.renderCartCount(M.getState());

  if (M.shouldFetch()) {
    C.loadMenu();
  }
  if (M.shouldFetchCart()) {
    C.loadCartCount();
  }

  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue
// ---------------------------------------------------------------------------

let V = {};

V.menuZone = null; // zone du menu dans le dernier layout construit
V.cartCountZone = null; // zone du compteur dans le dernier layout construit
V.isListening = false; // l'écouteur sur document n'est posé qu'une fois

/**
 * Crée le layout et l'en-tête, et mémorise les zones du menu et du compteur.
 * Le slot sans nom est laissé au routeur, qui y place la page.
 *
 * L'écouteur de CART_CHANGED_EVENT est posé sur document, qui survit aux
 * navigations : une seule fois, sinon il serait ajouté à chaque page.
 * . aucun paramètre
 * > DocumentFragment du layout
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let layout = htmlToFragment(template);
  layout.querySelector('slot[name="header"]').replaceWith(HeaderView.dom());
  V.menuZone = layout.querySelector('[data-zone="menu"]');
  V.cartCountZone = layout.querySelector('[data-zone="compteur-panier"]');

  if (!V.isListening) {
    document.addEventListener(CART_CHANGED_EVENT, C.handler_cartChanged);
    V.isListening = true;
  }

  return layout;
};

/**
 * Affiche la pastille du nombre d'articles (rien si le panier est vide).
 * . state : { cartCount }
 * > aucune valeur de retour
 *
 * @param {{cartCount: number|null}} state
 * @returns {void}
 */
V.renderCartCount = function (state) {
  V.cartCountZone.replaceChildren(CartBadgeView.dom(state.cartCount));
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
