import { AdminProductData } from "../../data/admin-produit.js";
import { formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateEmpty from "./vide.html?raw";
import templateList from "./liste.html?raw";
import templateRow from "./ligne.html?raw";
import templateImage from "./image.html?raw";
import templateNoImage from "./sans-image.html?raw";

/**
 * Page « Produits » du back-office (US GOF-a) : /admin/produits.
 *
 * Liste tous les bijoux avec leur photo, leur catégorie, leur prix et leur
 * stock exact. L'accès est décidé par le serveur : un 401 affiche une invite
 * à se connecter au back-office.
 */

// Les photos sont servies depuis front/public/images/produits/ ; la liste
// utilise la version 400 px.
const IMAGES_URL = import.meta.env.BASE_URL + "images/produits/";

// Classes écrites en entier pour que Tailwind les détecte.
const STOCK_COLORS = {
  en_stock: "text-success",
  stock_faible: "text-danger",
  epuise: "text-muted",
};

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  products: [], // bijoux renvoyés par l'API
  loadError: null, // texte si la liste n'a pas pu être chargée
};

/**
 * Remet l'état à zéro avant un nouvel affichage de la page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.reset = function () {
  M.status = "loading";
  M.products = [];
  M.loadError = null;
};

/**
 * Charge tous les bijoux. Un 401 n'est pas une panne : il signifie que
 * l'administrateur n'est pas connecté.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchProducts = async function () {
  try {
    let data = await AdminProductData.fetchAll();
    M.products = data.produits;
    M.status = "ready";
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger les produits : ${error.message}`;
    }
  }
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, products, loadError }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    products: M.products,
    loadError: M.loadError,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge les bijoux puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadProducts = async function () {
  await M.fetchProducts();
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
  M.reset();
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadProducts();
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
 * Texte du nombre de bijoux.
 * . count : nombre de bijoux
 * > « 1 bijou » ou « 20 bijoux »
 *
 * @param {number} count
 * @returns {string}
 */
V.formatOneTotal = function (count) {
  return count > 1 ? `${count} bijoux` : `${count} bijou`;
};

/**
 * Texte du stock exact, pour l'équipe.
 * . stock : exemplaires en stock
 * > « Épuisé » ou « 6 en stock »
 *
 * @param {number} stock
 * @returns {string}
 */
V.formatOneStock = function (stock) {
  return stock > 0 ? `${stock} en stock` : "Épuisé";
};

/**
 * Miniature d'un bijou, ou mention « Sans photo ».
 * . image : { fichier, alt } ou null
 * > chaîne HTML
 *
 * @param {{fichier: string, alt: string}|null} image
 * @returns {string}
 */
V.formatOneImage = function (image) {
  if (image === null) {
    return templateNoImage;
  }
  return genericRenderer(templateImage, {
    src: `${IMAGES_URL}${encodeURIComponent(image.fichier)}-400.webp`,
    alt: image.alt,
  });
};

/**
 * Ligne d'un bijou dans la liste.
 * . product : bijou renvoyé par GET /api/admin/produits
 * > DocumentFragment
 *
 * @param {Object} product
 * @returns {DocumentFragment}
 */
V.formatOneRow = function (product) {
  let fragment = htmlToFragment(
    genericRenderer(templateRow, {
      categorie: product.categorie.nom,
      sousCategorie: product.sousCategorie.nom,
      nom: product.nom,
      href: routeUrl(`/produit/${encodeURIComponent(product.slug)}`),
      prix: formatPrice(product.prix),
      stock: V.formatOneStock(product.stock),
      couleurStock: STOCK_COLORS[product.disponibilite] ?? STOCK_COLORS.en_stock,
    })
  );
  fragment.querySelector('slot[name="image"]').replaceWith(htmlToFragment(V.formatOneImage(product.image)));
  return fragment;
};

/**
 * Liste complète des bijoux reçus.
 * . products : bijoux renvoyés par l'API
 * > DocumentFragment
 *
 * @param {Array<Object>} products
 * @returns {DocumentFragment}
 */
V.createListFragment = function (products) {
  let fragment = htmlToFragment(genericRenderer(templateList, { total: V.formatOneTotal(products.length) }));
  let list = fragment.querySelector('[data-zone="lignes"]');

  for (let i = 0; i < products.length; i++) {
    list.append(V.formatOneRow(products[i]));
  }
  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, erreur, liste
 * vide ou liste des bijoux.
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
  if (state.products.length === 0) {
    return htmlToFragment(templateEmpty);
  }
  return V.createListFragment(state.products);
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
 * Page appelée par le routeur sur la route « /admin/produits ».
 *
 * @returns {DocumentFragment}
 */
export function AdminProductsPage() {
  return C.init();
}
