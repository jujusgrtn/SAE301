import { AdminCategoryData } from "../../data/admin-categorie.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateEmpty from "./vide.html?raw";
import templateList from "./liste.html?raw";
import templateCategory from "./categorie.html?raw";
import templateSubCategory from "./sous-categorie.html?raw";
import templateActions from "./actions.html?raw";
import templateConfirm from "./confirmation-suppression.html?raw";

/**
 * Page « Catégories » du back-office (US GOF-c) : /admin/categories.
 *
 * Affiche les catégories principales et leurs sous-catégories dans l'ordre du
 * menu du site, avec le nombre de bijoux de chacune. Chaque ligne peut être
 * montée, descendue, modifiée ou supprimée (avec une confirmation sur la
 * ligne). Le serveur décide de tout : accès, ordre, suppression refusée tant
 * que la catégorie contient des bijoux ou des sous-catégories.
 *
 * Après une création ou une modification, la page du formulaire revient ici
 * avec ?notice=cree ou ?notice=modifie : seules ces valeurs connues sont
 * traduites en message, jamais un texte tiré de l'adresse.
 */

// Messages d'annonce, indexés par la valeur de ?notice= (liste blanche).
const NOTICES = {
  cree: "La catégorie a été créée.",
  modifie: "La catégorie a été modifiée.",
  supprime: "La catégorie a été supprimée.",
};

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  categories: [], // arbre renvoyé par l'API
  loadError: null, // texte si la liste n'a pas pu être chargée
  noticeKey: null, // clé de NOTICES à afficher, ou null
  actionError: null, // texte si un déplacement ou une suppression a échoué
  confirmingId: null, // catégorie dont la suppression attend la confirmation
  pendingId: null, // catégorie dont une action est en cours d'envoi
};

/**
 * Remet l'état à zéro avant un nouvel affichage de la page.
 * . noticeKey : valeur de ?notice= dans l'adresse, ou null
 * > aucune valeur de retour
 *
 * @param {string|null} noticeKey
 * @returns {void}
 */
M.reset = function (noticeKey) {
  M.status = "loading";
  M.categories = [];
  M.loadError = null;
  M.noticeKey = noticeKey !== null && Object.hasOwn(NOTICES, noticeKey) ? noticeKey : null;
  M.actionError = null;
  M.confirmingId = null;
  M.pendingId = null;
};

/**
 * Charge l'arbre des catégories. Un 401 n'est pas une panne : il signifie que
 * l'administrateur n'est pas connecté.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchCategories = async function () {
  try {
    let data = await AdminCategoryData.fetchAll();
    M.categories = data.categories;
    M.status = "ready";
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger les catégories : ${error.message}`;
    }
  }
};

/**
 * Retrouve une catégorie dans l'arbre, avec ses voisines du même niveau.
 * . id : identifiant de la catégorie
 * > { category, siblings, index }, ou null si elle n'existe pas
 *
 * @param {number} id
 * @returns {{category: Object, siblings: Array<Object>, index: number}|null}
 */
M.findCategory = function (id) {
  let levels = [M.categories];

  for (let i = 0; i < M.categories.length; i++) {
    levels.push(M.categories[i].sousCategories);
  }

  for (let i = 0; i < levels.length; i++) {
    let index = levels[i].findIndex(function (candidate) {
      return candidate.id === id;
    });

    if (index !== -1) {
      return { category: levels[i][index], siblings: levels[i], index: index };
    }
  }
  return null;
};

/**
 * Déplace une catégorie d'un cran dans son niveau. Sans effet sur la première
 * vers le haut ni sur la dernière vers le bas, ni pendant une autre action.
 * . id : identifiant de la catégorie, direction : « haut » ou « bas »
 * > Promise<{isDone, message}> : message annonce la nouvelle place (pour les
 *   lecteurs d'écran), ou null si rien n'a changé
 *
 * @param {number} id
 * @param {string} direction
 * @returns {Promise<{isDone: boolean, message: string|null}>}
 */
