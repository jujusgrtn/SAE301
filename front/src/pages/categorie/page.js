import { ProductData } from "../../data/produit.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { ProductGridView } from "../../ui/grille-produits/index.js";
import { SubCategoriesView } from "../../ui/sous-categories/index.js";
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
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, title, category, parent, mainCategory, subCategories, products, message }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    title: M.getTitle(),
    category: M.category,
    parent: M.parent,
    // La catégorie principale porte les filtres : le parent d'une
    // sous-catégorie, ou la catégorie elle-même.
    mainCategory: M.parent ?? M.category,
    subCategories: M.subCategories,
    products: M.products,
    message: M.message,
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
    V.renderPage(M.getState());
  }
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
  V.renderPage(M.getState());
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
      urlCatalogue: routeUrl("/"),
    })
  );
};

/**
 * En-tête de la catégorie (fil d'Ariane, titre, description), filtres et grille.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createCategoryFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateHeader, {
      urlCatalogue: routeUrl("/"),
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

  let filtersSlot = fragment.querySelector('slot[name="sous-categories"]');
  if (state.subCategories.length === 0) {
    filtersSlot.remove();
  } else {
    filtersSlot.replaceWith(
      SubCategoriesView.dom({
        mainCategory: state.mainCategory,
        subCategories: state.subCategories,
        currentSlug: state.category.slug,
      })
    );
  }

  fragment.querySelector('slot[name="grille"]').replaceWith(ProductGridView.dom(state.products));

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
  } else if (state.status === "error") {
    content = V.createErrorFragment(state.message);
  } else {
    content = V.createCategoryFragment(state);
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
