import { CategoryData } from "../../data/categorie.js";
import { CartData, CART_CHANGED_EVENT } from "../../data/panier.js";
import { AccountData, ACCOUNT_CHANGED_EVENT } from "../../data/compte.js";
import { htmlToFragment } from "../../lib/utils.js";
import { CURRENCIES, CURRENCY_CHANGED_EVENT, getCurrency, isCurrencyLocked, setCurrency } from "../../lib/currency.js";
import { HeaderView } from "../../ui/header/index.js";
import { FooterView } from "../../ui/pied-de-page/index.js";
import { CategoryMenuView } from "../../ui/menu-categories/index.js";
import { CartBadgeView } from "../../ui/compteur-panier/index.js";
import { CurrencySelectView } from "../../ui/selecteur-monnaie/index.js";
import template from "./template.html?raw";

/**
 * Layout principal : l'en-tête, son menu des catégories, le lien du compte et
 * le compteur du panier, puis la page.
 *
 * Le routeur reconstruit le layout à chaque navigation, sans l'attendre : le
 * menu, le compte et le compteur sont donc chargés une seule fois, gardés dans
 * le modèle, puis réaffichés directement aux navigations suivantes. Ils sont
 * ensuite tenus à jour par les événements CART_CHANGED_EVENT et
 * ACCOUNT_CHANGED_EVENT, émis par les pages qui les modifient.
 */

// ---------------------------------------------------------------------------
// M — Modèle : catégories du menu, client connecté et nombre d'articles
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "success" | "error"
  categories: [], // arbre renvoyé par GET /api/categories
  isFetching: false, // vrai pendant la requête, pour ne pas la doubler
  cartCount: null, // nombre d'articles du panier, null tant qu'il est inconnu
  isFetchingCart: false,
  user: null, // { prenom, nom, email } du client connecté, ou null
  isAccountKnown: false, // faux tant que GET /api/compte n'a pas répondu
  isFetchingAccount: false,
};

/**
 * Charge le client connecté à la session.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchAccount = async function () {
  M.isFetchingAccount = true;

  try {
    let account = await AccountData.fetch();
    M.user = account.utilisateur;
    M.isAccountKnown = true;
  } catch (error) {
    // L'en-tête affiche alors « Connexion » ; on retentera à la navigation suivante.
    M.user = null;
  }

  M.isFetchingAccount = false;
};

/**
 * Indique s'il faut charger le compte : inconnu, et pas déjà en cours.
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.shouldFetchAccount = function () {
  return !M.isAccountKnown && !M.isFetchingAccount;
};

/**
 * Enregistre le client annoncé par une page (null après une déconnexion).
 * . user : { prenom, nom, email } ou null
 * > aucune valeur de retour
 *
 * @param {Object|null} user
 * @returns {void}
 */
M.setUser = function (user) {
  M.user = user;
  M.isAccountKnown = true;
};

/**
 * Libellé du lien de compte dans l'en-tête.
 * . aucun paramètre
 * > « Bonjour, Marie » si un client est connecté, sinon « Connexion »
 *
 * @returns {string}
 */
M.getAccountLabel = function () {
  return M.user === null ? "Connexion" : `Bonjour, ${M.user.prenom}`;
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
 * Mémorise la monnaie choisie.
 * . code : « XPF », « EUR » ou « USD »
 * > aucune valeur de retour
 *
 * @param {string} code
 * @returns {void}
 */
M.setCurrency = function (code) {
  setCurrency(code);
};

/**
 * Monnaies proposées et monnaie courante ; rien sur les pages d'administration,
 * qui restent en XPF.
 * . aucun paramètre
 * > { currencies, current } ou null
 *
 * @returns {{currencies: Array<Object>, current: string}|null}
 */
M.getCurrencyChoice = function () {
  if (isCurrencyLocked()) {
    return null;
  }
  return { currencies: Object.values(CURRENCIES), current: getCurrency() };
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, categories, cartCount, accountLabel, currency }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    categories: M.categories,
    cartCount: M.cartCount,
    accountLabel: M.getAccountLabel(),
    currency: M.getCurrencyChoice(),
  };
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
 * Charge le client connecté puis met à jour le lien de compte.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadAccount = async function () {
  await M.fetchAccount();
  V.renderAccount(M.getState());
};

/**
 * Une page a connecté ou déconnecté le client : le lien de compte suit.
 * . ev : CustomEvent ACCOUNT_CHANGED_EVENT, detail { utilisateur }
 * > aucune valeur de retour
 *
 * @param {CustomEvent} ev
 * @returns {void}
 */
C.handler_accountChanged = function (ev) {
  M.setUser(ev.detail.utilisateur);
  V.renderAccount(M.getState());
};

