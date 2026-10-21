import { CartData, CART_CHANGED_EVENT } from "../../data/panier.js";
import { productImageUrl } from "../../lib/image.js";
import { formatPrice, formatStockWarning } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateEmpty from "./vide.html?raw";
import templateError from "./erreur.html?raw";
import templateContent from "./contenu.html?raw";
import templateLine from "./ligne.html?raw";
import templateImage from "./image.html?raw";
import templateStockWarning from "./alerte-stock.html?raw";
import templateValidate from "./valider.html?raw";
import templateValidateBlocked from "./valider-bloque.html?raw";

/**
 * Page « Panier » (US CMD-b) : /panier.
 *
 * Le panier est conservé en session par le serveur : la page le charge, puis
 * chaque action (−, +, Retirer) renvoie le panier recalculé, qui remplace
 * l'ancien. Le front n'additionne aucun prix lui-même.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  // Même limite que Cart::MAX_QUANTITY côté serveur, qui reste seul juge :
  // elle sert ici à désactiver « + » plutôt qu'à attendre un refus.
  MAX_QUANTITY: 10,

  status: "loading", // "loading" | "success" | "error"
  cart: null, // { lignes, nombreArticles, total } renvoyé par l'API
  message: null, // texte de l'erreur de chargement
  pendingVariantId: null, // ligne en cours de modification
  pendingQuantity: null, // quantité demandée pour cette ligne (0 = retrait)
  actionError: null, // texte de l'erreur de la dernière action
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
  M.cart = null;
  M.message = null;
  M.pendingVariantId = null;
  M.pendingQuantity = null;
  M.actionError = null;
};

/**
 * Charge le panier de la session.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchCart = async function () {
  try {
    M.cart = await CartData.fetch();
    M.status = "success";
  } catch (error) {
    M.status = "error";
    M.message = `Impossible de charger votre panier : ${error.message}`;
  }
};

/**
 * Une ligne du panier, à partir de sa variante.
 * . variantId : identifiant de la variante
 * > la ligne, ou null si elle n'est pas dans le panier
 *
 * @param {number} variantId
 * @returns {Object|null}
 */
M.getLine = function (variantId) {
  if (M.cart === null) {
    return null;
  }

  let line = M.cart.lignes.find(function (candidate) {
    return candidate.variantId === variantId;
  });
  return line === undefined ? null : line;
};

/**
 * Quantité visée par une action sur une ligne.
 * . action : "diminuer" | "augmenter" | "retirer", variantId : la ligne
 * > nouvelle quantité (0 pour un retrait), ou null si l'action est impossible
 *
 * @param {string} action
 * @param {number} variantId
 * @returns {number|null}
 */
M.getTargetQuantity = function (action, variantId) {
  let line = M.getLine(variantId);

  if (line === null) {
    return null;
  }
  if (action === "retirer") {
    return 0;
  }
  if (action === "diminuer" && line.quantite > 1) {
    return line.quantite - 1;
  }
  if (action === "augmenter" && line.quantite < M.getMaxQuantity(line)) {
    return line.quantite + 1;
  }
  return null;
};

/**
 * Quantité maximale d'une ligne : la limite par bijou, ou le stock s'il est
 * plus bas (US STK-c). Le serveur reste seul juge.
 * . line : ligne du panier
 * > entier
 *
 * @param {Object} line
 * @returns {number}
 */
M.getMaxQuantity = function (line) {
  return Math.min(M.MAX_QUANTITY, line.stock);
};

/**
 * Alerte d'une ligne dont la quantité dépasse le stock actuel.
 * . line : ligne du panier
 * > texte de l'alerte, ou null si la ligne est correcte
 *
 * @param {Object} line
 * @returns {string|null}
 */
M.getStockWarning = function (line) {
  return line.depasseStock ? formatStockWarning(line.stock) : null;
};

