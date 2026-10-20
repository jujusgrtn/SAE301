import { ProductData } from "../../data/produit.js";
import { CartData, CART_CHANGED_EVENT } from "../../data/panier.js";
import { formatPrice } from "../../lib/format.js";
import { StockBadgeView } from "../../ui/badge-stock/index.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateError from "./erreur.html?raw";
import templateSheet from "./fiche.html?raw";
import templatePhoto from "./photo.html?raw";
import templateNoPhoto from "./sans-photo.html?raw";
import templateThumbnails from "./miniatures.html?raw";
import templateThumbnail from "./miniature.html?raw";
import templateOption from "./option.html?raw";
import templateOptionItem from "./option-item.html?raw";
import templateAddButton from "./bouton-ajout.html?raw";
import templateAddSuccess from "./ajout-succes.html?raw";
import templateAddError from "./ajout-erreur.html?raw";

// Les photos sont servies par Vite depuis front/public/, en 800 et 400 px.
const IMAGES_URL = import.meta.env.BASE_URL + "images/produits/";

/**
 * Page « Fiche produit » (US DEC-c) : /produit/:slug.
 *
 * La page s'affiche aussitôt en état de chargement, puis se met à jour lorsque
 * l'API a répondu. Lorsqu'un bijou a plusieurs photos, des miniatures
 * permettent de changer la photo affichée.
 *
 * Le bouton « Ajouter au panier » (US CMD-b) réserve un exemplaire de la
 * variante choisie ; une liste d'options n'apparaît que si le bijou en a
 * plusieurs.
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
  selectedVariantId: null, // variante proposée à l'ajout au panier
  cartStatus: "idle", // "idle" | "adding" | "added" | "error"
  cartError: null, // message de l'API si l'ajout a échoué
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
  M.selectedVariantId = null;
  M.cartStatus = "idle";
  M.cartError = null;
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
  M.selectedVariantId = M.product.variantes.length > 0 ? M.product.variantes[0].id : null;
  M.status = "success";
  return true;
};

/**
 * Choisit la variante à ajouter au panier. Une variante qui n'appartient pas
 * au bijou est refusée.
 * . variantId : identifiant de la variante choisie
 * > booléen : vrai si le choix a été retenu
 *
 * @param {number} variantId
 * @returns {boolean}
 */
M.selectVariant = function (variantId) {
  if (M.product === null) {
    return false;
  }

  let exists = M.product.variantes.some(function (variant) {
    return variant.id === variantId;
  });

  if (exists) {
    M.selectedVariantId = variantId;
    M.cartStatus = "idle";
  }
  return exists;
};

/**
 * Indique si un ajout au panier peut partir : une variante est choisie et
 * aucun ajout n'est déjà en cours (un double clic n'ajoute qu'une fois).
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.canAddToCart = function () {
  return M.selectedVariantId !== null && M.cartStatus !== "adding";
};

/**
 * Passe l'ajout au panier en cours.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.startAddToCart = function () {
  M.cartStatus = "adding";
  M.cartError = null;
};

/**
 * Ajoute un exemplaire de la variante choisie au panier de la session.
 *
 * Le serveur vérifie la variante et la quantité, et renvoie le panier : le
 * nombre d'articles sert à mettre à jour le compteur de l'en-tête.
 * . aucun paramètre
 * > Promise<{ isCurrent, cartCount }> : isCurrent est faux si l'utilisateur
 *   a quitté la fiche entre-temps ; cartCount vaut null en cas d'échec
 *
 * @returns {Promise<{isCurrent: boolean, cartCount: number|null}>}
 */
