import { AdminOrderData } from "../../data/admin-commande.js";
import { formatDate, formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateEmpty from "./vide.html?raw";
import templateFilters from "./filtres.html?raw";
import templateFilter from "./filtre.html?raw";
import templateList from "./liste.html?raw";
import templateRow from "./ligne.html?raw";
import templateSortOption from "./option-tri.html?raw";
import templateBatch from "./lot.html?raw";
import templateBatchActions from "./lot-actions.html?raw";
import templateBatchConfirm from "./lot-confirmation.html?raw";
import templateBatchResult from "./lot-resultat.html?raw";
import templateBatchRefusal from "./lot-refus.html?raw";
import templateBatchError from "./lot-erreur.html?raw";

/**
 * Page « Réservations » du back-office (US PIL-b) : /admin/commandes.
 *
 * Liste les réservations de tous les clients, les plus récentes d'abord, avec
 * des filtres par statut (?statut=disponible…) et un tri par date, statut ou
 * montant (?tri=montant&ordre=asc). Des cases à cocher permettent un changement
 * de statut en lot ; l'annulation en lot demande d'abord une confirmation. Le
 * serveur traite chaque réservation séparément et la page affiche ce qui a été
 * modifié et ce qui a été refusé. L'accès est décidé par le serveur : un 401
 * affiche une invite à se connecter au back-office. Le détail et les changements
 * de statut isolés sont sur la page de chaque réservation.
 */

// Les statuts d'une réservation, dans l'ordre du parcours, pour construire les filtres.
// Le serveur reste seul juge : une valeur inconnue dans l'adresse est ignorée ici
// et refusée (400) là-bas.
const STATUSES = ["en cours", "disponible", "retirée", "annulée"];

// Tris proposés (le serveur vérifie les mêmes valeurs) : le premier est celui par défaut.
const SORTS = [
  { valeur: "date", libelle: "Date de réservation" },
  { valeur: "statut", libelle: "Statut" },
  { valeur: "montant", libelle: "Montant" },
];
const DIRECTIONS = [
  { valeur: "desc", libelle: "Décroissant" },
  { valeur: "asc", libelle: "Croissant" },
];

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  filter: null, // statut filtré, ou null pour toutes les réservations
  sort: "date", // colonne de tri
  direction: "desc", // sens du tri
  selected: [], // numéros des réservations cochées
  batch: { pending: null, confirming: false, report: null, error: null }, // action en lot : statut en cours, confirmation demandée, compte rendu, erreur
  orders: [], // réservations renvoyées par l'API
  counts: {}, // nombre de réservations par statut (toutes, filtre ou non)
  loadError: null, // texte si la liste n'a pas pu être chargée
};

/**
 * Remet l'état à zéro avant un nouvel affichage de la page.
 * . filterValue : valeur de ?statut= dans l'adresse, ou null
 * . sortValue : valeur de ?tri=, directionValue : valeur de ?ordre= (ou null)
 * > aucune valeur de retour
 *
 * @param {string|null} filterValue
 * @param {string|null} sortValue
 * @param {string|null} directionValue
 * @returns {void}
 */
M.reset = function (filterValue, sortValue, directionValue) {
  M.status = "loading";
  M.filter = filterValue !== null && STATUSES.includes(filterValue) ? filterValue : null;
  M.sort = SORTS.some(function (item) {
    return item.valeur === sortValue;
  })
    ? sortValue
    : SORTS[0].valeur;
  M.direction = DIRECTIONS.some(function (item) {
    return item.valeur === directionValue;
  })
    ? directionValue
    : DIRECTIONS[0].valeur;
  M.selected = [];
  M.batch = { pending: null, confirming: false, report: null, error: null };
  M.orders = [];
  M.counts = {};
  M.loadError = null;
};

/**
 * Charge les réservations. Un 401 n'est pas une panne : il signifie que
 * l'administrateur n'est pas connecté.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchOrders = async function () {
  try {
    let data = await AdminOrderData.fetchAll(M.filter, M.sort, M.direction);
    M.orders = data.commandes;
    M.counts = data.effectifs;
    M.status = "ready";
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger les réservations : ${error.message}`;
    }
  }
};

/**
 * Chemin de la page pour un statut et un tri donnés : ceux de l'état, modifiés
 * par `changes`. Les valeurs par défaut ne s'écrivent pas.
 * . changes : propriétés à remplacer parmi statut, tri, ordre
 * > chemin de route, par exemple « /admin/commandes?statut=retirée&tri=montant »
 *
 * @param {Object} changes
 * @returns {string}
 */