M.moveCategory = async function (id, direction) {
  let found = M.findCategory(id);

  if (found === null || M.pendingId !== null) {
    return { isDone: false, message: null };
  }

  let target = direction === "haut" ? found.index - 1 : found.index + 1;

  if (target < 0 || target >= found.siblings.length) {
    return { isDone: false, message: null };
  }

  M.pendingId = id;
  M.actionError = null;
  M.noticeKey = null;
  M.confirmingId = null;

  let name = found.category.nom;
  let message = null;

  try {
    let data = await AdminCategoryData.move(id, direction);
    M.categories = data.categories;

    let moved = M.findCategory(id);
    message = `« ${name} » est maintenant en position ${moved.index + 1} sur ${moved.siblings.length}.`;
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.actionError = `Le déplacement a échoué : ${error.message}`;
    }
  }

  M.pendingId = null;
  return { isDone: message !== null, message: message };
};

/**
 * Demande la confirmation de la suppression d'une catégorie. Refusée si une
 * action est déjà en cours.
 * . id : identifiant de la catégorie
 * > booléen : vrai si la confirmation est demandée
 *
 * @param {number} id
 * @returns {boolean}
 */
M.askDelete = function (id) {
  if (M.findCategory(id) === null || M.pendingId !== null) {
    return false;
  }

  M.confirmingId = id;
  M.noticeKey = null;
  M.actionError = null;
  return true;
};

/**
 * Abandonne la suppression en attente de confirmation.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.cancelDelete = function () {
  if (M.pendingId === null) {
    M.confirmingId = null;
  }
};

/**
 * Passe la suppression en cours : seule la catégorie dont la confirmation a
 * été demandée peut être supprimée, et une seule action à la fois.
 * . id : identifiant de la catégorie
 * > booléen : vrai si la suppression peut partir
 *
 * @param {number} id
 * @returns {boolean}
 */
M.startDelete = function (id) {
  if (M.confirmingId !== id || M.pendingId !== null) {
    return false;
  }

  M.pendingId = id;
  M.actionError = null;
  return true;
};

/**
 * Supprime la catégorie dont la suppression est en cours. Le serveur refuse
 * (409) tant qu'elle contient des bijoux ou des sous-catégories : son message
 * est affiché tel quel.
 * . aucun paramètre
 * > Promise<boolean> : vrai si la catégorie est supprimée
 *
 * @returns {Promise<boolean>}
 */
M.deleteCategory = async function () {
  let isDone = false;

  try {
    let data = await AdminCategoryData.remove(M.pendingId);
    M.categories = data.categories;
    M.noticeKey = "supprime";
    M.confirmingId = null;
    isDone = true;
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.actionError = error.message;
      M.confirmingId = null;
    }
  }

  M.pendingId = null;
  return isDone;
};

/**
 * Une catégorie avec les indications d'affichage de ses actions.
 * . category : catégorie de l'arbre, index : sa place parmi ses voisines, count : leur nombre
 * > la catégorie enrichie de canMoveUp, canMoveDown, isConfirming, isPending
 *
 * @param {Object} category
 * @param {number} index
 * @param {number} count
 * @returns {Object}
 */
M.decorate = function (category, index, count) {
  return {
    ...category,
    canMoveUp: index > 0,
    canMoveDown: index < count - 1,
    isConfirming: category.id === M.confirmingId,
    isPending: category.id === M.pendingId,
  };
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, categories, loadError, notice, actionError, isBusy }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    categories: M.categories.map(function (category, index, all) {
      let decorated = M.decorate(category, index, all.length);

      decorated.sousCategories = category.sousCategories.map(function (sub, subIndex, subs) {
        return M.decorate(sub, subIndex, subs.length);
      });
      return decorated;
    }),
    loadError: M.loadError,
    notice: M.noticeKey === null ? null : NOTICES[M.noticeKey],
    actionError: M.actionError,
    isBusy: M.pendingId !== null,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge les catégories puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadCategories = async function () {
  await M.fetchCategories();
  V.renderPage(M.getState());
};