M.addToCart = async function () {
  let slug = M.slug;
  let cartCount = null;
  let errorMessage = null;

  try {
    let cart = await CartData.add(M.selectedVariantId, 1);
    cartCount = cart.nombreArticles;
  } catch (error) {
    errorMessage = `Impossible d'ajouter ce bijou au panier : ${error.message}`;
  }

  if (slug !== M.slug) {
    return { isCurrent: false, cartCount: cartCount };
  }

  M.cartStatus = errorMessage === null ? "added" : "error";
  M.cartError = errorMessage;
  return { isCurrent: true, cartCount: cartCount };
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
 * La variante choisie, avec son stock et sa disponibilité.
 * . aucun paramètre
 * > { id, libelle, stock, disponibilite }, ou null
 *
 * @returns {Object|null}
 */
M.getSelectedVariant = function () {
  if (M.product === null) {
    return null;
  }

  let variant = M.product.variantes.find(function (candidate) {
    return candidate.id === M.selectedVariantId;
  });
  return variant === undefined ? null : variant;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, product, images, imageIndex, image, message, variants,
 *     selectedVariantId, selectedVariant, cartStatus, cartError, canAddToCart }
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
    variants: M.product === null ? [] : M.product.variantes,
    selectedVariantId: M.selectedVariantId,
    selectedVariant: M.getSelectedVariant(),
    cartStatus: M.cartStatus,
    cartError: M.cartError,
    canAddToCart: M.canAddToCart(),
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
 * Clic dans la page : seul un clic sur « Ajouter au panier » est traité.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnAddToCart = async function (ev) {
  if (ev.target.closest('[data-action="ajouter"]') === null || !M.canAddToCart()) {
    return;
  }

  M.startAddToCart();
  V.renderAddToCart(M.getState());

  let result = await M.addToCart();

  if (result.isCurrent) {
    V.renderAddToCart(M.getState());
  }
  if (result.cartCount !== null) {
    V.notifyCartChanged(result.cartCount);
  }
};

/**
 * Changement de l'option choisie dans la liste des variantes.
 * . ev : événement change, délégué depuis la racine de la page
 * > aucune valeur de retour
 *
 * @param {Event} ev
 * @returns {void}
 */
C.handler_changeVariant = function (ev) {
  if (ev.target.closest('[data-zone="variante"]') === null) {
    return;
  }

  if (M.selectVariant(Number(ev.target.value))) {
    V.renderStock(M.getState());
    V.renderAddToCart(M.getState());
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
 * Crée la structure de la page, mémorise sa racine et y délègue les
 * événements : les miniatures et le bouton, recréés à chaque rendu, n'ont pas
 * besoin d'écouteur propre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  V.root.addEventListener("click", C.handler_clickOnThumbnail);
  V.root.addEventListener("click", C.handler_clickOnAddToCart);
  V.root.addEventListener("change", C.handler_changeVariant);
  return fragment;
};

/**
 * Liste des options et bouton d'ajout. La liste n'apparaît que si le bijou a
 * plusieurs variantes : pour un « Modèle unique », le bouton suffit.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createAddToCartFragment = function (state) {
  let fragment = new DocumentFragment();

  if (state.variants.length > 1) {
    let option = htmlToFragment(templateOption);
    let items = state.variants.map(function (variant) {
      return htmlToFragment(genericRenderer(templateOptionItem, { id: variant.id, libelle: variant.libelle }));
    });
    let select = option.querySelector('[data-zone="variante"]');
    select.replaceChildren(...items);
    select.value = String(state.selectedVariantId);
    fragment.append(option);
  }

  fragment.append(htmlToFragment(templateAddButton));
  return fragment;
};

/**
 * Met à jour le bouton et le message de retour selon l'état de l'ajout.
 *
 * Le bouton n'est pas reconstruit, et il est marqué aria-disabled plutôt que
 * disabled : il garde ainsi le focus clavier pendant l'envoi.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderAddToCart = function (state) {
  let button = V.root.querySelector('[data-action="ajouter"]');
  let feedback = V.root.querySelector('[data-zone="retour-panier"]');

  button.textContent = state.cartStatus === "adding" ? "Ajout en cours…" : "Ajouter au panier";
  if (state.canAddToCart) {
    button.removeAttribute("aria-disabled");
  } else {
    button.setAttribute("aria-disabled", "true");
  }

  if (state.cartStatus === "added") {
    feedback.replaceChildren(htmlToFragment(genericRenderer(templateAddSuccess, { urlPanier: routeUrl("/panier") })));
  } else if (state.cartStatus === "error") {
    feedback.replaceChildren(htmlToFragment(genericRenderer(templateAddError, { texte: state.cartError })));
  } else if (state.cartStatus === "idle" && state.selectedVariantId === null) {
    feedback.replaceChildren(
      htmlToFragment(genericRenderer(templateAddError, { texte: "Ce bijou n'est pas disponible à la réservation." }))
    );
  } else {
    feedback.replaceChildren();
  }
};

/**
 * Annonce au reste de l'application (le compteur de l'en-tête) le nouveau
 * nombre d'articles du panier.
 * . count : nombre d'articles renvoyé par le serveur
 * > aucune valeur de retour
 *
 * @param {number} count
 * @returns {void}
 */
V.notifyCartChanged = function (count) {
  document.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT, { detail: { nombreArticles: count } }));
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
  fragment.querySelector('[data-zone="ajout-panier"]').replaceChildren(V.createAddToCartFragment(state));

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

  if (state.status === "success") {
    V.renderStock(state);
    V.renderAddToCart(state);
  }
};

/**
 * Affiche la disponibilité de la variante choisie (rien s'il n'y en a pas).
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderStock = function (state) {
  let zone = V.root.querySelector('[data-zone="stock"]');

  if (state.selectedVariant === null) {
    zone.replaceChildren();
    return;
  }
  zone.replaceChildren(StockBadgeView.dom(state.selectedVariant));
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
