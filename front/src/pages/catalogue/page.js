import { ProductData } from "../../data/produit.js";
import { htmlToFragment } from "../../lib/utils.js";
import { MessageView } from "../../ui/message/index.js";
import { ProductGridView } from "../../ui/grille-produits/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";

/**
 * Page « Catalogue » (US DEC-b) : tous les bijoux de Matira Création.
 *
 * La page s'affiche tout de suite avec un état de chargement, puis se met à
 * jour lorsque l'API a répondu (succès, catalogue vide ou erreur).
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "success" | "error"
  products: [], // bijoux renvoyés par GET /api/produits
  message: null, // { type, texte }, ou null
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
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, products, message }
 *
 * @returns {{status: string, products: Array<Object>, message: Object|null}}
 */
M.getState = function () {
  return { status: M.status, products: M.products, message: M.message };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le catalogue puis rafraîchit l'affichage.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadCatalogue = async function () {
  await M.fetchProducts();
  V.renderPage(M.getState());
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
  V.renderPage(M.getState());
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
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  return fragment;
};

/**
 * Construit le contenu correspondant à l'état reçu.
 * . state : { status, products, message }
 * > DocumentFragment (chargement, erreur, grille ou état vide)
 *
 * @param {{status: string, products: Array<Object>, message: Object|null}} state
 * @returns {DocumentFragment}
 */
V.createContentFragment = function (state) {
  if (state.status === "loading") {
    return htmlToFragment(templateLoading);
  }

  if (state.status === "error") {
    return MessageView.dom(state.message);
  }

  return ProductGridView.dom(state.products);
};

/**
 * Remplace le contenu de la page par celui qui correspond à l'état reçu.
 * . state : { status, products, message }
 * > aucune valeur de retour
 *
 * @param {{status: string, products: Array<Object>, message: Object|null}} state
 * @returns {void}
 */
V.renderPage = function (state) {
  let zone = V.root.querySelector('[data-zone="contenu"]');
  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(V.createContentFragment(state));
};

/**
 * Page appelée par le routeur sur la route « / ».
 *
 * @returns {DocumentFragment}
 */
export function CataloguePage() {
  return C.init();
}
