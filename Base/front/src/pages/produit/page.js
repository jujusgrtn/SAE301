import { ProductData } from "../../data/produit.js";
import { formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateError from "./erreur.html?raw";
import templateSheet from "./fiche.html?raw";
import templatePhoto from "./photo.html?raw";
import templateNoPhoto from "./sans-photo.html?raw";
import templateThumbnails from "./miniatures.html?raw";
import templateThumbnail from "./miniature.html?raw";

// Les photos sont servies par Vite depuis front/public/, en 800 et 400 px.
const IMAGES_URL = import.meta.env.BASE_URL + "images/produits/";

/**
 * Page « Fiche produit » (US DEC-c) : /produit/:slug.
 *
 * La page s'affiche aussitôt en état de chargement, puis se met à jour lorsque
 * l'API a répondu. Lorsqu'un bijou a plusieurs photos, des miniatures
 * permettent de changer la photo affichée.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  slug: null, // bijou demandé par la dernière navigation
  status: "loading", // "loading" | "success" | "error"
  product: null, // { nom, slug, prix, description, categorie, sousCategorie, images }
  imageIndex: 0, // position de la photo affichée dans product.images
  message: null, // { titre, texte } en cas d'erreur
};

/**
 * Remet l'état à zéro pour un nouveau bijou.
 * . slug : slug lu dans l'URL
 * > aucune valeur de retour
 *
 * @param {string} slug
 * @returns {void}
 */
M.reset = function (slug) {
  M.slug = slug;
  M.status = "loading";
  M.product = null;
  M.imageIndex = 0;
  M.message = null;
};

/**
 * Charge la fiche d'un bijou et la range dans l'état.
 *
 * Si l'utilisateur a changé de page pendant le chargement, la réponse arrivée
 * en retard est ignorée.
 * . slug : slug du bijou
 * > Promise<boolean> : vrai si la réponse concerne toujours le bijou affiché
 *
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
M.fetchProduct = async function (slug) {
  let response = null;
  let message = null;

  try {
    response = await ProductData.fetchBySlug(slug);
  } catch (error) {
    if (error.statut === 404) {
      message = { titre: "Bijou introuvable", texte: "Ce bijou n'existe pas ou n'est plus proposé." };
    } else {
      message = { titre: "Bijou indisponible", texte: `Impossible de charger ce bijou : ${error.message}` };
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

  M.product = response.produit;
  M.imageIndex = 0;
  M.status = "success";
  return true;
};

/**
 * Choisit la photo affichée. Une position hors de la galerie est refusée.
 * . index : position demandée
 * > booléen : vrai si la photo affichée a changé
 *
 * @param {number} index
 * @returns {boolean}
 */
M.selectImage = function (index) {
  if (M.product === null || !Number.isInteger(index)) {
    return false;
  }
  if (index < 0 || index >= M.product.images.length || index === M.imageIndex) {
    return false;
  }

  M.imageIndex = index;
  return true;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, product, images, imageIndex, image, message }
 *
 * @returns {Object}
 */
M.getState = function () {
  let images = M.product === null ? [] : M.product.images;

  return {
    status: M.status,
    product: M.product,
    images: images,
    imageIndex: M.imageIndex,
    image: images.length > 0 ? images[M.imageIndex] : null,
    message: M.message,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le bijou puis rafraîchit l'affichage, sauf si une autre page a été
 * demandée entre-temps.
 * . slug : slug du bijou
 * > Promise<void>
 *
 * @param {string} slug
 * @returns {Promise<void>}
 */
C.loadProduct = async function (slug) {
  let isCurrent = await M.fetchProduct(slug);

  if (isCurrent) {
    V.renderPage(M.getState());
  }
};

/**
 * Clic dans la page : seul un clic sur une miniature change la photo.
 * . ev : événement click, délégué depuis la racine de la page
 * > aucune valeur de retour
 *
 * @param {MouseEvent} ev
 * @returns {void}
 */
C.handler_clickOnThumbnail = function (ev) {
  let button = ev.target.closest("[data-index]");

  if (button === null) {
    return;
  }

  if (M.selectImage(Number(button.dataset.index))) {
    V.renderGallery(M.getState());
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
  C.loadProduct(slug);
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, mémorise sa racine et y délègue les clics :
 * les miniatures, recréées à chaque rendu, n'ont pas besoin d'écouteur propre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  V.root.addEventListener("click", C.handler_clickOnThumbnail);
  return fragment;
};

/**
 * Remplit le template de la photo affichée, ou celui d'un bijou sans photo.
 * . image : { fichier, alt } ou null
 * > chaîne HTML
 *
 * @param {{fichier: string, alt: string}|null} image
 * @returns {string}
 */
V.formatOnePhoto = function (image) {
  if (image === null) {
    return templateNoPhoto;
  }

  let file = encodeURIComponent(image.fichier);

  return genericRenderer(templatePhoto, {
    src: `${IMAGES_URL}${file}.webp`,
    srcPetite: `${IMAGES_URL}${file}-400.webp`,
    alt: image.alt,
  });
};

/**
 * Remplit le template d'une miniature.
 * . image : { fichier, alt }, index : sa position, total : nombre de photos,
 *   isSelected : vrai si c'est la photo affichée
 * > chaîne HTML
 *
 * @param {{fichier: string, alt: string}} image
 * @param {number} index
 * @param {number} total
 * @param {boolean} isSelected
 * @returns {string}
 */
V.formatOneThumbnail = function (image, index, total, isSelected) {
  return genericRenderer(templateThumbnail, {
    index: index,
    numero: index + 1,
    total: total,
    selectionnee: String(isSelected),
    src: `${IMAGES_URL}${encodeURIComponent(image.fichier)}-400.webp`,
  });
};

/**
 * Miniatures de la galerie ; aucune s'il n'y a qu'une photo.
 * . images : photos du bijou, imageIndex : position de la photo affichée
 * > DocumentFragment
 *
 * @param {Array<{fichier: string, alt: string}>} images
 * @param {number} imageIndex
 * @returns {DocumentFragment}
 */
V.createThumbnailsFragment = function (images, imageIndex) {
  if (images.length <= 1) {
    return new DocumentFragment();
  }

  let fragment = htmlToFragment(templateThumbnails);
  let items = images.map(function (image, index) {
    return htmlToFragment(V.formatOneThumbnail(image, index, images.length, index === imageIndex));
  });
  fragment.querySelector('slot[name="items"]').replaceWith(...items);
  return fragment;
};

/**
 * Fiche complète : fil d'Ariane, galerie et informations du bijou.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createProductFragment = function (state) {
  let product = state.product;

  let fragment = htmlToFragment(
    genericRenderer(templateSheet, {
      urlCatalogue: routeUrl("/"),
      urlCategorie: routeUrl(`/categorie/${encodeURIComponent(product.categorie.slug)}`),
      urlSousCategorie: routeUrl(`/categorie/${encodeURIComponent(product.sousCategorie.slug)}`),
      categorie: product.categorie.nom,
      sousCategorie: product.sousCategorie.nom,
      nom: product.nom,
      prix: formatPrice(product.prix),
      description: product.description,
    })
  );

  fragment.querySelector('[data-zone="photo"]').replaceChildren(htmlToFragment(V.formatOnePhoto(state.image)));
  fragment
    .querySelector('[data-zone="miniatures"]')
    .replaceChildren(V.createThumbnailsFragment(state.images, state.imageIndex));

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
    content = V.createProductFragment(state);
  }

  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(content);
};

/**
 * Réaffiche seulement la galerie après un changement de photo.
 *
 * Reconstruire toute la fiche ferait perdre le focus clavier : on le rend à
 * la miniature choisie s'il se trouvait dans la galerie.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderGallery = function (state) {
  let thumbnailsZone = V.root.querySelector('[data-zone="miniatures"]');
  let hadFocus = thumbnailsZone.contains(document.activeElement);

  V.root.querySelector('[data-zone="photo"]').replaceChildren(htmlToFragment(V.formatOnePhoto(state.image)));
  thumbnailsZone.replaceChildren(V.createThumbnailsFragment(state.images, state.imageIndex));

  if (hadFocus) {
    thumbnailsZone.querySelector('[aria-pressed="true"]').focus();
  }
};

/**
 * Page appelée par le routeur sur la route « /produit/:slug ».
 *
 * @param {{slug: string}} params - Paramètres de l'URL.
 * @returns {DocumentFragment}
 */
export function ProductPage(params) {
  return C.init(params.slug);
}
