import { CategoryData } from "../../data/categorie.js";
import { ProductData } from "../../data/produit.js";
import { productImageUrl } from "../../lib/image.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { ProductCardView } from "../../ui/carte-produit/index.js";
import photoBoutique from "../../assets/design/photo-boutique.jpg";
import photoHero from "../../assets/design/photo-hero.jpg";
import photoCollier from "../../assets/design/categorie-1.jpg";
import photoBoucles from "../../assets/design/categorie-2.jpg";
import photoHomme from "../../assets/design/categorie-4.jpg";
import iconeHorloge from "../../assets/design/icone-horloge.svg";
import iconePin from "../../assets/design/icone-pin.svg";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateError from "./erreur.html?raw";
import templateTiles from "./tuiles.html?raw";
import templateTile from "./tuile.html?raw";
import templateLatest from "./nouveautes.html?raw";

/**
 * Page « Accueil » : /.
 *
 * Le héro, les trois étapes du click & collect et la présentation de la boutique
 * sont fixes et s'affichent aussitôt. Les collections (une par catégorie
 * principale, avec son nombre de bijoux) et les nouveautés (les quatre bijoux
 * ajoutés le plus récemment) viennent de l'API. Le catalogue complet est sur
 * /bijoux.
 */

// Nombre de bijoux dans « Nouveautés ».
const LATEST_COUNT = 4;

// Photos de la maquette pour les collections qui en ont une ; les autres
// reprennent la photo de leur premier bijou.
const COLLECTION_PHOTOS = {
  colliers: photoCollier,
  "boucles-oreilles": photoBoucles,
  homme: photoHomme,
};

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage : une réponse d'un affichage précédent est ignorée
  status: "loading", // "loading" | "success" | "error"
  categories: [], // arbre renvoyé par GET /api/categories
  products: [], // bijoux renvoyés par GET /api/produits
  loadError: null, // texte si l'accueil n'a pas pu être chargé
};

/**
 * Remet l'état à zéro avant un nouvel affichage de la page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.reset = function () {
  M.visit += 1;
  M.status = "loading";
  M.categories = [];
  M.products = [];
  M.loadError = null;
};

/**
 * Charge en parallèle les catégories et les bijoux. Si la page a été quittée
 * pendant l'attente, la réponse est ignorée.
 * . aucun paramètre
 * > Promise<boolean> : vrai si la réponse concerne toujours la page affichée
 *
 * @returns {Promise<boolean>}
 */
M.fetchHome = async function () {
  let visit = M.visit;

  try {
    let results = await Promise.all([CategoryData.fetchMenu(), ProductData.fetchAll()]);
    if (visit !== M.visit) {
      return false;
    }
    M.categories = results[0].categories;
    M.products = results[1].produits;
    M.status = "success";
  } catch (error) {
    if (visit !== M.visit) {
      return false;
    }
    M.status = "error";
    M.loadError = `Impossible de charger les bijoux : ${error.message}`;
  }
  return true;
};

/**
 * Les bijoux d'une catégorie principale.
 * . slug : slug de la catégorie
 * > tableau de bijoux
 *
 * @param {string} slug
 * @returns {Array<Object>}
 */
M.getProductsOf = function (slug) {
  return M.products.filter(function (product) {
    return product.categorie.slug === slug;
  });
};

/**
 * Les collections à afficher : une par catégorie principale, avec son nombre de
 * bijoux et sa photo (celle de la maquette, ou celle du premier bijou).
 * . aucun paramètre
 * > [{ nom, path, effectif, src }]
 *
 * @returns {Array<Object>}
 */
M.getCollections = function () {
  return M.categories.map(function (category) {
    let products = M.getProductsOf(category.slug);
    let first = products.find(function (product) {
      return product.image !== null;
    });
    let src = COLLECTION_PHOTOS[category.slug];

    if (src === undefined) {
      src = first === undefined ? photoCollier : productImageUrl(first.image.fichier, true);
    }

    return {
      nom: category.nom,
      path: `/categorie/${encodeURIComponent(category.slug)}`,
      effectif: `${products.length} bijou${products.length > 1 ? "x" : ""}`,
      src: src,
    };
  });
};

