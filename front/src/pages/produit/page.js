import { ProductData } from "../../data/produit.js";
import { CartData, CART_CHANGED_EVENT } from "../../data/panier.js";
import { productImageUrl } from "../../lib/image.js";
import { formatPrice } from "../../lib/format.js";
import { findVariant, formatValueLabel, getInitialPrice, getPrice, getSelection, getValueStatuses } from "../../lib/options.js";
import { PriceView } from "../../ui/prix/index.js";
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
import templateOptions from "./options.html?raw";
import templateOption from "./option.html?raw";
import templateValue from "./valeur.html?raw";
import templateAddButton from "./bouton-ajout.html?raw";
import templateAddSuccess from "./ajout-succes.html?raw";
import templateAddError from "./ajout-erreur.html?raw";

/**
 * Page « Fiche produit » (US DEC-c) : /produit/:slug.
 *
 * La page s'affiche aussitôt en état de chargement, puis se met à jour lorsque
 * l'API a répondu. Lorsqu'un bijou a plusieurs photos, des miniatures
 * permettent de changer la photo affichée.
 *
 * Le bouton « Ajouter au panier » (US CMD-b) réserve un exemplaire de la
 * variante choisie. Un bijou à options (US OPT-c : taille, coloris…) propose
 * un groupe de choix par option : la variante qui correspond à la combinaison
 * choisie est retrouvée, et le prix, la disponibilité et le bouton suivent
 * chaque choix. Une valeur dont la combinaison (avec les autres choix en cours)
 * est épuisée ou n'existe pas est signalée dans son libellé (US OPT-b). Le prix affiché est une aide : c'est le serveur qui calcule
 * le prix de la variante ajoutée au panier.
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
  selectedValues: {}, // valeur choisie pour chaque option : { optionId: valeurId }
  selectedVariantId: null, // variante qui correspond à la combinaison choisie, null si elle n'existe pas
  cartStatus: "idle", // "idle" | "adding" | "added" | "error"
  cartError: null, // message de l'API si l'ajout a échoué
  cartQuantities: {}, // exemplaires déjà au panier : { variantId: quantité }
};

// Message affiché quand tous les exemplaires en stock sont déjà dans le panier.
const SOLD_OUT_MESSAGE = "Épuisé : tous les exemplaires disponibles sont déjà dans votre panier.";

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
  M.selectedValues = {};
  M.selectedVariantId = null;
  M.cartStatus = "idle";
  M.cartError = null;
  M.cartQuantities = {};
};

/**
 * Range les quantités du panier reçu : elles servent à savoir si le stock est
 * déjà entièrement réservé par la personne.
 * . cart : panier renvoyé par l'API, { lignes: [{ variantId, quantite }] }
 * > aucune valeur de retour
 *
 * @param {{lignes: Array<{variantId: number, quantite: number}>}} cart
 * @returns {void}
 */
M.setCartQuantities = function (cart) {
  let quantities = {};

  for (let i = 0; i < cart.lignes.length; i++) {
    quantities[cart.lignes[i].variantId] = cart.lignes[i].quantite;
  }
  M.cartQuantities = quantities;
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

  try {
    M.setCartQuantities(await CartData.fetch());
  } catch (error) {
    // Sans le panier, la fiche reste utilisable : le serveur refusera un ajout au-delà du stock.
    M.cartQuantities = {};
  }

  if (slug !== M.slug) {
    return false;
  }

  M.product = response.produit;
  M.imageIndex = 0;
  M.selectedValues = M.getDefaultValues();
  M.selectedVariantId = M.findVariantId(M.selectedValues);
  M.status = "success";
  return true;
};

/**
 * Combinaison proposée au départ : celle de la première variante en stock,
 * ou de la première variante si toutes sont épuisées.
 * . aucun paramètre
 * > { optionId: valeurId } (vide pour un bijou sans option)
 *
 * @returns {Object}
 */