/**
 * Clic sur un bouton d'une ligne : monter, descendre, supprimer, confirmer ou annuler.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnRowAction = async function (ev) {
  let button = ev.target.closest("button[data-action][data-id]");

  if (button === null) {
    return;
  }

  let id = Number(button.dataset.id);
  let action = button.dataset.action;

  if (action === "monter" || action === "descendre") {
    let result = await M.moveCategory(id, action === "monter" ? "haut" : "bas");

    V.renderPage(M.getState());
    if (result.message !== null) {
      V.announce(result.message);
    }
    V.focusAction(action, id);
  }

  if (action === "demander-suppression" && M.askDelete(id)) {
    V.renderPage(M.getState());
    V.focusAction("annuler-suppression", id);
  }

  if (action === "annuler-suppression") {
    M.cancelDelete();
    V.renderPage(M.getState());
    V.focusAction("demander-suppression", id);
  }

  if (action === "confirmer-suppression" && M.startDelete(id)) {
    V.renderPage(M.getState());

    await M.deleteCategory();

    V.renderPage(M.getState());
    V.focusFeedback();
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
  M.reset(V.readNoticeKey());
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadCategories();
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
  let fragment = htmlToFragment(
    genericRenderer(template, {
      urlBackOffice: routeUrl("/admin"),
      urlNouvelle: routeUrl("/admin/categories/nouveau"),
    })
  );
  V.root = fragment.firstElementChild;
  V.root.addEventListener("click", C.handler_clickOnRowAction);
  return fragment;
};

/**
 * Valeur de ?notice= dans l'adresse (envoyée par la page du formulaire).
 * . aucun paramètre
 * > chaîne, ou null si elle est absente
 *
 * @returns {string|null}
 */
V.readNoticeKey = function () {
  return new URLSearchParams(window.location.search).get("notice");
};

/**
 * Effectifs d'une catégorie, en toutes lettres.
 * . category : catégorie de M.getState()
 * > « 2 sous-catégories · 4 bijoux », ou « 2 bijoux » pour une sous-catégorie
 *
 * @param {Object} category
 * @returns {string}
 */
V.formatOneSummary = function (category) {
  let products = `${category.nombreProduits} bijou${category.nombreProduits > 1 ? "x" : ""}`;

  if (category.nombreSousCategories === undefined) {
    return products;
  }

  let subs = `${category.nombreSousCategories} sous-catégorie${category.nombreSousCategories > 1 ? "s" : ""}`;
  return `${subs} · ${products}`;
};

/**
 * Actions d'une ligne : déplacer, modifier, supprimer, ou la confirmation de
 * la suppression. aria-disabled plutôt que disabled pour que le bouton garde
 * le focus clavier, y compris quand le déplacement est impossible.
 * . category : catégorie de M.getState(), isBusy : une action est en cours
 * > DocumentFragment
 *
 * @param {Object} category
 * @param {boolean} isBusy
 * @returns {DocumentFragment}
 */
V.createActionsFragment = function (category, isBusy) {
  if (category.isConfirming) {
    let confirm = htmlToFragment(genericRenderer(templateConfirm, { id: category.id, nom: category.nom }));

    if (category.isPending) {
      let buttons = confirm.querySelectorAll("button");
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute("aria-disabled", "true");
      }
      confirm.querySelector('[data-action="confirmer-suppression"]').textContent = "Suppression…";
    }
    return confirm;
  }

  let fragment = htmlToFragment(
    genericRenderer(templateActions, {
      id: category.id,
      nom: category.nom,
      urlEdition: routeUrl(`/admin/categories/${category.id}/modifier`),
    })
  );

  if (!category.canMoveUp || isBusy) {
    fragment.querySelector('[data-action="monter"]').setAttribute("aria-disabled", "true");
  }
  if (!category.canMoveDown || isBusy) {
    fragment.querySelector('[data-action="descendre"]').setAttribute("aria-disabled", "true");
  }
  return fragment;
};

/**
 * Bloc d'une catégorie principale, avec ses sous-catégories.
 * . category : catégorie principale de M.getState(), isBusy : une action est en cours
 * > DocumentFragment
 *
 * @param {Object} category
 * @param {boolean} isBusy
 * @returns {DocumentFragment}
 */