/**
 * La personne a choisi une autre monnaie : on la mémorise, puis on prévient la
 * page affichée (main.js la reconstruit) pour que tous les prix suivent.
 * . code : monnaie choisie
 * > aucune valeur de retour
 *
 * @param {string} code
 * @returns {void}
 */
C.handler_changeCurrency = function (code) {
  M.setCurrency(code);
  document.dispatchEvent(new CustomEvent(CURRENCY_CHANGED_EVENT));
};

/**
 * Construit le layout, affiche le menu, le compte et le compteur connus, et
 * les charge si besoin.
 * . aucun paramètre
 * > DocumentFragment du layout
 *
 * @returns {DocumentFragment}
 */
C.init = function () {
  let fragment = V.init();
  V.renderMenu(M.getState());
  V.renderCartCount(M.getState());
  V.renderAccount(M.getState());
  V.renderCurrency(M.getState(), C.handler_changeCurrency);

  if (M.shouldFetch()) {
    C.loadMenu();
  }
  if (M.shouldFetchCart()) {
    C.loadCartCount();
  }
  if (M.shouldFetchAccount()) {
    C.loadAccount();
  }

  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue
// ---------------------------------------------------------------------------

let V = {};

V.menuZone = null; // zone du menu (desktop) dans le dernier layout construit
V.mobileMenuZone = null; // zone du menu mobile
V.cartCountZone = null; // zone du compteur dans le dernier layout construit
V.accountLink = null; // lien de compte dans le dernier layout construit
V.currencyZone = null; // choix de la monnaie (desktop)
V.mobileCurrencyZone = null; // choix de la monnaie (menu mobile)
V.isListening = false; // les écouteurs sur document ne sont posés qu'une fois

/**
 * Crée le layout et l'en-tête, et mémorise les zones du menu, du compte et du
 * compteur. Le slot sans nom est laissé au routeur, qui y place la page.
 *
 * Les écouteurs de CART_CHANGED_EVENT et ACCOUNT_CHANGED_EVENT sont posés sur
 * document, qui survit aux navigations : une seule fois, sinon ils seraient
 * ajoutés à chaque page.
 * . aucun paramètre
 * > DocumentFragment du layout
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let layout = htmlToFragment(template);
  layout.querySelector('slot[name="header"]').replaceWith(HeaderView.dom());
  layout.querySelector('slot[name="footer"]').replaceWith(FooterView.dom());
  V.menuZone = layout.querySelector('[data-zone="menu"]');
  V.mobileMenuZone = layout.querySelector('[data-zone="menu-mobile"]');
  V.cartCountZone = layout.querySelector('[data-zone="compteur-panier"]');
  V.accountLink = layout.querySelector('[data-zone="compte"]');
  V.currencyZone = layout.querySelector('[data-zone="monnaie"]');
  V.mobileCurrencyZone = layout.querySelector('[data-zone="monnaie-mobile"]');

  if (!V.isListening) {
    document.addEventListener(CART_CHANGED_EVENT, C.handler_cartChanged);
    document.addEventListener(ACCOUNT_CHANGED_EVENT, C.handler_accountChanged);
    V.isListening = true;
  }

  return layout;
};

/**
 * Affiche le choix de la monnaie, desktop et menu mobile (rien en administration).
 * . state : { currency } ; onChange : callback de C
 * > aucune valeur de retour
 *
 * @param {{currency: Object|null}} state
 * @param {function(string): void} onChange
 * @returns {void}
 */
V.renderCurrency = function (state, onChange) {
  if (state.currency === null) {
    V.mobileCurrencyZone.remove();
    return;
  }
  V.currencyZone.replaceChildren(CurrencySelectView.dom({ ...state.currency, visibleLabel: false }, onChange));
  V.mobileCurrencyZone.replaceChildren(CurrencySelectView.dom({ ...state.currency, visibleLabel: true }, onChange));
};

/**
 * Affiche le libellé du lien de compte (texte seul : aucune balise injectée).
 * . state : { accountLabel }
 * > aucune valeur de retour
 *
 * @param {{accountLabel: string}} state
 * @returns {void}
 */
V.renderAccount = function (state) {
  V.accountLink.textContent = state.accountLabel;
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
    V.mobileMenuZone.replaceChildren();
    return;
  }

  let categories = state.status === "success" ? state.categories : null;
  V.menuZone.replaceChildren(CategoryMenuView.dom(categories, window.location.pathname));
  V.mobileMenuZone.replaceChildren(CategoryMenuView.dom(categories, window.location.pathname, true));
};

/**
 * Layout appelé par le routeur à chaque navigation.
 *
 * @returns {DocumentFragment}
 */
export function RootLayout() {
  return C.init();
}
