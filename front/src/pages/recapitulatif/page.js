import { AccountData } from "../../data/compte.js";
import { CartData, CART_CHANGED_EVENT } from "../../data/panier.js";
import { OrderData } from "../../data/commande.js";
import { productImageUrl } from "../../lib/image.js";
import { formatOptions, formatPrice, formatStockWarning } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { PriceView } from "../../ui/prix/index.js";
import { TotalsView } from "../../ui/lignes-totaux/index.js";
import templateCodeInput from "./code-saisie.html?raw";
import templateCodeError from "./code-erreur.html?raw";
import templateCodeApplied from "./code-applique.html?raw";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateInfo from "./info.html?raw";
import templateContent from "./contenu.html?raw";
import templateLine from "./ligne.html?raw";
import templateImage from "./image.html?raw";
import templateError from "./erreur.html?raw";
import templateStockWarning from "./alerte-stock.html?raw";
import templateBlocked from "./bloque.html?raw";

/**
 * Page « Récapitulatif » (US CMD-a) : /commande/recapitulatif.
 *
 * Elle montre le panier, le client et le lieu de retrait, puis valide la
 * réservation. Le serveur refait toutes les vérifications : connexion,
 * panier non vide, prix. Après validation, la page de confirmation prend
 * le relais.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "ready" | "error"
  user: null, // { prenom, nom, email } ou null si personne n'est connecté
  cart: null, // { lignes, nombreArticles, total }
  loadError: null, // texte si la page n'a pas pu être chargée
  isSubmitting: false,
  submitError: null, // texte si la validation a échoué
  isApplyingCode: false, // vrai pendant l'envoi du code promo
  codeError: null, // texte si le code promo a été refusé
  codeDraft: "", // code saisi, conservé si le serveur le refuse
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
  M.user = null;
  M.cart = null;
  M.loadError = null;
  M.isSubmitting = false;
  M.submitError = null;
  M.isApplyingCode = false;
  M.codeError = null;
  M.codeDraft = "";
};

/**
 * Charge en parallèle le client connecté et le panier de la session.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchSummary = async function () {
  try {
    let results = await Promise.all([AccountData.fetch(), CartData.fetch()]);
    M.user = results[0].utilisateur;
    M.cart = results[1];
    M.status = "ready";
  } catch (error) {
    M.status = "error";
    M.loadError = `Impossible de préparer votre réservation : ${error.message}`;
  }
};

/**
 * Indique si la validation peut partir : client connecté, panier non vide et
 * réservable (aucune ligne au-delà du stock, US STK-c), aucune validation
 * déjà en cours (un double clic n'envoie qu'une requête).
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.canSubmit = function () {
  return (
    M.status === "ready" &&
    M.user !== null &&
    M.cart !== null &&
    M.cart.lignes.length > 0 &&
    M.cart.estReservable &&
    !M.isSubmitting
  );
};

/**
 * Applique un code promotionnel au panier. Le serveur vérifie le code (il existe,
 * il est actif) et renvoie le panier avec la réduction ; refusé, le message du
 * serveur est conservé et le code saisi reste dans le champ.
 * . code : code saisi
 * > Promise<boolean> : vrai si le code est appliqué
 *
 * @param {string} code
 * @returns {Promise<boolean>}
 */
M.applyCode = async function (code) {
  M.codeDraft = code.trim();
  M.codeError = null;
  M.submitError = null;
  M.isApplyingCode = true;
  let isDone = false;

  try {
    M.cart = await CartData.applyCode(M.codeDraft);
    M.codeDraft = "";
    isDone = true;
  } catch (error) {
    M.codeError = error.message;
  }

  M.isApplyingCode = false;
  return isDone;
};

/**
 * Retire le code promotionnel du panier.
 * . aucun paramètre
 * > Promise<boolean> : vrai si le code est retiré
 *
 * @returns {Promise<boolean>}
 */