V.formatOneCategory = function (category, isBusy) {
  let fragment = htmlToFragment(
    genericRenderer(templateCategory, {
      nom: category.nom,
      slug: category.slug,
      description: category.description,
      resume: V.formatOneSummary(category),
      urlNouvelleSousCategorie: routeUrl(`/admin/categories/nouveau?parent=${category.id}`),
    })
  );

  fragment.querySelector('slot[name="actions"]').replaceWith(V.createActionsFragment(category, isBusy));

  let list = fragment.querySelector('[data-zone="sous-categories"]');
  for (let i = 0; i < category.sousCategories.length; i++) {
    list.append(V.formatOneSubCategory(category.sousCategories[i], isBusy));
  }
  return fragment;
};

/**
 * Ligne d'une sous-catégorie.
 * . sub : sous-catégorie de M.getState(), isBusy : une action est en cours
 * > DocumentFragment
 *
 * @param {Object} sub
 * @param {boolean} isBusy
 * @returns {DocumentFragment}
 */
V.formatOneSubCategory = function (sub, isBusy) {
  let fragment = htmlToFragment(
    genericRenderer(templateSubCategory, {
      nom: sub.nom,
      slug: sub.slug,
      resume: V.formatOneSummary(sub),
    })
  );

  fragment.querySelector('slot[name="actions"]').replaceWith(V.createActionsFragment(sub, isBusy));
  return fragment;
};

/**
 * Annonce ou erreur affichée au-dessus de la liste (catégorie créée, modifiée,
 * supprimée, ou action refusée par le serveur).
 * . state : état renvoyé par M.getState()
 * > DocumentFragment, vide s'il n'y a rien à annoncer
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createFeedbackFragment = function (state) {
  if (state.actionError !== null) {
    return MessageView.dom({ type: "erreur", texte: state.actionError });
  }
  if (state.notice !== null) {
    return MessageView.dom({ type: "succes", texte: state.notice });
  }
  return new DocumentFragment();
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, erreur, liste
 * vide ou arbre des catégories.
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

  let fragment = V.createFeedbackFragment(state);

  if (state.categories.length === 0) {
    fragment.append(htmlToFragment(templateEmpty));
    return fragment;
  }

  let list = htmlToFragment(templateList);
  let zone = list.querySelector('[data-zone="categories"]');
  for (let i = 0; i < state.categories.length; i++) {
    zone.append(V.formatOneCategory(state.categories[i], state.isBusy));
  }
  fragment.append(list);
  return fragment;
};

/**
 * Remplace le contenu de la page par celui qui correspond à l'état reçu.
 * La zone n'est pas une région « aria-live » : la page est reconstruite en
 * entier à chaque action, un lecteur d'écran relirait toute la liste. Les
 * résultats sont annoncés à part (V.announce, messages en role="status").
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
 * Annonce un résultat aux lecteurs d'écran, sans rien afficher.
 * . message : texte à annoncer (« Bagues » est maintenant en position 2 sur 5.)
 * > aucune valeur de retour
 *
 * @param {string} message
 * @returns {void}
 */
V.announce = function (message) {
  let region = V.root.querySelector('[data-zone="annonce-categories"]');

  if (region === null) {
    region = document.createElement("p");
    region.setAttribute("role", "status");
    region.setAttribute("data-zone", "annonce-categories");
    region.className = "sr-only";
    V.root.append(region);
  }
  region.textContent = message;
};

/**
 * Rend le focus clavier à un bouton d'une ligne après la reconstruction de la liste.
 * . action : valeur de data-action, id : identifiant de la catégorie
 * > aucune valeur de retour
 *
 * @param {string} action
 * @param {number} id
 * @returns {void}
 */
V.focusAction = function (action, id) {
  let button = V.root.querySelector(`[data-action="${action}"][data-id="${id}"]`);

  if (button !== null) {
    button.focus();
  }
};

/**
 * Place le focus sur le message au-dessus de la liste (succès ou erreur), pour
 * que le clavier ne reparte pas du début de la page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusFeedback = function () {
  let message = V.root.querySelector('[data-zone="contenu"] [role="status"]');

  if (message !== null) {
    message.setAttribute("tabindex", "-1");
    message.focus();
  }
};

/**
 * Page appelée par le routeur sur la route « /admin/categories ».
 *
 * @returns {DocumentFragment}
 */
export function AdminCategoriesPage() {
  return C.init();
}