M.buildPath = function (changes) {
  let values = Object.assign({ statut: M.filter, tri: M.sort, ordre: M.direction }, changes);
  let params = new URLSearchParams();

  if (values.statut !== null) {
    params.set("statut", values.statut);
  }
  if (values.tri !== SORTS[0].valeur) {
    params.set("tri", values.tri);
  }
  if (values.ordre !== DIRECTIONS[0].valeur) {
    params.set("ordre", values.ordre);
  }

  let query = params.toString();
  return query === "" ? "/admin/commandes" : `/admin/commandes?${query}`;
};

/**
 * Coche ou décoche une réservation.
 * . number : numéro de la réservation, isChecked : nouvel état de la case
 * > aucune valeur de retour
 *
 * @param {string} number
 * @param {boolean} isChecked
 * @returns {void}
 */
M.setSelected = function (number, isChecked) {
  M.selected = M.selected.filter(function (item) {
    return item !== number;
  });
  if (isChecked) {
    M.selected.push(number);
  }
  M.batch.confirming = false;
};

/**
 * Coche ou décoche toutes les réservations affichées.
 * . isChecked : vrai pour tout cocher
 * > aucune valeur de retour
 *
 * @param {boolean} isChecked
 * @returns {void}
 */
M.setAllSelected = function (isChecked) {
  M.selected = isChecked
    ? M.orders.map(function (order) {
        return order.numero;
      })
    : [];
  M.batch.confirming = false;
};

/**
 * Indique si une action en lot peut partir : au moins une réservation cochée et
 * aucune action en cours (un double clic ne part qu'une fois).
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.canRunBatch = function () {
  return M.selected.length > 0 && M.batch.pending === null;
};

/**
 * Demande la confirmation de l'annulation en lot.
 * . aucun paramètre
 * > booléen : vrai si la confirmation a été demandée
 *
 * @returns {boolean}
 */
M.askBatchCancel = function () {
  if (!M.canRunBatch()) {
    return false;
  }
  M.batch.confirming = true;
  M.batch.report = null;
  M.batch.error = null;
  return true;
};

/**
 * Abandonne la confirmation d'annulation.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.abandonBatchCancel = function () {
  M.batch.confirming = false;
};

/**
 * Ferme le compte rendu ou l'erreur de la dernière action en lot.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.closeBatchReport = function () {
  M.batch.report = null;
  M.batch.error = null;
};

/**
 * Prépare l'action en lot : une seule à la fois.
 * . status : statut visé
 * > booléen : vrai si l'action peut partir
 *
 * @param {string} status
 * @returns {boolean}
 */
M.startBatch = function (status) {
  if (!M.canRunBatch() || !STATUSES.includes(status)) {
    return false;
  }
  M.batch = { pending: status, confirming: false, report: null, error: null };
  return true;
};

/**
 * Envoie l'action en lot préparée, puis recharge la liste. Le compte rendu dit,
 * réservation par réservation, ce qui a été modifié et pourquoi le reste a été refusé.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.finishBatch = async function () {
  let status = M.batch.pending;

  try {
    let response = await AdminOrderData.changeBatch(M.selected, status);
    M.batch = { pending: null, confirming: false, report: { status: status, ...response }, error: null };
    M.selected = [];
  } catch (error) {
    if (error.statut === 401) {
      M.status = "unauthorized";
    }
    M.batch = { pending: null, confirming: false, report: null, error: `L'action n'a pas pu être appliquée : ${error.message}` };
    return;
  }

  await M.fetchOrders();
};

/**
 * Nombre de réservations, tous statuts confondus.
 * . aucun paramètre
 * > entier
 *
 * @returns {number}
 */
M.getTotalCount = function () {
  return STATUSES.reduce(function (sum, status) {
    return sum + (M.counts[status] ?? 0);
  }, 0);
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, filter, statuses, orders, counts, totalCount, loadError, filterPaths, sort, direction, sortOptions,
 *     directionOptions, selected, areAllSelected, batch }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    status: M.status,
    filter: M.filter,
    statuses: STATUSES,
    orders: M.orders,
    counts: M.counts,
    totalCount: M.getTotalCount(),
    loadError: M.loadError,
    filterPaths: Object.fromEntries(
      [null].concat(STATUSES).map(function (status) {
        return [status ?? "", M.buildPath({ statut: status })];
      })
    ),
    sort: M.sort,
    direction: M.direction,
    sortOptions: SORTS,
    directionOptions: DIRECTIONS,
    selected: M.selected,
    areAllSelected: M.orders.length > 0 && M.selected.length === M.orders.length,
    batch: M.batch,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge les réservations puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadOrders = async function () {
  await M.fetchOrders();
  V.renderPage(M.getState());
};

