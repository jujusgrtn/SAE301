import { AdminOrderData } from "../../data/admin-commande.js";
import { formatDate, formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { MessageView } from "../../ui/message/index.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateNotFound from "./introuvable.html?raw";
import templateDetail from "./detail.html?raw";
import templateLine from "./ligne.html?raw";
import templateActions from "./actions.html?raw";
import templateAdvance from "./bouton-avancer.html?raw";
import templateCancel from "./bouton-annuler.html?raw";
import templateConfirmCancel from "./confirmation-annulation.html?raw";
import templateNoAction from "./aucune-action.html?raw";

/**
 * Page « Réservation » du back-office (US PIL-b) : /admin/commandes/:numero.
 *
 * Montre une réservation (client, bijoux, total) et les changements de statut
 * qu'elle permet : disponible au retrait, retirée, annulée. Le serveur donne
 * lui-même la liste des statuts accessibles (transitions) et refuse tout autre
 * passage (409). Annuler remet en stock ce que la réservation avait retiré, ce
 * qui demande une confirmation sur la page.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage, pour ignorer une réponse arrivée après un changement de page
  number: null, // numéro de réservation lu dans l'adresse
  status: "loading", // "loading" | "ready" | "unauthorized" | "notfound" | "error"
  order: null, // réservation renvoyée par l'API (avec lignes et transitions)
  loadError: null, // texte si la réservation n'a pas pu être chargée
  isConfirmingCancel: false, // la confirmation d'annulation est affichée
  pendingStatus: null, // statut en cours d'envoi, ou null
  message: null, // { type, texte } : résultat de la dernière action
};

/**
 * Prépare l'état pour un nouvel affichage de la page.
 * . number : numéro de réservation lu dans l'adresse
 * > aucune valeur de retour
 *
 * @param {string} number
 * @returns {void}
 */
M.reset = function (number) {
  M.visit += 1;
  M.number = number;
  M.status = "loading";
  M.order = null;
  M.loadError = null;
  M.isConfirmingCancel = false;
  M.pendingStatus = null;
  M.message = null;
};

/**
 * Charge la réservation. Un 401 n'est pas une panne : il signifie que
 * l'administrateur n'est pas connecté.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchOrder = async function () {
  let visit = M.visit;

  try {
    let data = await AdminOrderData.fetchOne(M.number);

    if (visit !== M.visit) {
      return;
    }
    M.order = data.commande;
    M.status = "ready";
  } catch (error) {
    if (visit !== M.visit) {
      return;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else if (error.statut === 404 || error.statut === 400) {
      M.status = "notfound";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger la réservation : ${error.message}`;
    }
  }
};

/**
 * Indique si un statut peut être demandé : la réservation est chargée, aucun
 * changement n'est en cours (un double clic n'envoie qu'une requête), et le
 * serveur a annoncé ce passage dans ses transitions.
 * . status : statut demandé
 * > booléen
 *
 * @param {string} status
 * @returns {boolean}
 */
M.canChange = function (status) {
  return (
    M.status === "ready" && M.order !== null && M.pendingStatus === null && M.order.transitions.includes(status)
  );
};

/**
 * Affiche la confirmation d'annulation.
 * . aucun paramètre
 * > booléen : vrai si la confirmation est demandée
 *
 * @returns {boolean}
 */
M.askCancel = function () {
  if (!M.canChange("annulée")) {
    return false;
  }

  M.isConfirmingCancel = true;
  M.message = null;
  return true;
};

/**
 * Abandonne la confirmation d'annulation.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.abandonCancel = function () {
  if (M.pendingStatus === null) {
    M.isConfirmingCancel = false;
  }
};

/**
 * Passe un changement de statut en cours.
 * . status : statut demandé
 * > booléen : vrai si le changement peut partir
 *
 * @param {string} status
 * @returns {boolean}
 */
M.startChange = function (status) {
  if (!M.canChange(status)) {
    return false;
  }

  M.pendingStatus = status;
  M.message = null;
  return true;
};

/**
 * Texte annoncé après un changement de statut réussi.
 * . status : nouveau statut, refunded : exemplaires remis en stock
 * > chaîne
 *
 * @param {string} status
 * @param {number} refunded
 * @returns {string}
 */
M.formatSuccess = function (status, refunded) {
  if (status === "disponible") {
    return "La réservation est disponible au retrait.";
  }
  if (status === "retirée") {
    return "La réservation est marquée comme retirée.";
  }
  if (refunded > 0) {
    return `La réservation est annulée : ${refunded} exemplaire${refunded > 1 ? "s" : ""} remis en stock.`;
  }
  return "La réservation est annulée. Aucun exemplaire n'a été remis en stock (réservation antérieure au journal de stock, ou bijoux supprimés depuis).";
};

/**
 * Envoie le changement de statut préparé par startChange(). Le serveur vérifie
 * le passage ; s'il le refuse (409), la page se met à jour d'après son état réel.
 * . aucun paramètre
 * > Promise<boolean> : faux si la page a été quittée pendant l'envoi
 *
 * @returns {Promise<boolean>}
 */
M.submitChange = async function () {
  let visit = M.visit;
  let status = M.pendingStatus;
  let outcome = null;

  try {
    let data = await AdminOrderData.changeStatus(M.number, status);
    outcome = { order: data.commande, message: { type: "succes", texte: M.formatSuccess(status, data.stockRendu) } };
  } catch (error) {
    if (error.statut === 401) {
      outcome = { unauthorized: true };
    } else {
      outcome = { message: { type: "erreur", texte: error.message }, reload: error.statut === 409 || error.statut === 404 };
    }
  }

  if (visit !== M.visit) {
    return false;
  }

  M.pendingStatus = null;
  M.isConfirmingCancel = false;

  if (outcome.unauthorized === true) {
    M.status = "unauthorized";
    return true;
  }
  if (outcome.order !== undefined) {
    M.order = outcome.order;
  }
  M.message = outcome.message;

  if (outcome.reload === true) {
    await M.fetchOrder();
  }
  return visit === M.visit;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, order, loadError, isConfirmingCancel, pendingStatus, message }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    order: M.order,
    loadError: M.loadError,
    isConfirmingCancel: M.isConfirmingCancel,
    pendingStatus: M.pendingStatus,
    message: M.message,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge la réservation puis l'affiche.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadOrder = async function () {
  let visit = M.visit;

  await M.fetchOrder();

  if (visit === M.visit) {
    V.renderPage(M.getState());
  }
};