/**
 * Prépare une action sur une ligne. Une seule action à la fois : une autre
 * demandée pendant l'envoi est ignorée.
 * . action : "diminuer" | "augmenter" | "retirer", variantId : la ligne
 * > booléen : vrai si l'action peut partir
 *
 * @param {string} action
 * @param {number} variantId
 * @returns {boolean}
 */
M.startAction = function (action, variantId) {
  if (M.pendingVariantId !== null) {
    return false;
  }

  let quantity = M.getTargetQuantity(action, variantId);

  if (quantity === null) {
    return false;
  }

  M.pendingVariantId = variantId;
  M.pendingQuantity = quantity;
  M.actionError = null;
  return true;
};

/**
 * Envoie l'action préparée par startAction() et range le panier renvoyé.
 * . aucun paramètre
 * > Promise<boolean> : vrai si le panier a été modifié
 *
 * @returns {Promise<boolean>}
 */
M.finishAction = async function () {
  let isDone = false;

  try {
    if (M.pendingQuantity === 0) {
      M.cart = await CartData.remove(M.pendingVariantId);
    } else {
      M.cart = await CartData.update(M.pendingVariantId, M.pendingQuantity);
    }
    isDone = true;
  } catch (error) {
    M.actionError = `La modification n'a pas pu être enregistrée : ${error.message}`;
  }

  M.pendingVariantId = null;
  M.pendingQuantity = null;
  return isDone;
};

/**
 * « 1 article », « 3 articles ».
 * . count : nombre d'articles
 * > chaîne
 *
 * @param {number} count
 * @returns {string}
 */
M.formatItemCount = function (count) {
  return `${count} ${count > 1 ? "articles" : "article"}`;
};

/**
 * Nombre d'articles du panier, 0 tant qu'il n'est pas chargé.
 * . aucun paramètre
 * > entier
 *
 * @returns {number}
 */
M.getItemCount = function () {
  return M.cart === null ? 0 : M.cart.nombreArticles;
};

/**
 * Photographie de l'état, transmise à la Vue. Chaque ligne indique quelles
 * actions sont possibles.
 * . aucun paramètre
 * > { status, message, actionError, isEmpty, itemCountLabel, total, lines, isBookable }
 *
 * @returns {Object}
 */
