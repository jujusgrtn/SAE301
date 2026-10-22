import { CartData, CART_CHANGED_EVENT } from "../../data/panier.js";
import { ProductData } from "../../data/produit.js";
import { productImageUrl } from "../../lib/image.js";
import { formatOptions, formatPrice, formatStockWarning } from "../../lib/format.js";
import { findVariant, formatValueLabel, getPrice, getSelection, getValueStatuses } from "../../lib/options.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { MessageView } from "../../ui/message/index.js";
import { PriceView } from "../../ui/prix/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateEmpty from "./vide.html?raw";
import templateError from "./erreur.html?raw";
import templateContent from "./contenu.html?raw";
import templateLine from "./ligne.html?raw";
import templateImage from "./image.html?raw";
import templateStockWarning from "./alerte-stock.html?raw";
import templateLineOptions from "./options-ligne.html?raw";
import templateEditorLoading from "./editeur-chargement.html?raw";
import templateEditorLoadError from "./editeur-erreur-chargement.html?raw";
import templateEditor from "./editeur.html?raw";
import templateEditorField from "./editeur-champ.html?raw";
import templateEditorValue from "./editeur-valeur.html?raw";
import templateEditorError from "./editeur-erreur.html?raw";
import templateValidate from "./valider.html?raw";
import templateValidateBlocked from "./valider-bloque.html?raw";

/**
 * Page « Panier » (US CMD-b) : /panier.
 *
 * Le panier est conservé en session par le serveur : la page le charge, puis
 * chaque action (−, +, Retirer) renvoie le panier recalculé, qui remplace
 * l'ancien. Le front n'additionne aucun prix lui-même.
 *
 * Chaque article affiche ses options (US OPT-a) ; « Modifier les options »
 * ouvre un éditeur sous la ligne : un choix par option, avec le prix et la
 * disponibilité de la combinaison obtenue. Valider remplace la ligne en gardant
 * la quantité (le serveur fusionne avec une ligne identique et vérifie le stock).
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
  notice: null, // texte de la dernière action réussie (changement d'options)
  editor: null, // éditeur d'options ouvert : { variantId, status, product, selected, error, isSubmitting }
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
  M.notice = null;
  M.editor = null;
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
  M.notice = null;
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
 * Ouvre l'éditeur d'options d'une ligne ; un seul éditeur à la fois.
 * . variantId : la ligne à modifier
 * > booléen : vrai si l'éditeur a été ouvert (la ligne existe, a des options)
 *
 * @param {number} variantId
 * @returns {boolean}
 */
M.openEditor = function (variantId) {
  let line = M.getLine(variantId);

  if (line === null || line.options.length === 0 || M.pendingVariantId !== null) {
    return false;
  }

  M.editor = { variantId: variantId, status: "loading", product: null, selected: {}, error: null, isSubmitting: false };
  M.notice = null;
  M.actionError = null;
  return true;
};

/**
 * Charge les options du bijou de la ligne ouverte (la fiche du bijou donne les
 * options, les combinaisons et leur stock). Si l'éditeur a été fermé ou changé
 * pendant l'attente, la réponse est ignorée.
 * . aucun paramètre
 * > Promise<boolean> : vrai si l'éditeur ouvert a reçu les options
 *
 * @returns {Promise<boolean>}
 */
M.loadEditor = async function () {
  let editor = M.editor;
  let line = M.getLine(editor.variantId);
  let product = null;
  let error = null;

  try {
    product = (await ProductData.fetchBySlug(line.produit.slug)).produit;
  } catch (failure) {
    error = `Impossible de charger les options : ${failure.message}`;
  }

  if (M.editor !== editor) {
    return false;
  }

  if (error === null) {
    let current = product.variantes.find(function (variant) {
      return variant.id === editor.variantId;
    });
    if (current === undefined) {
      error = "Ce bijou n'est plus proposé avec ces options.";
    } else {
      editor.product = product;
      editor.selected = getSelection(product, current);
      editor.status = "ready";
      return true;
    }
  }

  editor.status = "error";
  editor.error = error;
  return true;
};