/**
 * Envoie un changement de statut puis affiche le résultat.
 * . status : statut demandé
 * > Promise<void>
 *
 * @param {string} status
 * @returns {Promise<void>}
 */
C.changeStatus = async function (status) {
  if (!M.startChange(status)) {
    return;
  }

  V.renderPage(M.getState());

  if (await M.submitChange()) {
    V.renderPage(M.getState());
    V.focusMessage();
  }
};

/**
 * Clic sur un bouton de suivi : avancer, demander, confirmer ou abandonner l'annulation.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnAction = async function (ev) {
  let button = ev.target.closest("button[data-action]");

  if (button === null) {
    return;
  }

  let action = button.dataset.action;

  if (action === "changer-statut") {
    await C.changeStatus(button.dataset.statut);
  }

  if (action === "demander-annulation" && M.askCancel()) {
    V.renderPage(M.getState());
    V.focusAction("abandonner-annulation");
  }

  if (action === "abandonner-annulation") {
    M.abandonCancel();
    V.renderPage(M.getState());
    V.focusAction("demander-annulation");
  }

  if (action === "confirmer-annulation") {
    await C.changeStatus("annulée");
  }
};

/**
 * Point d'entrée : page en état de chargement, rendue au routeur, puis
 * chargement lancé sans l'attendre.
 * . number : numéro lu dans l'adresse (« MC-2026-00042 »)
 * > DocumentFragment de la page
 *
 * @param {string} number
 * @returns {DocumentFragment}
 */
C.init = function (number) {
  M.reset(number);
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadOrder();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, mémorise sa racine et y délègue les clics :
 * les boutons, recréés à chaque rendu, n'ont pas d'écouteur propre.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(genericRenderer(template, { urlListe: routeUrl("/admin/commandes") }));
  V.root = fragment.firstElementChild;
  V.root.addEventListener("click", C.handler_clickOnAction);
  return fragment;
};

/**
 * Libellé du bouton qui fait passer la réservation à un statut.
 * . status : statut visé
 * > chaîne
 *
 * @param {string} status
 * @returns {string}
 */
V.formatOneActionLabel = function (status) {
  if (status === "disponible") {
    return "Marquer disponible au retrait";
  }
  if (status === "retirée") {
    return "Marquer comme retirée";
  }
  return StatusBadgeView.formatOneLabel(status);
};