M.getState = function () {
  let lines = M.cart === null ? [] : M.cart.lignes;
  let isBusy = M.pendingVariantId !== null;

  return {
    status: M.status,
    message: M.message,
    actionError: M.actionError,
    isEmpty: lines.length === 0,
    itemCountLabel: M.formatItemCount(M.getItemCount()),
    total: M.cart === null ? 0 : M.cart.total,
    lines: lines.map(function (line) {
      return {
        ...line,
        isBusy: isBusy,
        canDecrease: !isBusy && line.quantite > 1,
        canIncrease: !isBusy && line.quantite < M.getMaxQuantity(line),
        stockWarning: M.getStockWarning(line),
      };
    }),
    isBookable: M.cart !== null && M.cart.estReservable,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le panier, l'affiche, et resynchronise le compteur de l'en-tête.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadCart = async function () {
  await M.fetchCart();
  V.renderPage(M.getState());

  if (M.status === "success") {
    V.notifyCartChanged(M.getItemCount());
  }
};

/**
 * Clic sur −, + ou Retirer d'une ligne.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnCartAction = async function (ev) {
  let button = ev.target.closest("[data-action][data-variant-id]");

  if (button === null) {
    return;
  }

  if (!M.startAction(button.dataset.action, Number(button.dataset.variantId))) {
    return;
  }

  V.renderPage(M.getState());
  let isDone = await M.finishAction();
  V.renderPage(M.getState());

  if (isDone) {
    V.notifyCartChanged(M.getItemCount());
  }
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
  C.loadCart();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, mémorise sa racine et y délègue les clics :
 * les boutons des lignes, recréés à chaque rendu, n'ont pas d'écouteur propre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  V.root.addEventListener("click", C.handler_clickOnCartAction);
  return fragment;
};

/**
 * Remplit le template d'une ligne et y place sa miniature.
 * . line : ligne de M.getState().lines
 * > DocumentFragment
 *
 * @param {Object} line
 * @returns {DocumentFragment}
 */
V.createLineFragment = function (line) {
  let fragment = htmlToFragment(
    genericRenderer(templateLine, {
      variantId: line.variantId,
      href: routeUrl(`/produit/${encodeURIComponent(line.produit.slug)}`),
      nom: line.produit.nom,
      libelle: line.libelle,
      prixUnitaire: formatPrice(line.prixUnitaire),
      quantite: line.quantite,
      sousTotal: formatPrice(line.sousTotal),
    })
  );

  let imageSlot = fragment.querySelector('slot[name="image"]');
  if (line.produit.image === null) {
    imageSlot.remove();
  } else {
    imageSlot.replaceWith(
      htmlToFragment(
        genericRenderer(templateImage, {
          src: productImageUrl(line.produit.image.fichier, true),
        })
      )
    );
  }

  let warningSlot = fragment.querySelector('slot[name="alerte"]');
  if (line.stockWarning === null) {
    warningSlot.remove();
  } else {
    warningSlot.replaceWith(htmlToFragment(genericRenderer(templateStockWarning, { texte: line.stockWarning })));
  }

  // aria-disabled plutôt que disabled : le bouton garde le focus clavier.
  let flags = { diminuer: line.canDecrease, augmenter: line.canIncrease, retirer: !line.isBusy };
  let buttons = fragment.querySelectorAll("[data-action]");
  for (let i = 0; i < buttons.length; i++) {
    if (!flags[buttons[i].dataset.action]) {
      buttons[i].setAttribute("aria-disabled", "true");
    }
  }

  return fragment;
};

/**
 * Lignes du panier, message d'erreur éventuel et récapitulatif.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createCartFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateContent, {
      nombreArticles: state.itemCountLabel,
      total: formatPrice(state.total),
    })
  );

  // Panier non réservable (stock dépassé) : pas de lien de validation, mais
  // l'explication de ce qu'il faut corriger.
  fragment
    .querySelector('slot[name="validation"]')
    .replaceWith(
      htmlToFragment(
        state.isBookable
          ? genericRenderer(templateValidate, { urlRecapitulatif: routeUrl("/commande/recapitulatif") })
          : templateValidateBlocked
      )
    );

  let message = state.actionError === null ? null : { type: "erreur", texte: state.actionError };
  fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(message));

  let lines = state.lines.map(function (line) {
    return V.createLineFragment(line);
  });
  fragment.querySelector('slot[name="lignes"]').replaceWith(...lines);

  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, erreur, panier vide ou lignes.
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
  if (state.status === "error") {
    return htmlToFragment(genericRenderer(templateError, { texte: state.message, urlCatalogue: routeUrl("/") }));
  }
  if (state.isEmpty) {
    return htmlToFragment(genericRenderer(templateEmpty, { urlCatalogue: routeUrl("/") }));
  }
  return V.createCartFragment(state);
};

/**
 * Remplace le contenu de la page par celui qui correspond à l'état reçu.
 *
 * Le focus clavier est rendu au même bouton après la reconstruction ; si sa
 * ligne a disparu (retrait), il revient au titre de la page.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderPage = function (state) {
  let zone = V.root.querySelector('[data-zone="contenu"]');
  let focused = document.activeElement;
  let focusSelector = null;

  if (zone.contains(focused) && focused.dataset.action !== undefined) {
    focusSelector = `[data-action="${focused.dataset.action}"][data-variant-id="${focused.dataset.variantId}"]`;
  }

  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(V.createContentFragment(state));

  if (focusSelector !== null) {
    let target = zone.querySelector(focusSelector);
    (target === null ? V.root.querySelector("h1") : target).focus();
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
 * Page appelée par le routeur sur la route « /panier ».
 *
 * @returns {DocumentFragment}
 */
export function CartPage() {
  return C.init();
}