/**
 * Choisit une valeur dans l'éditeur. Une option ou une valeur étrangère au bijou est refusée.
 * . optionId : option modifiée, valueId : valeur choisie
 * > booléen : vrai si le choix a été retenu
 *
 * @param {number} optionId
 * @param {number} valueId
 * @returns {boolean}
 */
M.chooseEditorValue = function (optionId, valueId) {
  if (M.editor === null || M.editor.status !== "ready") {
    return false;
  }

  let option = M.editor.product.options.find(function (candidate) {
    return candidate.id === optionId;
  });
  let exists =
    option !== undefined &&
    option.valeurs.some(function (value) {
      return value.id === valueId;
    });

  if (exists) {
    M.editor.selected = Object.assign({}, M.editor.selected, { [optionId]: valueId });
    M.editor.error = null;
  }
  return exists;
};

/**
 * La combinaison que l'éditeur propose de mettre dans le panier.
 * . aucun paramètre
 * > la variante { id, prix, stock… }, ou null si la combinaison n'existe pas
 *
 * @returns {Object|null}
 */
M.getEditorTarget = function () {
  return findVariant(M.editor.product, M.editor.selected);
};

/**
 * Indique si « Valider » peut partir : la combinaison existe, a du stock, est
 * différente de l'actuelle, et aucun envoi n'est en cours.
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.canSubmitEditor = function () {
  if (M.editor === null || M.editor.status !== "ready" || M.editor.isSubmitting) {
    return false;
  }

  let target = M.getEditorTarget();
  return target !== null && target.stock > 0 && target.id !== M.editor.variantId;
};

/**
 * Passe l'envoi du changement d'options en cours : « Valider » devient inactif,
 * un double clic ne part qu'une fois.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.startSubmitEditor = function () {
  M.editor.isSubmitting = true;
  M.editor.error = null;
};

/**
 * Envoie le changement d'options préparé par startSubmitEditor(). Réussi, il remplace le panier et ferme
 * l'éditeur ; refusé (stock, maximum), l'éditeur reste ouvert avec le message
 * du serveur.
 * . aucun paramètre
 * > Promise<number|null> : identifiant de la variante choisie en cas de succès, null sinon
 *
 * @returns {Promise<number|null>}
 */
M.submitEditor = async function () {
  let editor = M.editor;
  let target = M.getEditorTarget();

  try {
    M.cart = await CartData.changeOptions(editor.variantId, target.id);
  } catch (error) {
    if (M.editor === editor) {
      editor.error = error.message;
      editor.isSubmitting = false;
    }
    return null;
  }

  M.editor = null;
  M.notice = "Les options de l'article sont modifiées.";
  return target.id;
};

/**
 * Ferme l'éditeur d'options sans rien changer.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.closeEditor = function () {
  M.editor = null;
};

/**
 * Ce que montre l'éditeur ouvert sous une ligne : un champ par option avec le
 * libellé de chaque valeur, le prix de la combinaison obtenue et si elle peut
 * être validée.
 * . line : ligne du panier concernée
 * > { status, error, isSubmitting, fields, preview, previewIsWarning, canSubmit }, ou null s'il n'est pas ouvert sur cette ligne
 *
 * @param {Object} line
 * @returns {Object|null}
 */