M.getDefaultValues = function () {
  let variants = M.product.variantes;
  let variant = variants.find(function (candidate) {
    return candidate.stock > 0;
  });

  return getSelection(M.product, variant === undefined ? variants[0] : variant);
};

/**
 * Retrouve la variante qui correspond à une combinaison de valeurs : celle
 * dont les valeurs sont exactement les valeurs choisies.
 * . selected : { optionId: valeurId }
 * > identifiant de la variante, ou null si cette combinaison n'est pas proposée
 *
 * @param {Object} selected
 * @returns {number|null}
 */
M.findVariantId = function (selected) {
  let variant = findVariant(M.product, selected);
  return variant === null ? null : variant.id;
};

/**
 * Choisit la valeur d'une option. Une option ou une valeur qui n'appartient
 * pas au bijou est refusée.
 * . optionId : option modifiée, valueId : valeur choisie
 * > booléen : vrai si le choix a été retenu
 *
 * @param {number} optionId
 * @param {number} valueId
 * @returns {boolean}
 */
M.selectOption = function (optionId, valueId) {
  if (M.product === null) {
    return false;
  }

  let option = M.product.options.find(function (candidate) {
    return candidate.id === optionId;
  });
  let exists =
    option !== undefined &&
    option.valeurs.some(function (value) {
      return value.id === valueId;
    });

  if (exists) {
    M.selectedValues = Object.assign({}, M.selectedValues, { [optionId]: valueId });
    M.selectedVariantId = M.findVariantId(M.selectedValues);
    M.cartStatus = "idle";
  }
  return exists;
};

/**
 * Disponibilité de chaque valeur d'option, selon les autres choix en cours :
 * la combinaison obtenue en choisissant cette valeur existe-t-elle, a-t-elle du stock ?
 * . aucun paramètre
 * > { valeurId: "disponible" | "epuise" | "absente" }
 *
 * @returns {Object}
 */
M.getValueStatuses = function () {
  return getValueStatuses(M.product, M.selectedValues);
};

/**
 * Prix de la combinaison choisie : le prix du bijou plus le supplément de
 * chaque valeur choisie. Le serveur applique la même règle (VariantModel::PRICE_SQL).
 * . aucun paramètre
 * > prix en XPF
 *
 * @returns {number}
 */
M.getPrice = function () {
  return getPrice(M.product, M.selectedValues);
};

/**
 * Prix de la combinaison choisie avant promotion automatique (US PRO-c).
 * . aucun paramètre
 * > prix en XPF
 *
 * @returns {number}
 */
M.getInitialPrice = function () {
  return getInitialPrice(M.product, M.selectedValues);
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
  return M.selectedVariantId !== null && M.cartStatus !== "adding" && !M.isSoldOut();
};