/**
 * Envoi du formulaire de tri : recharge la page avec le nouveau tri, le filtre
 * par statut est conservé.
 * . ev : événement submit du formulaire de tri
 * > aucune valeur de retour
 *
 * @param {SubmitEvent} ev
 * @returns {void}
 */
C.handler_submitSort = function (ev) {
  if (ev.target.closest('[data-zone="tri"]') === null) {
    return;
  }
  ev.preventDefault();

  let values = V.readSortForm(ev.target);
  V.navigate(M.buildPath({ tri: values.tri, ordre: values.ordre }));
};

/**
 * Case cochée ou décochée : une réservation, ou « Tout sélectionner ».
 * La barre d'action est mise à jour sans reconstruire la liste : le focus
 * clavier reste sur la case.
 * . ev : événement change, délégué depuis la racine de la page
 * > aucune valeur de retour
 *
 * @param {Event} ev
 * @returns {void}
 */
C.handler_changeSelection = function (ev) {
  let box = ev.target.closest('input[type="checkbox"][data-action]');

  if (box === null) {
    return;
  }

  if (box.dataset.action === "selectionner") {
    M.setSelected(box.dataset.numero, box.checked);
  } else if (box.dataset.action === "tout-selectionner") {
    M.setAllSelected(box.checked);
    V.checkAllRows(box.checked);
  } else {
    return;
  }

  V.renderBatch(M.getState());
};

/**
 * Applique une action en lot au statut visé, affiche le compte rendu, puis
 * place le focus dessus.
 * . status : statut visé
 * > Promise<void>
 *
 * @param {string} status
 * @returns {Promise<void>}
 */
C.runBatch = async function (status) {
  if (!M.startBatch(status)) {
    return;
  }

  V.renderBatch(M.getState());
  await M.finishBatch();
  V.renderPage(M.getState());
  V.focusBatchReport();
};

/**
 * Clic sur un bouton de la barre d'action en lot : changer le statut, demander
 * ou confirmer l'annulation, abandonner, désélectionner, fermer le compte rendu.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnBatch = async function (ev) {
  let button = ev.target.closest("button[data-action]");

  if (button === null) {
    return;
  }

  let action = button.dataset.action;

  if (action === "lot") {
    await C.runBatch(button.dataset.statut);
  } else if (action === "lot-annuler") {
    if (M.askBatchCancel()) {
      V.renderBatch(M.getState());
      V.focusBatchConfirmation();
    }
  } else if (action === "lot-confirmer") {
    await C.runBatch("annulée");
  } else if (action === "lot-abandonner") {
    M.abandonBatchCancel();
    V.renderBatch(M.getState());
    V.focusBatchCancelButton();
  } else if (action === "lot-vider") {
    M.setAllSelected(false);
    V.checkAllRows(false);
    V.renderBatch(M.getState());
  } else if (action === "lot-fermer") {
    M.closeBatchReport();
    V.renderBatch(M.getState());
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
  M.reset(V.readFilter(), V.readSort(), V.readDirection());
  let fragment = V.init();
  V.renderPage(M.getState());
  C.loadOrders();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page et mémorise sa racine.
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(genericRenderer(template, { urlBackOffice: routeUrl("/admin") }));
  V.root = fragment.firstElementChild;
  V.root.addEventListener("submit", C.handler_submitSort);
  V.root.addEventListener("change", C.handler_changeSelection);
  V.root.addEventListener("click", C.handler_clickOnBatch);
  return fragment;
};

/**
 * Valeur de ?statut= dans l'adresse (liens des filtres).
 * . aucun paramètre
 * > chaîne, ou null si elle est absente
 *
 * @returns {string|null}
 */
V.readFilter = function () {
  return new URLSearchParams(window.location.search).get("statut");
};

/**
 * Valeur de ?tri= dans l'adresse.
 * . aucun paramètre
 * > chaîne, ou null si elle est absente
 *
 * @returns {string|null}
 */
V.readSort = function () {
  return new URLSearchParams(window.location.search).get("tri");
};

/**
 * Valeur de ?ordre= dans l'adresse.
 * . aucun paramètre
 * > chaîne, ou null si elle est absente
 *
 * @returns {string|null}
 */
V.readDirection = function () {
  return new URLSearchParams(window.location.search).get("ordre");
};

/**
 * Colonne et sens choisis dans le formulaire de tri.
 * . form : le formulaire de tri
 * > { tri, ordre }
 *
 * @param {HTMLFormElement} form
 * @returns {{tri: string, ordre: string}}
 */
