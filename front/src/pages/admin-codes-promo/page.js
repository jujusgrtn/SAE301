import { AdminPromoData } from "../../data/admin-code-promo.js";
import { formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateBoard from "./tableau.html?raw";
import templateList from "./liste.html?raw";
import templateEmpty from "./vide.html?raw";
import templateRow from "./ligne.html?raw";
import templateActions from "./actions.html?raw";
import templateEditor from "./editeur.html?raw";
import templateConfirmDelete from "./confirmation-suppression.html?raw";
import templateError from "./erreur.html?raw";
import templateSuccess from "./succes.html?raw";
import templateDeleted from "./supprimes.html?raw";

/**
 * Page « Codes promotionnels » du back-office (US PRO-b) : /admin/codes-promo.
 *
 * Créer un code, modifier son pourcentage et son état, le supprimer (après une
 * confirmation), et lire pour chaque code son utilisation : réservations, réduction
 * accordée, montant réservé. Les réservations annulées ne comptent pas. Le serveur
 * revérifie chaque champ et renvoie la liste à jour après chaque écriture. L'accès
 * est décidé par le serveur : un 401 affiche une invite à se connecter au back-office.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage : une réponse d'un affichage précédent est ignorée
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  codes: [], // codes renvoyés par l'API, avec leurs statistiques
  deleted: { utilisations: 0, reductionTotale: 0 }, // utilisation des codes supprimés
  loadError: null, // texte si la liste n'a pas pu être chargée
  mode: null, // modification ou suppression ouverte : { type: "edit" | "delete", id }
  pending: false, // vrai pendant un envoi
  notice: null, // texte de la dernière écriture réussie
  createError: null, // texte du refus du formulaire de création
  rowError: null, // texte du refus de la modification ou de la suppression ouverte
  draft: { code: "", pourcentage: "" }, // saisie du formulaire de création, conservée si elle est refusée
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
  M.codes = [];
  M.deleted = { utilisations: 0, reductionTotale: 0 };
  M.loadError = null;
  M.mode = null;
  M.pending = false;
  M.notice = null;
  M.createError = null;
  M.rowError = null;
  M.draft = { code: "", pourcentage: "" };
};

/**
 * Range la liste renvoyée par le serveur.
 * . response : { codes, supprimes }
 * > aucune valeur de retour
 *
 * @param {Object} response
 * @returns {void}
 */
M.applyList = function (response) {
  M.codes = response.codes;
  M.deleted = response.supprimes;
  M.status = "ready";
};

/**
 * Charge les codes. Un 401 n'est pas une panne : il signifie que l'administrateur
 * n'est pas connecté. Si la page a été quittée pendant l'attente, la réponse est ignorée.
 * . aucun paramètre
 * > Promise<boolean> : vrai si la réponse concerne toujours la page affichée
 *
 * @returns {Promise<boolean>}
 */
M.fetchCodes = async function () {
  let visit = M.visit;

  try {
    let response = await AdminPromoData.fetchAll();
    if (visit !== M.visit) {
      return false;
    }
    M.applyList(response);
  } catch (error) {
    if (visit !== M.visit) {
      return false;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger les codes : ${error.message}`;
    }
  }
  return true;
};

/**
 * Un code de la liste.
 * . id : identifiant du code
 * > le code, ou null s'il n'est pas dans la liste
 *
 * @param {number} id
 * @returns {Object|null}
 */
M.findCode = function (id) {
  let code = M.codes.find(function (candidate) {
    return candidate.id === id;
  });
  return code === undefined ? null : code;
};

/**
 * Vérifie le pourcentage saisi : un entier de 1 à 100. Le serveur reste seul juge.
 * . value : texte saisi
 * > le pourcentage, ou null s'il est refusé
 *
 * @param {string} value
 * @returns {number|null}
 */
M.parsePercentage = function (value) {
  let number = Number(value);
  return value.trim() !== "" && Number.isInteger(number) && number >= 1 && number <= 100 ? number : null;
};

/**
 * Ouvre l'éditeur d'un code ; un seul éditeur ou une seule confirmation à la fois.
 * . type : "edit" | "delete", id : le code
 * > booléen : vrai si l'éditeur a été ouvert
 *
 * @param {string} type
 * @param {number} id
 * @returns {boolean}
 */
M.openMode = function (type, id) {
  if (M.pending || M.findCode(id) === null) {
    return false;
  }
  M.mode = { type: type, id: id };
  M.rowError = null;
  M.notice = null;
  return true;
};

/**
 * Ferme l'éditeur ou la confirmation ouverte, sans rien changer.
 * . aucun paramètre
 * > identifiant du code concerné, ou null s'il n'y en avait pas
 *
 * @returns {number|null}
 */
M.closeMode = function () {
  let id = M.mode === null ? null : M.mode.id;

  M.mode = null;
  M.rowError = null;
  return id;
};

/**
 * Envoie une écriture (création, modification ou suppression) et range la liste
 * renvoyée. Refusée, le message du serveur est gardé pour l'écran.
 * . action : fonction qui envoie la requête, successText : annonce en cas de succès,
 *   errorTarget : "create" ou "row" selon l'endroit où afficher un refus
 * > Promise<boolean> : vrai si l'écriture a réussi
 *
 * @param {Function} action
 * @param {string} successText
 * @param {string} errorTarget
 * @returns {Promise<boolean>}
 */
M.write = async function (action, successText, errorTarget) {
  let visit = M.visit;

  M.pending = true;
  M.createError = null;
  M.rowError = null;
  M.notice = null;

  try {
    M.applyList(await action());
    if (visit === M.visit) {
      M.notice = successText;
      M.mode = null;
    }
    M.pending = false;
    return true;
  } catch (error) {
    M.pending = false;
    if (visit !== M.visit) {
      return false;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
      return false;
    }
    if (errorTarget === "create") {
      M.createError = error.message;
    } else {
      M.rowError = error.message;
    }
    return false;
  }
};

/**
 * Crée un code. Les champs vides ou hors limites sont refusés avant l'envoi.
 * . code : texte saisi, percentage : pourcentage saisi, isActive : état choisi
 * > Promise<boolean> : vrai si le code est créé
 *
 * @param {string} code
 * @param {string} percentage
 * @param {boolean} isActive
 * @returns {Promise<boolean>}
 */
M.createCode = async function (code, percentage, isActive) {
  M.draft = { code: code.trim(), pourcentage: percentage.trim() };

  let value = M.parsePercentage(M.draft.pourcentage);

  if (M.draft.code === "") {
    M.createError = "Saisissez le code.";
    return false;
  }
  if (value === null) {
    M.createError = "Le pourcentage doit être un entier de 1 à 100.";
    return false;
  }

  let isDone = await M.write(
    function () {
      return AdminPromoData.create({ code: M.draft.code, pourcentage: value, actif: isActive });
    },
    `Le code ${M.draft.code.toUpperCase()} est créé.`,
    "create"
  );

  if (isDone) {
    M.draft = { code: "", pourcentage: "" };
  }
  return isDone;
};

/**
 * Enregistre le pourcentage et l'état du code dont l'éditeur est ouvert.
 * . percentage : pourcentage saisi, isActive : état choisi
 * > Promise<boolean> : vrai si le code est modifié
 *
 * @param {string} percentage
 * @param {boolean} isActive
 * @returns {Promise<boolean>}
 */
M.updateCode = async function (percentage, isActive) {
  let id = M.mode.id;
  let code = M.findCode(id).code;
  let value = M.parsePercentage(percentage);

  if (value === null) {
    M.rowError = "Le pourcentage doit être un entier de 1 à 100.";
    return false;
  }

  return M.write(
    function () {
      return AdminPromoData.update({ id: id, pourcentage: value, actif: isActive });
    },
    `Le code ${code} est modifié.`,
    "row"
  );
};

/**
 * Supprime le code dont la confirmation est ouverte.
 * . aucun paramètre
 * > Promise<boolean> : vrai si le code est supprimé
 *
 * @returns {Promise<boolean>}
 */
M.deleteCode = async function () {
  let id = M.mode.id;
  let code = M.findCode(id).code;

  return M.write(
    function () {
      return AdminPromoData.remove(id);
    },
    `Le code ${code} est supprimé.`,
    "row"
  );
};

/**
 * Une ligne de la liste, prête à afficher.
 * . code : code renvoyé par l'API
 * > { id, code, pourcentage, etat, isActive, utilisations, annulees, reduction, montant, mode, rowError }
 *
 * @param {Object} code
 * @returns {Object}
 */
M.decorate = function (code) {
  return {
    id: code.id,
    code: code.code,
    pourcentage: `${code.pourcentage} %`,
    percentageValue: String(code.pourcentage),
    isActive: code.actif,
    etat: code.actif ? "Actif" : "Désactivé",
    utilisations: String(code.utilisations),
    annulees: code.annulees > 0 ? ` (${code.annulees} annulée${code.annulees > 1 ? "s" : ""})` : "",
    reduction: formatPrice(code.reductionTotale),
    montant: formatPrice(code.montantReserve),
    mode: M.mode !== null && M.mode.id === code.id ? M.mode.type : null,
    rowError: M.mode !== null && M.mode.id === code.id ? M.rowError : null,
  };
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, loadError, rows, deleted, notice, createError, draft, isBusy }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    loadError: M.loadError,
    rows: M.codes.map(M.decorate),
    deleted: {
      utilisations: M.deleted.utilisations,
      reduction: formatPrice(M.deleted.reductionTotale),
    },
    notice: M.notice,
    createError: M.createError,
    draft: M.draft,
    isBusy: M.pending,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge les codes puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadCodes = async function () {
  if (await M.fetchCodes()) {
    V.renderPage(M.getState());
  }
};

/**
 * Envoi d'un des formulaires : création, ou modification d'un code. Réussi,
 * l'annonce reçoit le focus ; refusé, c'est le message d'erreur.
 * . ev : événement submit, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {SubmitEvent} ev
 * @returns {Promise<void>}
 */
C.handler_submitForm = async function (ev) {
  let form = ev.target.closest("form[data-form]");

  if (form === null) {
    return;
  }
  ev.preventDefault();

  if (M.pending) {
    return;
  }

  let values = V.readForm(form);
  let isCreation = form.dataset.form === "creer";
  let isDone = isCreation ? await M.createCode(values.code, values.pourcentage, values.actif) : await M.updateCode(values.pourcentage, values.actif);

  V.renderPage(M.getState());
  if (isDone) {
    V.focusFeedback("succes");
  } else if (M.status === "ready") {
    V.focusFeedback("erreur");
  }
};

/**
 * Clic sur un bouton d'une ligne : Modifier, Supprimer, Annuler ou « Oui, supprimer ».
 * Le focus suit l'action : champ de l'éditeur, question de confirmation, ou bouton
 * d'origine après une annulation.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnRowAction = async function (ev) {
  let button = ev.target.closest("button[data-action]");

  if (button === null) {
    return;
  }

  let action = button.dataset.action;
  let id = Number(button.dataset.id);

  if (action === "modifier" && M.openMode("edit", id)) {
    V.renderPage(M.getState());
    V.focusEditor(id);
  } else if (action === "supprimer" && M.openMode("delete", id)) {
    V.renderPage(M.getState());
    V.focusConfirmation();
  } else if (action === "annuler") {
    let closedId = M.closeMode();
    V.renderPage(M.getState());
    V.focusRowButton(closedId);
  } else if (action === "confirmer-suppression" && M.mode !== null && M.mode.type === "delete" && !M.pending) {
    let isDone = await M.deleteCode();

    V.renderPage(M.getState());
    V.focusFeedback(isDone ? "succes" : "erreur");
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
  C.loadCodes();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, mémorise sa racine et y délègue les événements.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(genericRenderer(template, { urlBackOffice: routeUrl("/admin") }));
  V.root = fragment.firstElementChild;
  V.root.addEventListener("submit", C.handler_submitForm);
  V.root.addEventListener("click", C.handler_clickOnRowAction);
  return fragment;
};

/**
 * Valeurs saisies dans un formulaire.
 * . form : le formulaire envoyé
 * > { code, pourcentage, actif } ; code est vide pour la modification
 *
 * @param {HTMLFormElement} form
 * @returns {{code: string, pourcentage: string, actif: boolean}}
 */
V.readForm = function (form) {
  return {
    code: form.elements["code"] === undefined ? "" : form.elements["code"].value,
    pourcentage: form.elements["pourcentage"].value,
    actif: form.elements["actif"].checked,
  };
};

/**
 * Message d'erreur affiché sous le formulaire de création ou dans une ligne.
 * . text : message, ou null
 * > DocumentFragment (vide si text est null)
 *
 * @param {string|null} text
 * @returns {DocumentFragment}
 */
V.createErrorFragment = function (text) {
  return text === null ? new DocumentFragment() : htmlToFragment(genericRenderer(templateError, { texte: text }));
};

/**
 * Zone d'actions d'une ligne : éditeur, confirmation de suppression, ou boutons
 * Modifier et Supprimer.
 * . row : ligne renvoyée par M.getState().rows
 * > DocumentFragment
 *
 * @param {Object} row
 * @returns {DocumentFragment}
 */
V.createRowActionsFragment = function (row) {
  let fragment = new DocumentFragment();

  if (row.mode === "edit") {
    fragment.append(
      htmlToFragment(
        genericRenderer(templateEditor, {
          id: row.id,
          code: row.code,
          pourcentage: row.percentageValue,
          coche: row.isActive ? "checked" : "",
        })
      )
    );
  } else if (row.mode === "delete") {
    fragment.append(htmlToFragment(genericRenderer(templateConfirmDelete, { id: row.id, code: row.code })));
  } else {
    fragment.append(htmlToFragment(genericRenderer(templateActions, { id: row.id, code: row.code })));
  }

  fragment.append(V.createErrorFragment(row.rowError));
  return fragment;
};

/**
 * Une ligne de la liste.
 * . row : ligne renvoyée par M.getState().rows
 * > DocumentFragment
 *
 * @param {Object} row
 * @returns {DocumentFragment}
 */
V.formatOneRow = function (row) {
  let fragment = htmlToFragment(
    genericRenderer(templateRow, {
      code: row.code,
      pourcentage: row.pourcentage,
      etat: row.etat,
      couleurEtat: row.isActive ? "text-success" : "text-muted",
      utilisations: row.utilisations,
      annulees: row.annulees,
      reduction: row.reduction,
      montant: row.montant,
    })
  );

  fragment.querySelector('slot[name="actions"]').replaceWith(V.createRowActionsFragment(row));
  return fragment;
};

/**
 * Tableau complet : formulaire de création, liste des codes et statistiques.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createBoardFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateBoard, { code: state.draft.code, pourcentage: state.draft.pourcentage })
  );

  fragment.querySelector('slot[name="erreur-creation"]').replaceWith(V.createErrorFragment(state.createError));

  let listSlot = fragment.querySelector('slot[name="liste"]');
  if (state.rows.length === 0) {
    listSlot.replaceWith(htmlToFragment(templateEmpty));
  } else {
    let list = htmlToFragment(templateList);
    let items = list.querySelector('[data-zone="codes"]');
    for (let i = 0; i < state.rows.length; i++) {
      items.append(V.formatOneRow(state.rows[i]));
    }
    listSlot.replaceWith(list);
  }

  let deletedSlot = fragment.querySelector('slot[name="supprimes"]');
  if (state.deleted.utilisations === 0) {
    deletedSlot.remove();
  } else {
    deletedSlot.replaceWith(
      htmlToFragment(genericRenderer(templateDeleted, { utilisations: state.deleted.utilisations, reduction: state.deleted.reduction }))
    );
  }
  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, erreur ou tableau.
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
  if (state.status === "error") {
    return htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError }));
  }
  return V.createBoardFragment(state);
};

/**
 * Remplace le contenu de la page par celui qui correspond à l'état reçu, et
 * l'annonce de la dernière écriture réussie.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderPage = function (state) {
  let zone = V.root.querySelector('[data-zone="contenu"]');
  zone.setAttribute("aria-busy", String(state.status === "loading" || state.isBusy));
  zone.replaceChildren(V.createContentFragment(state));

  V.root
    .querySelector('[data-zone="retour"]')
    .replaceChildren(state.notice === null ? new DocumentFragment() : htmlToFragment(genericRenderer(templateSuccess, { texte: state.notice })));
};

/**
 * Place le focus sur l'annonce de succès ou sur le message d'erreur affiché.
 * . kind : "succes" ou "erreur"
 * > aucune valeur de retour
 *
 * @param {string} kind
 * @returns {void}
 */
V.focusFeedback = function (kind) {
  let element = V.root.querySelector(`[data-zone="${kind}"]`);

  if (element !== null) {
    element.focus();
  }
};

/**
 * Place le focus sur le champ du pourcentage de l'éditeur ouvert.
 * . id : le code
 * > aucune valeur de retour
 *
 * @param {number} id
 * @returns {void}
 */
V.focusEditor = function (id) {
  let field = V.root.querySelector(`#modifier-pourcentage-${id}`);

  if (field !== null) {
    field.focus();
  }
};

/**
 * Place le focus sur la question de la confirmation de suppression.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusConfirmation = function () {
  let question = V.root.querySelector('[data-zone="confirmation-suppression"]');

  if (question !== null) {
    question.focus();
  }
};

/**
 * Rend le focus au bouton « Modifier » d'un code après l'abandon d'une action.
 * . id : le code, ou null
 * > aucune valeur de retour
 *
 * @param {number|null} id
 * @returns {void}
 */
V.focusRowButton = function (id) {
  let button = id === null ? null : V.root.querySelector(`button[data-action="modifier"][data-id="${id}"]`);

  if (button !== null) {
    button.focus();
  }
};

/**
 * Page appelée par le routeur sur la route « /admin/codes-promo ».
 *
 * @returns {DocumentFragment}
 */
export function AdminPromoCodesPage() {
  return C.init();
}