M.getEditorView = function (line) {
  let editor = M.editor;

  if (editor === null || editor.variantId !== line.variantId) {
    return null;
  }
  if (editor.status !== "ready") {
    return { status: editor.status, error: editor.error };
  }

  let statuses = getValueStatuses(editor.product, editor.selected);
  let target = M.getEditorTarget();
  let preview = "";

  if (target === null) {
    preview = "Cette combinaison n'est pas proposée.";
  } else if (target.stock <= 0) {
    preview = "Cette combinaison est épuisée.";
  } else if (target.id === line.variantId) {
    preview = `Combinaison actuelle : ${formatPrice(target.prix)} l'unité.`;
  } else {
    preview = `Nouveau prix : ${formatPrice(getPrice(editor.product, editor.selected))} l'unité.`;
  }

  return {
    status: "ready",
    error: editor.error,
    isSubmitting: editor.isSubmitting,
    fields: editor.product.options.map(function (option) {
      return {
        id: option.id,
        nom: option.nom,
        selectedValueId: editor.selected[option.id],
        valeurs: option.valeurs.map(function (value) {
          return { id: value.id, libelle: formatValueLabel(value, statuses[value.id]) };
        }),
      };
    }),
    preview: preview,
    previewIsWarning: target === null || target.stock <= 0,
    canSubmit: M.canSubmitEditor(),
  };
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
 * > { status, message, actionError, notice, isEmpty, itemCountLabel, total, lines, isBookable }
 *   chaque ligne ajoute optionsText (« Taille : 54 ») et editor (voir M.getEditorView)
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
    notice: M.notice,
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
        optionsText: formatOptions(line.options),
        editor: M.getEditorView(line),
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
 * Clic sur « Modifier les options » : ouvre l'éditeur sous la ligne, le charge,
 * puis place le focus sur son premier choix.
 * . variantId : la ligne concernée
 * > Promise<void>
 *
 * @param {number} variantId
 * @returns {Promise<void>}
 */
C.openEditor = async function (variantId) {
  if (!M.openEditor(variantId)) {
    return;
  }

  V.renderPage(M.getState());

  if (await M.loadEditor()) {
    V.renderPage(M.getState());
    V.focusEditorField(variantId, null);
  }
};

/**
 * Clic sur « Valider » : envoie le changement d'options. Réussi, le panier est
 * remplacé et le focus revient à « Modifier les options » de la ligne ; refusé,
 * l'éditeur reste ouvert avec le message du serveur.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.submitEditor = async function () {
  if (!M.canSubmitEditor()) {
    return;
  }

  let variantId = M.editor.variantId;

  M.startSubmitEditor();
  V.renderPage(M.getState());

  let newVariantId = await M.submitEditor();
  V.renderPage(M.getState());

  if (newVariantId === null) {
    V.focusEditorField(variantId, null);
    return;
  }

  V.notifyCartChanged(M.getItemCount());
  V.focusOptionsButton(newVariantId);
};

/**
 * Clic sur un bouton de l'éditeur d'options : « Modifier les options »,
 * « Valider » ou « Annuler ».
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnOptions = async function (ev) {
  let button = ev.target.closest("[data-action][data-variant-id]");

  if (button === null) {
    return;
  }

  let variantId = Number(button.dataset.variantId);

  if (button.dataset.action === "modifier-options") {
    await C.openEditor(variantId);
  } else if (button.dataset.action === "valider-options") {
    await C.submitEditor();
  } else if (button.dataset.action === "annuler-options") {
    M.closeEditor();
    V.renderPage(M.getState());
    V.focusOptionsButton(variantId);
  }
};

/**
 * Choix d'une valeur dans l'éditeur : le prix et la disponibilité de la
 * combinaison obtenue sont recalculés, le focus reste sur le choix.
 * . ev : événement change, délégué depuis la racine de la page
 * > aucune valeur de retour
 *
 * @param {Event} ev
 * @returns {void}
 */
C.handler_changeOption = function (ev) {
  let select = ev.target.closest("select[data-option-id]");

  if (select === null) {
    return;
  }

  let optionId = Number(select.dataset.optionId);

  if (M.chooseEditorValue(optionId, Number(select.value))) {
    V.renderPage(M.getState());
    V.focusEditorField(Number(select.dataset.variantId), optionId);
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
  V.root.addEventListener("click", C.handler_clickOnOptions);
  V.root.addEventListener("change", C.handler_changeOption);
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
      quantite: line.quantite,
      sousTotal: formatPrice(line.sousTotal),
    })
  );

  fragment.querySelector('slot[name="prix"]').replaceWith(PriceView.dom({ prix: line.prixUnitaire, prixInitial: line.prixInitial }));

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

  let optionsSlot = fragment.querySelector('slot[name="options"]');
  if (line.optionsText === "") {
    optionsSlot.remove();
  } else {
    optionsSlot.replaceWith(
      htmlToFragment(
        genericRenderer(templateLineOptions, { options: line.optionsText, variantId: line.variantId, nom: line.produit.nom })
      )
    );
  }

  // aria-disabled plutôt que disabled : le bouton garde le focus clavier.
  let flags = {
    diminuer: line.canDecrease,
    augmenter: line.canIncrease,
    retirer: !line.isBusy,
    "modifier-options": !line.isBusy,
  };
  let buttons = fragment.querySelectorAll("[data-action]");
  for (let i = 0; i < buttons.length; i++) {
    if (!flags[buttons[i].dataset.action]) {
      buttons[i].setAttribute("aria-disabled", "true");
    }
  }

  let editorSlot = fragment.querySelector('slot[name="editeur"]');
  if (line.editor === null) {
    editorSlot.remove();
  } else {
    editorSlot.replaceWith(V.createEditorFragment(line));
  }

  return fragment;
};