M.removeCode = async function () {
  M.codeError = null;
  M.submitError = null;
  M.isApplyingCode = true;
  let isDone = false;

  try {
    M.cart = await CartData.removeCode();
    isDone = true;
  } catch (error) {
    M.codeError = `Le code n'a pas pu être retiré : ${error.message}`;
  }

  M.isApplyingCode = false;
  return isDone;
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
 * Passe la validation en cours.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.startSubmit = function () {
  M.isSubmitting = true;
  M.submitError = null;
};

/**
 * Valide la réservation auprès du serveur.
 *
 * Un 401 signifie que la session a expiré : la page repasse en « connexion
 * requise ». Un 400 (panier changé) ou un 409 (stock insuffisant, STK-c)
 * signifie que le panier doit être relu : on le recharge pour afficher les
 * lignes à corriger.
 * . aucun paramètre
 * > Promise<string|null> : le numéro de réservation, ou null en cas d'échec
 *
 * @returns {Promise<string|null>}
 */
M.submitOrder = async function () {
  let number = null;

  try {
    let response = await OrderData.create();
    number = response.commande.numero;
  } catch (error) {
    M.submitError = `La réservation n'a pas pu être validée : ${error.message}`;

    if (error.statut === 401) {
      M.user = null;
    }
    if (error.statut === 400 || error.statut === 409) {
      await M.reloadCart();
    }
  }

  M.isSubmitting = false;
  return number;
};

/**
 * Recharge le panier après un refus du serveur ; en cas d'échec, l'ancien
 * contenu reste affiché avec le message d'erreur.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.reloadCart = async function () {
  try {
    M.cart = await CartData.fetch();
  } catch (error) {
    // Le message de M.submitError suffit à expliquer la situation.
  }
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
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, loadError, needsLogin, isEmpty, user, lines, itemCountLabel, subtotal, promo,
 *     reduction, total (à régler), isBookable, isSubmitting, submitError, isApplyingCode, codeError, codeDraft }
 *
 * @returns {Object}
 */
M.getState = function () {
  let lines = M.cart === null ? [] : M.cart.lignes;

  return {
    status: M.status,
    loadError: M.loadError,
    needsLogin: M.user === null,
    isEmpty: lines.length === 0,
    user: M.user,
    lines: lines.map(function (line) {
      return { ...line, stockWarning: M.getStockWarning(line) };
    }),
    isBookable: M.cart !== null && M.cart.estReservable,
    itemCountLabel: M.formatItemCount(M.cart === null ? 0 : M.cart.nombreArticles),
    subtotal: M.cart === null ? 0 : M.cart.total,
    promo: M.cart === null ? null : M.cart.codePromo,
    reduction: M.cart === null ? 0 : M.cart.reduction,
    total: M.cart === null ? 0 : M.cart.totalAPayer,
    isSubmitting: M.isSubmitting,
    submitError: M.submitError,
    isApplyingCode: M.isApplyingCode,
    codeError: M.codeError,
    codeDraft: M.codeDraft,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le client et le panier, puis affiche le récapitulatif.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadSummary = async function () {
  await M.fetchSummary();
  V.renderPage(M.getState());
};

/**
 * Clic sur « Valider ma réservation ».
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnSubmit = async function (ev) {
  if (ev.target.closest('[data-action="valider"]') === null || !M.canSubmit()) {
    return;
  }

  M.startSubmit();
  V.renderBusy(M.getState());

  let number = await M.submitOrder();

  if (number !== null) {
    V.notifyCartChanged(0);
    V.goToConfirmation(number);
    return;
  }

  V.renderPage(M.getState());
  V.focusError();
};

/**
 * Envoi du formulaire du code promo : le serveur vérifie le code et renvoie le
 * total avec la réduction. Refusé, le message s'affiche sous le champ, qui
 * garde le focus.
 * . ev : événement submit, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {SubmitEvent} ev
 * @returns {Promise<void>}
 */
C.handler_submitCode = async function (ev) {
  if (ev.target.closest('form[data-form="code-promo"]') === null) {
    return;
  }
  ev.preventDefault();

  if (M.isApplyingCode || M.isSubmitting) {
    return;
  }

  let isDone = await M.applyCode(V.readCode(ev.target));

  V.renderPage(M.getState());
  if (isDone) {
    V.focusCodeApplied();
  } else {
    V.focusCodeField();
  }
};

/**
 * Clic sur « Retirer le code » : le total revient à sa valeur sans réduction.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnRemoveCode = async function (ev) {
  if (ev.target.closest('[data-action="retirer-code"]') === null || M.isApplyingCode || M.isSubmitting) {
    return;
  }

  await M.removeCode();
  V.renderPage(M.getState());
  V.focusCodeField();
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
  C.loadSummary();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, mémorise sa racine et y délègue les clics.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(template);
  V.root = fragment.firstElementChild;
  V.root.addEventListener("click", C.handler_clickOnSubmit);
  V.root.addEventListener("click", C.handler_clickOnRemoveCode);
  V.root.addEventListener("submit", C.handler_submitCode);
  return fragment;
};

/**
 * Remplit le template d'une ligne et y place sa miniature.
 * . line : ligne du panier { variantId, libelle, options, prixUnitaire, quantite, sousTotal, produit }
 * > DocumentFragment
 *
 * @param {Object} line
 * @returns {DocumentFragment}
 */
V.createLineFragment = function (line) {
  let fragment = htmlToFragment(
    genericRenderer(templateLine, {
      nom: line.produit.nom,
      options: formatOptions(line.options),
      quantite: line.quantite,
      sousTotal: formatPrice(line.sousTotal),
    })
  );

  fragment.querySelector('slot[name="prix"]').replaceWith(PriceView.dom({ prix: line.prixUnitaire, prixInitial: line.prixInitial }));

  let warningSlot = fragment.querySelector('slot[name="alerte"]');
  if (line.stockWarning === null) {
    warningSlot.remove();
  } else {
    warningSlot.replaceWith(htmlToFragment(genericRenderer(templateStockWarning, { texte: line.stockWarning })));
  }

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

  return fragment;
};

/**
 * Code promo : le champ de saisie, ou le code appliqué avec « Retirer le code »,
 * puis les lignes sous-total et réduction au-dessus du total.
 * . fragment : le récapitulatif, state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {DocumentFragment} fragment
 * @param {Object} state
 * @returns {void}
 */
V.fillPromo = function (fragment, state) {
  let promoSlot = fragment.querySelector('slot[name="promo"]');

  if (state.promo === null) {
    let input = htmlToFragment(genericRenderer(templateCodeInput, { valeur: state.codeDraft }));
    let errorSlot = input.querySelector('slot[name="erreur"]');

    if (state.codeError === null) {
      errorSlot.remove();
    } else {
      errorSlot.replaceWith(htmlToFragment(genericRenderer(templateCodeError, { texte: state.codeError })));
    }
    promoSlot.replaceWith(input);
  } else {
    promoSlot.replaceWith(
      htmlToFragment(genericRenderer(templateCodeApplied, { code: state.promo.code, pourcentage: state.promo.pourcentage }))
    );
  }

  fragment.querySelector('slot[name="reduction"]').replaceWith(
    TotalsView.dom({
      sousTotal: state.subtotal,
      reduction: state.reduction,
      codePromo: state.promo === null ? null : state.promo.code,
      pourcentagePromo: state.promo === null ? null : state.promo.pourcentage,
    })
  );
};

/**
 * Récapitulatif complet : bijoux, retrait, client, total et bouton.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createSummaryFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateContent, {
      urlPanier: routeUrl("/panier"),
      prenom: state.user.prenom,
      nom: state.user.nom,
      email: state.user.email,
      nombreArticles: state.itemCountLabel,
      total: formatPrice(state.total),
    })
  );

  let lines = state.lines.map(function (line) {
    return V.createLineFragment(line);
  });
  fragment.querySelector('slot[name="lignes"]').replaceWith(...lines);

  // Panier non réservable : le bouton reste visible mais inactif, avec
  // l'explication juste au-dessus.
  let blockedSlot = fragment.querySelector('slot[name="blocage"]');
  if (state.isBookable) {
    blockedSlot.remove();
  } else {
    blockedSlot.replaceWith(htmlToFragment(genericRenderer(templateBlocked, { urlPanier: routeUrl("/panier") })));
    fragment.querySelector('[data-action="valider"]').setAttribute("aria-disabled", "true");
  }

  V.fillPromo(fragment, state);

  let errorSlot = fragment.querySelector('slot[name="erreur"]');
  if (state.submitError === null) {
    errorSlot.remove();
  } else {
    errorSlot.replaceWith(htmlToFragment(genericRenderer(templateError, { texte: state.submitError })));
  }

  return fragment;
};

/**
 * Message centré avec un lien (connexion requise, panier vide, erreur).
 * . texte : message, lien : texte du lien, path : route visée
 * > DocumentFragment
 *
 * @param {string} texte
 * @param {string} lien
 * @param {string} path
 * @returns {DocumentFragment}
 */
V.createInfoFragment = function (texte, lien, path) {
  return htmlToFragment(genericRenderer(templateInfo, { texte: texte, lien: lien, url: routeUrl(path) }));
};

/**
 * Contenu correspondant à l'état.
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
    return V.createInfoFragment(state.loadError, "Retour au panier", "/panier");
  }
  if (state.isEmpty) {
    return V.createInfoFragment("Votre panier est vide : rien à réserver pour l'instant.", "Découvrir nos bijoux", "/");
  }
  if (state.needsLogin) {
    return V.createInfoFragment(
      "Connectez-vous ou créez votre compte pour valider votre réservation. Votre panier est conservé.",
      "Me connecter",
      "/connexion"
    );
  }
  return V.createSummaryFragment(state);
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
 * Marque le bouton pendant l'envoi, sans reconstruire la page : il garde le
 * focus clavier.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderBusy = function (state) {
  let button = V.root.querySelector('[data-action="valider"]');

  if (state.isSubmitting) {
    button.setAttribute("aria-disabled", "true");
    button.textContent = "Validation en cours…";
  }
};

/**
 * Valeur saisie dans le champ du code promo.
 * . form : le formulaire du code
 * > chaîne
 *
 * @param {HTMLFormElement} form
 * @returns {string}
 */
V.readCode = function (form) {
  return form.elements["code"].value;
};

/**
 * Place le focus sur le champ du code promo (après un refus ou un retrait).
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusCodeField = function () {
  let field = V.root.querySelector("#code-promo");

  if (field !== null) {
    field.focus();
  }
};

/**
 * Place le focus sur l'annonce du code appliqué, pour qu'elle soit lue.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusCodeApplied = function () {
  let message = V.root.querySelector('[data-zone="code-applique"]');

  if (message !== null) {
    message.focus();
  }
};

/**
 * Place le focus sur le message d'erreur de la validation, s'il est affiché.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusError = function () {
  let error = V.root.querySelector('[data-zone="erreur"]');

  if (error !== null) {
    error.focus();
  }
};

/**
 * Annonce au layout le nouveau nombre d'articles du panier.
 * . count : nombre d'articles
 * > aucune valeur de retour
 *
 * @param {number} count
 * @returns {void}
 */
V.notifyCartChanged = function (count) {
  document.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT, { detail: { nombreArticles: count } }));
};

/**
 * Affiche la page de confirmation de la réservation.
 *
 * Le routeur affiche la page de l'adresse courante à chaque événement
 * popstate : on change l'adresse, puis on le prévient, comme le ferait le
 * bouton Précédent du navigateur.
 * . number : numéro de la réservation
 * > aucune valeur de retour
 *
 * @param {string} number
 * @returns {void}
 */
V.goToConfirmation = function (number) {
  window.history.pushState(null, "", routeUrl(`/commande/confirmation?numero=${encodeURIComponent(number)}`));
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Page appelée par le routeur sur la route « /commande/recapitulatif ».
 *
 * @returns {DocumentFragment}
 */
export function SummaryPage() {
  return C.init();
}