/**
 * Boutons de suivi : un par statut accessible, l'annulation à part (avec sa
 * confirmation). aria-disabled plutôt que disabled pour que le bouton garde le
 * focus clavier pendant l'envoi.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createActionsFragment = function (state) {
  let transitions = state.order.transitions;

  if (transitions.length === 0) {
    let text =
      state.order.statut === "annulée"
        ? "Cette réservation est annulée : plus aucun changement n'est possible."
        : "Cette réservation a été retirée : elle est terminée.";

    return htmlToFragment(genericRenderer(templateNoAction, { texte: text }));
  }

  let fragment = htmlToFragment(templateActions);
  let buttons = fragment.querySelector('slot[name="boutons"]');
  let items = [];

  for (let i = 0; i < transitions.length; i++) {
    if (transitions[i] !== "annulée") {
      items.push(htmlToFragment(genericRenderer(templateAdvance, { statut: transitions[i], libelle: V.formatOneActionLabel(transitions[i]) })));
    }
  }
  if (transitions.includes("annulée") && !state.isConfirmingCancel) {
    items.push(htmlToFragment(templateCancel));
  }
  buttons.replaceWith(...items);

  if (state.pendingStatus !== null) {
    let all = fragment.querySelectorAll("button");
    for (let i = 0; i < all.length; i++) {
      all[i].setAttribute("aria-disabled", "true");
    }
  }

  if (transitions.includes("annulée") && state.isConfirmingCancel) {
    let confirm = htmlToFragment(templateConfirmCancel);

    if (state.pendingStatus !== null) {
      let all = confirm.querySelectorAll("button");
      for (let i = 0; i < all.length; i++) {
        all[i].setAttribute("aria-disabled", "true");
      }
      confirm.querySelector('[data-action="confirmer-annulation"]').textContent = "Annulation en cours…";
    }
    fragment.append(confirm);
  }
  return fragment;
};

/**
 * Détail complet de la réservation.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createDetailFragment = function (state) {
  let order = state.order;
  let fragment = htmlToFragment(
    genericRenderer(templateDetail, {
      numero: order.numero,
      date: formatDate(order.date),
      articles: `${order.nombreArticles} article${order.nombreArticles > 1 ? "s" : ""}`,
      total: formatPrice(order.total),
      client: `${order.client.prenom} ${order.client.nom}`,
      email: order.client.email,
    })
  );

  fragment.querySelector('slot[name="statut"]').replaceWith(StatusBadgeView.dom(order.statut));
  fragment.querySelector('slot[name="message"]').replaceWith(MessageView.dom(state.message));

  let lines = order.lignes.map(function (line) {
    return htmlToFragment(
      genericRenderer(templateLine, {
        nom: line.nomProduit,
        quantite: line.quantite,
        prixUnitaire: formatPrice(line.prixUnitaire),
        sousTotal: formatPrice(line.sousTotal),
      })
    );
  });
  fragment.querySelector('slot[name="lignes"]').replaceWith(...lines);
  fragment.querySelector('slot[name="actions"]').replaceWith(V.createActionsFragment(state));

  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, introuvable,
 * erreur ou détail.
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
  if (state.status === "unauthorized") {
    return htmlToFragment(genericRenderer(templateUnauthorized, { urlBackOffice: routeUrl("/admin") }));
  }
  if (state.status === "notfound") {
    return htmlToFragment(genericRenderer(templateNotFound, { urlListe: routeUrl("/admin/commandes") }));
  }
  if (state.status === "error") {
    return htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError }));
  }
  return V.createDetailFragment(state);
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
 * Rend le focus clavier à un bouton après la reconstruction de la page.
 * . action : valeur de data-action
 * > aucune valeur de retour
 *
 * @param {string} action
 * @returns {void}
 */
V.focusAction = function (action) {
  let button = V.root.querySelector(`[data-action="${action}"]`);

  if (button !== null) {
    button.focus();
  }
};

/**
 * Place le focus sur le résultat de l'action (succès ou erreur), pour qu'il
 * soit lu et que le clavier ne reparte pas du début de la page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusMessage = function () {
  let message = V.root.querySelector('[data-zone="contenu"] [role="status"]');

  if (message !== null) {
    message.setAttribute("tabindex", "-1");
    message.focus();
  }
};

/**
 * Page appelée par le routeur sur la route « /admin/commandes/:numero ».
 *
 * @param {{numero: string}} params - Paramètres de l'adresse.
 * @returns {DocumentFragment}
 */
export function AdminOrderPage(params) {
  return C.init(params.numero);
}