/**
 * Indique si le panier contient déjà tous les exemplaires en stock de la
 * variante choisie (le maximum atteint).
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.isMaxInCart = function () {
  let variant = M.getSelectedVariant();
  return variant !== null && variant.stock > 0 && (M.cartQuantities[variant.id] ?? 0) >= variant.stock;
};

/**
 * Indique si la variante choisie ne peut plus être ajoutée (US STK-c) : stock
 * nul, ou maximum déjà au panier. Le serveur refuse de toute façon l'ajout ; le
 * front l'évite pour ne pas proposer une action vouée à l'échec.
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.isSoldOut = function () {
  let variant = M.getSelectedVariant();
  return variant !== null && (variant.stock <= 0 || M.isMaxInCart());
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
    M.setCartQuantities(cart);
  } catch (error) {
    if (error.statut === 409) {
      // Le serveur refuse parce que le panier contient déjà tout le stock : on le retient.
      M.cartQuantities[M.selectedVariantId] = M.getSelectedVariant().stock;
      errorMessage = SOLD_OUT_MESSAGE;
    } else {
      errorMessage = `Impossible d'ajouter ce bijou au panier : ${error.message}`;
    }
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
 * > { status, product, images, imageIndex, image, message, options, selectedValues, valueStatuses, price, initialPrice,
 *     selectedVariantId, selectedVariant, isUnavailable, isSoldOut, cartStatus, cartError, canAddToCart }
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
    options: M.product === null ? [] : M.product.options,
    selectedValues: M.selectedValues,
    valueStatuses: M.product === null ? {} : M.getValueStatuses(),
    price: M.product === null ? 0 : M.getPrice(),
    initialPrice: M.product === null ? 0 : M.getInitialPrice(),
    selectedVariantId: M.selectedVariantId,
    selectedVariant: M.getSelectedVariant(),
    isUnavailable: M.product !== null && M.product.options.length > 0 && M.selectedVariantId === null,
    isSoldOut: M.isSoldOut(),
    isMaxInCart: M.isMaxInCart(),
    soldOutMessage: SOLD_OUT_MESSAGE,
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
 * Choix d'une valeur d'option : retrouve la combinaison, puis met à jour le
 * prix, la disponibilité et le bouton sans reconstruire la fiche (le focus
 * reste sur le choix, au clavier).
 * . ev : événement change, délégué depuis la racine de la page
 * > aucune valeur de retour
 *
 * @param {Event} ev
 * @returns {void}
 */