/**
 * Éditeur d'options d'une ligne : chargement, erreur ou un choix par option
 * avec le prix de la combinaison obtenue.
 * . line : ligne de M.getState().lines dont l'éditeur est ouvert
 * > DocumentFragment
 *
 * @param {Object} line
 * @returns {DocumentFragment}
 */
V.createEditorFragment = function (line) {
  let view = line.editor;

  if (view.status === "loading") {
    return htmlToFragment(templateEditorLoading);
  }
  if (view.status === "error") {
    return htmlToFragment(genericRenderer(templateEditorLoadError, { texte: view.error, variantId: line.variantId }));
  }

  let fragment = htmlToFragment(
    genericRenderer(templateEditor, {
      nom: line.produit.nom,
      variantId: line.variantId,
      apercu: view.preview,
      couleur: view.previewIsWarning ? "text-danger" : "text-muted",
    })
  );

  let fields = view.fields.map(function (field) {
    let fieldFragment = htmlToFragment(
      genericRenderer(templateEditorField, { variantId: line.variantId, optionId: field.id, nom: field.nom })
    );
    let select = fieldFragment.querySelector("select");
    select.replaceChildren(
      ...field.valeurs.map(function (value) {
        return htmlToFragment(genericRenderer(templateEditorValue, { id: value.id, libelle: value.libelle }));
      })
    );
    select.value = String(field.selectedValueId);
    return fieldFragment;
  });
  fragment.querySelector('slot[name="champs"]').replaceWith(...fields);

  let errorSlot = fragment.querySelector('slot[name="erreur"]');
  if (view.error === null) {
    errorSlot.remove();
  } else {
    errorSlot.replaceWith(htmlToFragment(genericRenderer(templateEditorError, { texte: view.error })));
  }

  if (!view.canSubmit) {
    fragment.querySelector('[data-action="valider-options"]').setAttribute("aria-disabled", "true");
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

  let message = null;
  if (state.actionError !== null) {
    message = { type: "erreur", texte: state.actionError };
  } else if (state.notice !== null) {
    message = { type: "succes", texte: state.notice };
  }
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
 * Place le focus sur un choix de l'éditeur d'options (le premier si optionId
 * est null), pour que le clavier reparte de là après un rendu.
 * . variantId : ligne dont l'éditeur est ouvert, optionId : option ou null
 * > aucune valeur de retour
 *
 * @param {number} variantId
 * @param {number|null} optionId
 * @returns {void}
 */
V.focusEditorField = function (variantId, optionId) {
  let selector = optionId === null ? `select[data-variant-id="${variantId}"]` : `#option-${variantId}-${optionId}`;
  let field = V.root.querySelector(selector);

  if (field !== null) {
    field.focus();
  }
};

/**
 * Place le focus sur « Modifier les options » d'une ligne (le titre de la page
 * si la ligne n'existe plus).
 * . variantId : la ligne
 * > aucune valeur de retour
 *
 * @param {number} variantId
 * @returns {void}
 */
V.focusOptionsButton = function (variantId) {
  let button = V.root.querySelector(`[data-action="modifier-options"][data-variant-id="${variantId}"]`);
  (button === null ? V.root.querySelector("h1") : button).focus();
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
