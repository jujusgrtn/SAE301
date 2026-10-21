import { AdminProductData } from "../../data/admin-produit.js";
import { productImageUrl } from "../../lib/image.js";
import { formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { MessageView } from "../../ui/message/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateEmpty from "./vide.html?raw";
import templateList from "./liste.html?raw";
import templateRow from "./ligne.html?raw";
import templateImage from "./image.html?raw";
import templateNoImage from "./sans-image.html?raw";
import templateActions from "./actions.html?raw";
import templateConfirm from "./confirmation-suppression.html?raw";

/**
 * Page « Produits » du back-office (US GOF-a) : /admin/produits.
 *
 * Liste tous les bijoux avec leur photo, leur catégorie, leur prix et leur
 * stock exact, et permet de les modifier ou de les supprimer (avec une
 * confirmation sur la ligne). L'accès est décidé par le serveur : un 401
 * affiche une invite à se connecter au back-office.
 *
 * Après une création ou une modification, la page du formulaire revient ici
 * avec ?notice=cree ou ?notice=modifie : seules ces valeurs connues sont
 * traduites en message, jamais un texte tiré de l'adresse.
 */

// Classes écrites en entier pour que Tailwind les détecte.
const STOCK_COLORS = {
  en_stock: "text-success",
  stock_faible: "text-danger",
  epuise: "text-muted",
};

// Messages d'annonce, indexés par la valeur de ?notice= (liste blanche).
const NOTICES = {
  cree: "Le bijou a été créé.",
  modifie: "Le bijou a été modifié.",
  supprime: "Le bijou a été supprimé.",
};

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  products: [], // bijoux renvoyés par l'API
  loadError: null, // texte si la liste n'a pas pu être chargée
  noticeKey: null, // clé de NOTICES à afficher, ou null
  actionError: null, // texte si une suppression a échoué
  confirmingId: null, // bijou dont la suppression attend la confirmation
  pendingId: null, // bijou en cours de suppression
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
  M.products = [];
  M.loadError = null;
  M.noticeKey = noticeKey !== null && Object.hasOwn(NOTICES, noticeKey) ? noticeKey : null;
  M.actionError = null;
  M.confirmingId = null;
  M.pendingId = null;
};

/**
 * Charge tous les bijoux. Un 401 n'est pas une panne : il signifie que
 * l'administrateur n'est pas connecté.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchProducts = async function () {
  try {
    let data = await AdminProductData.fetchAll();
    M.products = data.produits;
    M.status = "ready";
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger les produits : ${error.message}`;
    }
  }
};

/**
 * Demande la confirmation de la suppression d'un bijou. Refusée si une
 * suppression est déjà en cours.
 * . id : identifiant du bijou
 * > booléen : vrai si la confirmation est demandée
 *
 * @param {number} id
 * @returns {boolean}
 */