V.readSortForm = function (form) {
  return { tri: form.elements["tri"].value, ordre: form.elements["ordre"].value };
};

/**
 * Change d'adresse sans recharger le navigateur. Le routeur n'écoute que
 * popstate : on change l'adresse, puis on le prévient, comme le ferait le
 * bouton Précédent du navigateur.
 * . path : chemin de route, avec sa chaîne de requête
 * > aucune valeur de retour
 *
 * @param {string} path
 * @returns {void}
 */
V.navigate = function (path) {
  window.history.pushState(null, "", routeUrl(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Barre des filtres : « Toutes » puis un lien par statut, avec le nombre de
 * réservations. Le filtre actif porte aria-current="page".
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createFiltersFragment = function (state) {
  let fragment = htmlToFragment(templateFilters);
  let list = fragment.querySelector('[data-zone="filtres"]');

  let entries = [{ valeur: null, libelle: "Toutes", effectif: state.totalCount }];
  for (let i = 0; i < state.statuses.length; i++) {
    entries.push({
      valeur: state.statuses[i],
      libelle: StatusBadgeView.formatOneLabel(state.statuses[i]),
      effectif: state.counts[state.statuses[i]] ?? 0,
    });
  }

  for (let i = 0; i < entries.length; i++) {
    let item = htmlToFragment(
      genericRenderer(templateFilter, {
        href: routeUrl(state.filterPaths[entries[i].valeur ?? ""]),
        libelle: entries[i].libelle,
        effectif: entries[i].effectif,
      })
    );

    if (entries[i].valeur === state.filter) {
      item.querySelector("a").setAttribute("aria-current", "page");
    }
    list.append(item);
  }

  V.fillSortSelect(fragment.querySelector('select[name="tri"]'), state.sortOptions, state.sort);
  V.fillSortSelect(fragment.querySelector('select[name="ordre"]'), state.directionOptions, state.direction);
  return fragment;
};

/**
 * Remplit une liste déroulante du formulaire de tri.
 * . select : la liste à remplir (les options sont créées ici : le navigateur
 *   supprimerait un <slot> placé dans un <select>), options : [{ valeur, libelle }],
 *   selected : valeur choisie
 * > aucune valeur de retour
 *
 * @param {HTMLSelectElement} select
 * @param {Array<{valeur: string, libelle: string}>} options
 * @param {string} selected
 * @returns {void}
 */
V.fillSortSelect = function (select, options, selected) {
  let items = options.map(function (option) {
    return htmlToFragment(genericRenderer(templateSortOption, option));
  });

  select.replaceChildren(...items);
  select.value = selected;
};

/**
 * Ligne d'une réservation dans la liste.
 * . order : réservation renvoyée par GET /api/admin/commandes, isSelected : vrai si sa case est cochée
 * > DocumentFragment
 *
 * @param {Object} order
 * @param {boolean} isSelected
 * @returns {DocumentFragment}
 */
V.formatOneRow = function (order, isSelected) {
  let fragment = htmlToFragment(
    genericRenderer(templateRow, {
      href: routeUrl(`/admin/commandes/${encodeURIComponent(order.numero)}`),
      numero: order.numero,
      date: formatDate(order.date),
      client: `${order.client.prenom} ${order.client.nom}`,
      email: order.client.email,
      articles: order.nombreArticles,
      total: formatPrice(order.total),
    })
  );
  fragment.querySelector('slot[name="statut"]').replaceWith(StatusBadgeView.dom(order.statut));
  fragment.querySelector('input[data-action="selectionner"]').checked = isSelected;
  return fragment;
};

/**
 * Filtres et liste des réservations, ou message si aucune ne correspond.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createListFragment = function (state) {
  let fragment = V.createFiltersFragment(state);

  if (state.orders.length === 0) {
    let text =
      state.filter === null
        ? "Aucune réservation pour l'instant."
        : `Aucune réservation « ${state.filter} » pour l'instant.`;

    fragment.append(htmlToFragment(genericRenderer(templateEmpty, { texte: text })));
    return fragment;
  }

  let list = htmlToFragment(templateList);
  let rows = list.querySelector('[data-zone="lignes"]');
  for (let i = 0; i < state.orders.length; i++) {
    rows.append(V.formatOneRow(state.orders[i], state.selected.includes(state.orders[i].numero)));
  }
  list.querySelector('[data-action="tout-selectionner"]').checked = state.areAllSelected;
  list.querySelector('[data-zone="lot"]').replaceChildren(V.createBatchFragment(state));
  fragment.append(list);
  return fragment;
};

/**
 * Zone des actions en lot : compte rendu de la dernière action, puis soit la
 * demande de confirmation d'annulation, soit la barre d'action (si des
 * réservations sont cochées).
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createBatchFragment = function (state) {
  let fragment = new DocumentFragment();
  let batch = state.batch;

  if (batch.error !== null) {
    fragment.append(htmlToFragment(genericRenderer(templateBatchError, { texte: batch.error })));
  } else if (batch.report !== null) {
    fragment.append(V.createBatchReportFragment(batch.report));
  }

  if (state.selected.length === 0) {
    return fragment;
  }

  let count = `${state.selected.length} réservation${state.selected.length > 1 ? "s" : ""}`;

  if (batch.confirming) {
    fragment.append(htmlToFragment(genericRenderer(templateBatchConfirm, { nombre: count })));
    return fragment;
  }

  let bar = htmlToFragment(genericRenderer(templateBatch, { selection: `${count} sélectionnée${state.selected.length > 1 ? "s" : ""}` }));
  bar.querySelector('slot[name="actions"]').replaceWith(htmlToFragment(templateBatchActions));

  if (batch.pending !== null) {
    let buttons = bar.querySelectorAll("button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-disabled", "true");
    }
  }
  fragment.append(bar);
  return fragment;
};

/**
 * Compte rendu d'une action en lot : combien de réservations modifiées, combien
 * refusées, et pourquoi.
 * . report : { status, resultats, reussies, refusees }
 * > DocumentFragment
 *
 * @param {Object} report
 * @returns {DocumentFragment}
 */
V.createBatchReportFragment = function (report) {
  let returned = report.resultats.reduce(function (sum, result) {
    return sum + result.stockRendu;
  }, 0);

  let title = `${report.reussies} réservation${report.reussies > 1 ? "s" : ""} modifiée${report.reussies > 1 ? "s" : ""}`;
  if (report.status === "annulée" && report.reussies > 0) {
    title += `, ${returned} exemplaire${returned > 1 ? "s" : ""} remis en stock`;
  }
  if (report.refusees > 0) {
    title += `, ${report.refusees} refusée${report.refusees > 1 ? "s" : ""}`;
  }

  let fragment = htmlToFragment(
    genericRenderer(templateBatchResult, { titre: `${title}.`, couleur: report.reussies === 0 ? "text-danger" : "text-success" })
  );

  let refusals = report.resultats.filter(function (result) {
    return !result.ok;
  });
  let list = fragment.querySelector('[data-zone="refus"]');

  if (refusals.length === 0) {
    list.remove();
  } else {
    fragment.querySelector('slot[name="refus"]').replaceWith(
      ...refusals.map(function (result) {
        return htmlToFragment(genericRenderer(templateBatchRefusal, { numero: result.numero, message: result.message }));
      })
    );
  }
  return fragment;
};

/**
 * Remplace la zone des actions en lot, sans reconstruire la liste.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderBatch = function (state) {
  let zone = V.root.querySelector('[data-zone="lot"]');
  let selectAll = V.root.querySelector('[data-action="tout-selectionner"]');

  if (zone !== null) {
    zone.replaceChildren(V.createBatchFragment(state));
  }
  if (selectAll !== null) {
    selectAll.checked = state.areAllSelected;
  }
};

/**
 * Coche ou décoche la case de chaque réservation affichée.
 * . isChecked : nouvel état des cases
 * > aucune valeur de retour
 *
 * @param {boolean} isChecked
 * @returns {void}
 */
V.checkAllRows = function (isChecked) {
  let boxes = V.root.querySelectorAll('input[data-action="selectionner"]');

  for (let i = 0; i < boxes.length; i++) {
    boxes[i].checked = isChecked;
  }
};

/**
 * Place le focus sur le compte rendu de la dernière action en lot.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusBatchReport = function () {
  let report = V.root.querySelector('[data-zone="resultat-lot"]');

  if (report !== null) {
    report.focus();
  }
};

/**
 * Place le focus sur la question de confirmation d'annulation.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusBatchConfirmation = function () {
  let question = V.root.querySelector('[data-zone="confirmation-lot"]');

  if (question !== null) {
    question.focus();
  }
};

/**
 * Rend le focus au bouton « Annuler… » après l'abandon de la confirmation.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.focusBatchCancelButton = function () {
  let button = V.root.querySelector('[data-action="lot-annuler"]');

  if (button !== null) {
    button.focus();
  }
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, erreur ou liste.
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
  return V.createListFragment(state);
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
 * Page appelée par le routeur sur la route « /admin/commandes ».
 *
 * @returns {DocumentFragment}
 */
export function AdminOrdersPage() {
  return C.init();
}