/**
 * Les bijoux ajoutés le plus récemment, les plus récents d'abord.
 * . aucun paramètre
 * > tableau de bijoux (LATEST_COUNT au plus)
 *
 * @returns {Array<Object>}
 */
M.getLatestProducts = function () {
  return M.products
    .slice()
    .sort(function (a, b) {
      return b.dateAjout.localeCompare(a.dateAjout) || b.id - a.id;
    })
    .slice(0, LATEST_COUNT);
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, loadError, collections, latest }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    loadError: M.loadError,
    collections: M.status === "success" ? M.getCollections() : [],
    latest: M.status === "success" ? M.getLatestProducts() : [],
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge les collections et les nouveautés, puis les affiche.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadHome = async function () {
  if (await M.fetchHome()) {
    V.renderDynamicZones(M.getState());
  }
};

/**
 * Point d'entrée : page rendue au routeur avec ses zones en chargement, puis
 * chargement lancé sans l'attendre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
C.init = function () {
  M.reset();
  let fragment = V.init();
  V.renderDynamicZones(M.getState());
  C.loadHome();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // conteneur de la page affichée

/**
 * Crée la page (la partie fixe) et mémorise ses zones dynamiques.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(
    genericRenderer(template, {
      photoHero: photoHero,
      photoBoutique: photoBoutique,
      iconePin: iconePin,
      iconeHorloge: iconeHorloge,
      urlBijoux: routeUrl("/bijoux"),
    })
  );
  V.root = fragment;
  V.collectionsZone = fragment.querySelector('[data-zone="collections"]');
  V.latestZone = fragment.querySelector('[data-zone="nouveautes"]');
  return fragment;
};

/**
 * Les tuiles des collections.
 * . collections : tableau renvoyé par M.getCollections()
 * > DocumentFragment
 *
 * @param {Array<Object>} collections
 * @returns {DocumentFragment}
 */
V.createCollectionsFragment = function (collections) {
  let fragment = htmlToFragment(templateTiles);
  let tiles = collections.map(function (collection) {
    return htmlToFragment(
      genericRenderer(templateTile, {
        href: routeUrl(collection.path),
        src: collection.src,
        nom: collection.nom,
        effectif: collection.effectif,
      })
    );
  });

  fragment.querySelector('slot[name="tuiles"]').replaceWith(...tiles);
  return fragment;
};

/**
 * Les cartes des nouveautés.
 * . products : bijoux renvoyés par M.getLatestProducts()
 * > DocumentFragment
 *
 * @param {Array<Object>} products
 * @returns {DocumentFragment}
 */
V.createLatestFragment = function (products) {
  let fragment = htmlToFragment(templateLatest);
  let cards = products.map(function (product) {
    let item = document.createElement("li");
    item.append(ProductCardView.dom(product));
    return item;
  });

  fragment.querySelector('slot[name="cartes"]').replaceWith(...cards);
  return fragment;
};

/**
 * Remplit les collections et les nouveautés selon l'état : chargement, erreur
 * ou contenu.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderDynamicZones = function (state) {
  let zones = [V.collectionsZone, V.latestZone];

  for (let i = 0; i < zones.length; i++) {
    zones[i].setAttribute("aria-busy", String(state.status === "loading"));
  }

  if (state.status === "loading") {
    V.collectionsZone.replaceChildren(htmlToFragment(templateLoading));
    V.latestZone.replaceChildren(htmlToFragment(templateLoading));
  } else if (state.status === "error") {
    V.collectionsZone.replaceChildren(htmlToFragment(genericRenderer(templateError, { texte: state.loadError })));
    V.latestZone.replaceChildren();
  } else {
    V.collectionsZone.replaceChildren(V.createCollectionsFragment(state.collections));
    V.latestZone.replaceChildren(V.createLatestFragment(state.latest));
  }
};

/**
 * Page appelée par le routeur sur la route « / ».
 *
 * @returns {DocumentFragment}
 */
export function HomePage() {
  return C.init();
}
