import { AccountData } from "../../data/compte.js";
import { CartData, CART_CHANGED_EVENT } from "../../data/panier.js";
import { OrderData } from "../../data/commande.js";
import { formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateInfo from "./info.html?raw";
import templateContent from "./contenu.html?raw";
import templateLine from "./ligne.html?raw";
import templateImage from "./image.html?raw";
import templateError from "./erreur.html?raw";

// Les miniatures utilisent la version 400 px des photos.
const IMAGES_URL = import.meta.env.BASE_URL + "images/produits/";

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
 * Indique si la validation peut partir : client connecté, panier non vide,
 * aucune validation déjà en cours (un double clic n'envoie qu'une requête).
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.canSubmit = function () {
  return M.status === "ready" && M.user !== null && M.cart !== null && M.cart.lignes.length > 0 && !M.isSubmitting;
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
 * requise ». Un 400 signifie que le panier a changé : on le recharge.
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
    if (error.statut === 400) {
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
 * > { status, loadError, needsLogin, isEmpty, user, lines, itemCountLabel,
 *     total, isSubmitting, submitError }
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
    lines: lines,
    itemCountLabel: M.formatItemCount(M.cart === null ? 0 : M.cart.nombreArticles),
    total: M.cart === null ? 0 : M.cart.total,
    isSubmitting: M.isSubmitting,
    submitError: M.submitError,
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
  return fragment;
};

/**
 * Remplit le template d'une ligne et y place sa miniature.
 * . line : ligne du panier { variantId, libelle, prixUnitaire, quantite, sousTotal, produit }
 * > DocumentFragment
 *
 * @param {Object} line
 * @returns {DocumentFragment}
 */
V.createLineFragment = function (line) {
  let fragment = htmlToFragment(
    genericRenderer(templateLine, {
      nom: line.produit.nom,
      libelle: line.libelle,
      quantite: line.quantite,
      prixUnitaire: formatPrice(line.prixUnitaire),
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
          src: `${IMAGES_URL}${encodeURIComponent(line.produit.image.fichier)}-400.webp`,
        })
      )
    );
  }

  return fragment;
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