C.handler_changeOption = function (ev) {
  let input = ev.target.closest("[data-option]");

  if (input === null) {
    return;
  }

  if (M.selectOption(Number(input.dataset.option), Number(input.value))) {
    V.renderPrice(M.getState());
    V.renderValueStatuses(M.getState());
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
  V.root.addEventListener("change", C.handler_changeOption);
  return fragment;
};

/**
 * Libellé d'une valeur d'option, avec son supplément s'il y en a un et sa
 * disponibilité si la combinaison n'est pas commandable (le texte porte
 * l'information : la couleur ne fait que la souligner).
 * . value : { valeur, supplement }, status : « disponible », « epuise » ou « absente »
 * > chaîne, par exemple « Perle de Tahiti (+3 000 XPF) — épuisé »
 *
 * @param {{valeur: string, supplement: number}} value
 * @param {string} status
 * @returns {string}
 */
V.formatOneValueLabel = function (value, status) {
  return formatValueLabel(value, status);
};

/**
 * Écrit le libellé d'une valeur et grise celles qui ne sont pas commandables.
 * Elles restent sélectionnables : on peut changer les options dans n'importe
 * quel ordre, et la fiche explique ce qui manque.
 * . span : l'élément du libellé, value : la valeur, status : sa disponibilité
 * > aucune valeur de retour
 *
 * @param {HTMLElement} span
 * @param {{valeur: string, supplement: number}} value
 * @param {string} status
 * @returns {void}
 */
V.applyValueStatus = function (span, value, status) {
  span.textContent = V.formatOneValueLabel(value, status);
  span.classList.toggle("text-muted", status !== "disponible");
  span.classList.toggle("border-dashed", status !== "disponible");
};

/**
 * Groupe de choix d'une option : un bouton radio par valeur, celui de la
 * valeur choisie est coché.
 * . option : { id, nom, valeurs }, selectedValueId : valeur choisie,
 *   statuses : disponibilité de chaque valeur
 * > DocumentFragment
 *
 * @param {Object} option
 * @param {number|undefined} selectedValueId
 * @param {Object} statuses
 * @returns {DocumentFragment}
 */
V.createOptionFragment = function (option, selectedValueId, statuses) {
  let fragment = htmlToFragment(genericRenderer(templateOption, { nom: option.nom }));

  let items = option.valeurs.map(function (value) {
    let item = htmlToFragment(
      genericRenderer(templateValue, {
        optionId: option.id,
        valeurId: value.id,
        libelle: "",
      })
    );
    V.applyValueStatus(item.querySelector("span"), value, statuses[value.id]);
    item.querySelector("input").checked = value.id === selectedValueId;
    return item;
  });
  fragment.querySelector('slot[name="valeurs"]').replaceWith(...items);
  return fragment;
};

/**
 * Groupes de choix des options (aucun pour un bijou sans option) et bouton
 * d'ajout.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createAddToCartFragment = function (state) {
  let fragment = new DocumentFragment();

  if (state.options.length > 0) {
    let container = htmlToFragment(templateOptions);
    let groups = state.options.map(function (option) {
      return V.createOptionFragment(option, state.selectedValues[option.id], state.valueStatuses);
    });
    container.querySelector('slot[name="options"]').replaceWith(...groups);
    fragment.append(container);
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

  let labels = {
    adding: "Ajout en cours…",
    soldOut: "Épuisé",
    unavailable: "Combinaison indisponible",
    ready: "Ajouter au panier",
  };
  let labelKey = "ready";
  if (state.cartStatus === "adding") {
    labelKey = "adding";
  } else if (state.isUnavailable) {
    labelKey = "unavailable";
  } else if (state.isSoldOut) {
    labelKey = "soldOut";
  }
  button.textContent = labels[labelKey];
  button.dataset.epuise = String(labelKey === "soldOut" || labelKey === "unavailable");
  if (state.canAddToCart) {
    button.removeAttribute("aria-disabled");
  } else {
    button.setAttribute("aria-disabled", "true");
  }

  if (state.cartStatus === "added") {
    feedback.replaceChildren(htmlToFragment(genericRenderer(templateAddSuccess, { urlPanier: routeUrl("/panier") })));
  } else if (state.cartStatus === "error") {
    feedback.replaceChildren(htmlToFragment(genericRenderer(templateAddError, { texte: state.cartError })));
  } else if (state.cartStatus === "idle" && state.isMaxInCart) {
    feedback.replaceChildren(htmlToFragment(genericRenderer(templateAddError, { texte: state.soldOutMessage })));
  } else if (state.cartStatus === "idle" && state.selectedVariantId === null) {
    let text = state.isUnavailable
      ? "Cette combinaison d'options n'est pas proposée. Choisissez-en une autre."
      : "Ce bijou n'est pas disponible à la réservation.";
    feedback.replaceChildren(htmlToFragment(genericRenderer(templateAddError, { texte: text })));
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

  return genericRenderer(templatePhoto, {
    src: productImageUrl(image.fichier, false),
    srcPetite: productImageUrl(image.fichier, true),
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
    src: productImageUrl(image.fichier, true),
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
      urlCatalogue: routeUrl("/bijoux"),
      urlCategorie: routeUrl(`/categorie/${encodeURIComponent(product.categorie.slug)}`),
      urlSousCategorie: routeUrl(`/categorie/${encodeURIComponent(product.sousCategorie.slug)}`),
      categorie: product.categorie.nom,
      sousCategorie: product.sousCategorie.nom,
      nom: product.nom,
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
      urlCatalogue: routeUrl("/bijoux"),
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
    V.renderPrice(state);
    V.renderStock(state);
    V.renderAddToCart(state);
  }
};

/**
 * Met à jour le libellé de chaque valeur d'option après un choix, sans
 * reconstruire les groupes : le focus clavier reste sur le bouton choisi.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderValueStatuses = function (state) {
  state.options.forEach(function (option) {
    option.valeurs.forEach(function (value) {
      let input = V.root.querySelector(`input[data-option="${option.id}"][value="${value.id}"]`);
      V.applyValueStatus(input.nextElementSibling, value, state.valueStatuses[value.id]);
    });
  });
};

/**
 * Affiche le prix de la combinaison choisie.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderPrice = function (state) {
  V.root.querySelector('[data-zone="prix"]').replaceChildren(PriceView.dom({ prix: state.price, prixInitial: state.initialPrice }));
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