M.askDelete = function (id) {
  let exists = M.products.some(function (product) {
    return product.id === id;
  });

  if (!exists || M.pendingId !== null) {
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
 * Passe la suppression en cours : seul le bijou dont la confirmation a été
 * demandée peut être supprimé, et une seule suppression à la fois.
 * . id : identifiant du bijou
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
 * Supprime le bijou dont la suppression est en cours, puis le retire de la liste.
 * . aucun paramètre
 * > Promise<boolean> : vrai si le bijou est supprimé
 *
 * @returns {Promise<boolean>}
 */
M.deleteProduct = async function () {
  let id = M.pendingId;
  let isDone = false;

  try {
    await AdminProductData.remove(id);
    M.products = M.products.filter(function (product) {
      return product.id !== id;
    });
    M.noticeKey = "supprime";
    M.confirmingId = null;
    isDone = true;
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else if (error.statut === 404) {
      // Déjà supprimé ailleurs : la liste se met simplement à jour.
      M.products = M.products.filter(function (product) {
        return product.id !== id;
      });
      M.confirmingId = null;
      M.actionError = "Ce bijou n'existe plus.";
    } else {
      M.actionError = `La suppression a échoué : ${error.message}`;
    }
  }

  M.pendingId = null;
  return isDone;
};

/**
 * Photographie de l'état, transmise à la Vue. Chaque bijou indique si sa
 * suppression attend une confirmation ou est en cours.
 * . aucun paramètre
 * > { status, products, loadError, notice, actionError }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    products: M.products.map(function (product) {
      return {
        ...product,
        isConfirming: product.id === M.confirmingId,
        isPending: product.id === M.pendingId,
      };
    }),
    loadError: M.loadError,
    notice: M.noticeKey === null ? null : NOTICES[M.noticeKey],
    actionError: M.actionError,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge les bijoux puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadProducts = async function () {
  await M.fetchProducts();
  V.renderPage(M.getState());
};

/**
 * Clic sur « Supprimer », « Oui, supprimer » ou « Annuler » d'une ligne.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnRowAction = async function (ev) {
  let button = ev.target.closest("[data-action][data-id]");

  if (button === null) {
    return;
  }

  let id = Number(button.dataset.id);
  let action = button.dataset.action;

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

    let isDone = await M.deleteProduct();

    V.renderPage(M.getState());
    if (isDone) {
      V.focusNotice();
    } else {
      V.focusAction("demander-suppression", id);
    }
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
  C.loadProducts();
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
      urlNouveau: routeUrl("/admin/produits/nouveau"),
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
 * Texte du nombre de bijoux.
 * . count : nombre de bijoux
 * > « 1 bijou » ou « 20 bijoux »
 *
 * @param {number} count
 * @returns {string}
 */
V.formatOneTotal = function (count) {
  return count > 1 ? `${count} bijoux` : `${count} bijou`;
};

/**
 * Texte du stock exact, pour l'équipe.
 * . stock : exemplaires en stock
 * > « Épuisé » ou « 6 en stock »
 *
 * @param {number} stock
 * @returns {string}
 */
V.formatOneStock = function (stock) {
  return stock > 0 ? `${stock} en stock` : "Épuisé";
};

/**
 * Miniature d'un bijou, ou mention « Sans photo ».
 * . image : { fichier, alt } ou null
 * > chaîne HTML
 *
 * @param {{fichier: string, alt: string}|null} image
 * @returns {string}
 */
V.formatOneImage = function (image) {
  if (image === null) {
    return templateNoImage;
  }
  return genericRenderer(templateImage, {
    src: productImageUrl(image.fichier, true),
    alt: image.alt,
  });
};

/**
 * Actions d'une ligne : « Modifier » et « Supprimer », ou la confirmation de
 * la suppression (boutons inactifs pendant l'envoi).
 * . product : bijou de M.getState().products
 * > DocumentFragment
 *
 * @param {Object} product
 * @returns {DocumentFragment}
 */
V.createActionsFragment = function (product) {
  if (!product.isConfirming) {
    return htmlToFragment(
      genericRenderer(templateActions, {
        id: product.id,
        nom: product.nom,
        urlEdition: routeUrl(`/admin/produits/${product.id}/modifier`),
      })
    );
  }

  let fragment = htmlToFragment(genericRenderer(templateConfirm, { id: product.id, nom: product.nom }));

  if (product.isPending) {
    // aria-disabled plutôt que disabled : le bouton garde le focus clavier.
    let buttons = fragment.querySelectorAll("button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-disabled", "true");
    }
    fragment.querySelector('[data-action="confirmer-suppression"]').textContent = "Suppression…";
  }
  return fragment;
};

/**
 * Ligne d'un bijou dans la liste.
 * . product : bijou de M.getState().products
 * > DocumentFragment
 *
 * @param {Object} product
 * @returns {DocumentFragment}
 */
V.formatOneRow = function (product) {
  let fragment = htmlToFragment(
    genericRenderer(templateRow, {
      categorie: product.categorie.nom,
      sousCategorie: product.sousCategorie.nom,
      nom: product.nom,
      href: routeUrl(`/produit/${encodeURIComponent(product.slug)}`),
      prix: formatPrice(product.prix),
      stock: V.formatOneStock(product.stock),
      couleurStock: STOCK_COLORS[product.disponibilite] ?? STOCK_COLORS.en_stock,
    })
  );
  fragment.querySelector('slot[name="image"]').replaceWith(htmlToFragment(V.formatOneImage(product.image)));
  fragment.querySelector('slot[name="actions"]').replaceWith(V.createActionsFragment(product));
  return fragment;
};

/**
 * Liste complète des bijoux reçus.
 * . products : bijoux de M.getState().products
 * > DocumentFragment
 *
 * @param {Array<Object>} products
 * @returns {DocumentFragment}
 */
V.createListFragment = function (products) {
  let fragment = htmlToFragment(genericRenderer(templateList, { total: V.formatOneTotal(products.length) }));
  let list = fragment.querySelector('[data-zone="lignes"]');

  for (let i = 0; i < products.length; i++) {
    list.append(V.formatOneRow(products[i]));
  }
  return fragment;
};

/**
 * Annonce ou erreur affichée au-dessus de la liste (bijou créé, modifié,
 * supprimé, ou suppression échouée).
 * . state : état renvoyé par M.getState()
 * > DocumentFragment, vide s'il n'y a rien à annoncer
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createAnnouncementFragment = function (state) {
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
 * vide ou liste des bijoux.
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

  let fragment = V.createAnnouncementFragment(state);
  fragment.append(state.products.length === 0 ? htmlToFragment(templateEmpty) : V.createListFragment(state.products));
  return fragment;
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
 * Rend le focus clavier à un bouton d'une ligne après la reconstruction de la liste.
 * . action : valeur de data-action, id : identifiant du bijou
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
 * Place le focus sur l'annonce (par exemple « Le bijou a été supprimé. »),
 * pour que le clavier ne reparte pas du début de la page.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusNotice = function () {
  let notice = V.root.querySelector('[data-zone="contenu"] [role="status"]');

  if (notice !== null) {
    notice.setAttribute("tabindex", "-1");
    notice.focus();
  }
};

/**
 * Page appelée par le routeur sur la route « /admin/produits ».
 *
 * @returns {DocumentFragment}
 */
export function AdminProductsPage() {
  return C.init();
}
