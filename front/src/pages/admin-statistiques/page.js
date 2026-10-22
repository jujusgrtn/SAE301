import { AdminStatsData } from "../../data/admin-statistiques.js";
import { formatDate, formatDay, formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { StatusBadgeView } from "../../ui/badge-statut/index.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateBoard from "./tableau.html?raw";
import templateIndicator from "./indicateur.html?raw";
import templateRevenue from "./revenus.html?raw";
import templateColumn from "./colonne.html?raw";
import templateDayValue from "./valeur-jour.html?raw";
import templateStatuses from "./statuts.html?raw";
import templateStatus from "./statut.html?raw";
import templateProducts from "./produits.html?raw";
import templateProduct from "./produit.html?raw";
import templateAlerts from "./alertes.html?raw";
import templateAlert from "./alerte.html?raw";
import templateAlertList from "./alertes-liste.html?raw";
import templateNoProducts from "./produits-vide.html?raw";
import templateRanking from "./classement.html?raw";
import templateStocks from "./stocks.html?raw";
import templateStockBar from "./barre-stock.html?raw";

/**
 * Page « Statistiques » du back-office (US PIL-a) : /admin/statistiques.
 *
 * Stock par bijou (histogramme), revenus des 7 derniers jours (réservations
 * retirées seulement, rangées par jour de réservation), réservations par
 * statut, bijoux les plus réservés et alertes de stock. Les données sont relues
 * à chaque affichage et à chaque clic sur « Actualiser » ; l'export CSV est un
 * simple lien de téléchargement. L'accès est décidé par le serveur : un 401
 * affiche une invite à se connecter au back-office.
 */

// Les couleurs sont écrites en entier, et non assemblées : Tailwind ne génère que
// les classes qu'il trouve telles quelles dans le code. Le texte porte toujours
// l'information (« épuisé », « faible ») : la couleur ne fait que la souligner.
const STOCK_TONES = {
  epuise: { fill: "bg-danger", text: "text-danger" },
  stock_faible: { fill: "bg-cart-badge", text: "text-muted" },
  en_stock: { fill: "bg-primary", text: "text-muted" },
};

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage : une réponse d'un affichage précédent est ignorée
  status: "loading", // "loading" | "unauthorized" | "error" | "ready"
  stats: null, // réponse de GET /api/admin/statistiques
  loadError: null, // texte si les statistiques n'ont pas pu être chargées
  isRefreshing: false, // vrai pendant « Actualiser »
  refreshMessage: null, // annonce après une actualisation
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
  M.stats = null;
  M.loadError = null;
  M.isRefreshing = false;
  M.refreshMessage = null;
};

/**
 * Charge les statistiques. Un 401 n'est pas une panne : il signifie que
 * l'administrateur n'est pas connecté. Si la page a été quittée pendant
 * l'attente, la réponse est ignorée. En cas d'échec d'une actualisation, les
 * données déjà affichées sont conservées.
 * . aucun paramètre
 * > Promise<boolean> : vrai si la réponse concerne toujours la page affichée
 *
 * @returns {Promise<boolean>}
 */
M.fetchStats = async function () {
  let visit = M.visit;
  let wasReady = M.status === "ready";

  try {
    let stats = await AdminStatsData.fetch();
    if (visit !== M.visit) {
      return false;
    }
    M.stats = stats;
    M.status = "ready";
    M.loadError = null;
  } catch (error) {
    if (visit !== M.visit) {
      return false;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else if (wasReady) {
      M.loadError = `L'actualisation a échoué : ${error.message}`;
    } else {
      M.status = "error";
      M.loadError = `Impossible de charger les statistiques : ${error.message}`;
    }
  }
  return true;
};

/**
 * Prépare une actualisation. Une seule à la fois : un double clic ne lance
 * qu'une requête.
 * . aucun paramètre
 * > booléen : vrai si l'actualisation peut partir
 *
 * @returns {boolean}
 */
M.startRefresh = function () {
  if (M.status !== "ready" || M.isRefreshing) {
    return false;
  }
  M.isRefreshing = true;
  M.refreshMessage = null;
  M.loadError = null;
  return true;
};

/**
 * Termine une actualisation et prépare l'annonce.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.finishRefresh = function () {
  M.isRefreshing = false;
  M.refreshMessage = M.loadError === null && M.status === "ready" ? "Données actualisées." : null;
};

/**
 * Les quatre indicateurs en tête de page.
 * . aucun paramètre
 * > [{ libelle, valeur, detail }]
 *
 * @returns {Array<Object>}
 */
M.getIndicators = function () {
  let orders = M.stats.commandes;
  let revenue = M.stats.revenus;
  let alerts = M.stats.alertesStock;
  let soldOut = alerts.filter(function (alert) {
    return alert.stock <= 0;
  }).length;

  return [
    {
      libelle: "Réservations",
      valeur: String(orders.total),
      detail: `dont ${orders.parStatut["en cours"] ?? 0} en cours`,
    },
    {
      libelle: "Revenus sur 7 jours",
      valeur: formatPrice(revenue.total),
      detail: `${revenue.nombre} réservation${revenue.nombre > 1 ? "s" : ""} retirée${revenue.nombre > 1 ? "s" : ""}`,
    },
    {
      libelle: "Montant réservé",
      valeur: formatPrice(orders.montantReserve),
      detail: "hors annulations",
    },
    {
      libelle: "Alertes de stock",
      valeur: String(alerts.length),
      detail: soldOut === 0 ? "aucune épuisée" : `dont ${soldOut} épuisée${soldOut > 1 ? "s" : ""}`,
    },
  ];
};

/**
 * Les 7 jours du graphique : hauteur de la colonne (en % du meilleur jour).
 * . aucun paramètre
 * > [{ jour, libelle, hauteur, total, nombre }]
 *
 * @returns {Array<Object>}
 */
M.getRevenueDays = function () {
  let days = M.stats.revenus.jours;
  let best = days.reduce(function (max, day) {
    return Math.max(max, day.total);
  }, 0);

  return days.map(function (day) {
    return {
      jour: day.jour,
      libelle: formatDay(day.jour),
      hauteur: best === 0 ? 0 : Math.round((day.total / best) * 100),
      total: day.total,
      nombre: day.nombre,
    };
  });
};

/**
 * Les barres de l'histogramme des stocks : largeur en % du plus gros stock.
 * . aucun paramètre
 * > [{ nom, stock, largeur, disponibilite }]
 *
 * @returns {Array<Object>}
 */
M.getStockBars = function () {
  let stocks = M.stats.stocks;
  let best = stocks.reduce(function (max, item) {
    return Math.max(max, item.stock);
  }, 0);

  return stocks.map(function (item) {
    return {
      nom: item.nom,
      stock: item.stock,
      largeur: best === 0 ? 0 : Math.round((item.stock / best) * 100),
      disponibilite: item.disponibilite,
    };
  });
};

/**
 * Phrase qui résume les alertes de stock.
 * . aucun paramètre
 * > chaîne
 *
 * @returns {string}
 */
M.formatAlertSummary = function () {
  let alerts = M.stats.alertesStock;

  if (alerts.length === 0) {
    return "Aucune alerte : tous les stocks sont suffisants.";
  }

  let soldOut = alerts.filter(function (alert) {
    return alert.stock <= 0;
  }).length;
  let text = `${alerts.length} combinaison${alerts.length > 1 ? "s" : ""} à surveiller`;
  return soldOut === 0 ? `${text}.` : `${text}, dont ${soldOut} épuisée${soldOut > 1 ? "s" : ""}.`;
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { status, loadError, isRefreshing, refreshMessage, generatedAt, indicators, revenueDays,
 *     revenueSummary, statuses, orderTotal, reservedAmount, top, alerts, alertSummary, stockBars }
 *
 * @returns {Object}
 */
M.getState = function () {
  let state = {
    status: M.status,
    loadError: M.loadError,
    isRefreshing: M.isRefreshing,
    refreshMessage: M.refreshMessage,
    generatedAt: null,
  };

  if (M.stats === null) {
    return state;
  }

  return Object.assign(state, {
    generatedAt: M.stats.genereLe,
    indicators: M.getIndicators(),
    revenueDays: M.getRevenueDays(),
    statuses: Object.keys(M.stats.commandes.parStatut).map(function (status) {
      return { status: status, nombre: M.stats.commandes.parStatut[status] };
    }),
    orderTotal: M.stats.commandes.total,
    reservedAmount: M.stats.commandes.montantReserve,
    top: M.stats.produitsLesPlusVendus,
    alerts: M.stats.alertesStock,
    alertSummary: M.formatAlertSummary(),
    stockBars: M.getStockBars(),
  });
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge les statistiques puis affiche l'écran correspondant.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadStats = async function () {
  if (await M.fetchStats()) {
    V.renderPage(M.getState());
  }
};

/**
 * Clic sur « Actualiser » : relit la base, remplace les chiffres et annonce
 * le résultat. Les données déjà affichées restent visibles pendant l'attente.
 * . ev : événement click, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {MouseEvent} ev
 * @returns {Promise<void>}
 */
C.handler_clickOnRefresh = async function (ev) {
  if (ev.target.closest('[data-action="actualiser"]') === null || !M.startRefresh()) {
    return;
  }

  V.renderPage(M.getState());

  if (await M.fetchStats()) {
    M.finishRefresh();
    V.renderPage(M.getState());
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
  C.loadStats();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée

/**
 * Crée la structure de la page, mémorise sa racine et y délègue le clic sur
 * « Actualiser ».
 * . aucun paramètre
 * > DocumentFragment de la page
 *
 * @returns {DocumentFragment}
 */
V.init = function () {
  let fragment = htmlToFragment(
    genericRenderer(template, { urlBackOffice: routeUrl("/admin"), urlExport: AdminStatsData.exportUrl() })
  );
  V.root = fragment.firstElementChild;
  V.root.addEventListener("click", C.handler_clickOnRefresh);
  return fragment;
};

/**
 * Indicateurs en tête de page.
 * . indicators : tableau renvoyé par M.getIndicators()
 * > DocumentFragment
 *
 * @param {Array<Object>} indicators
 * @returns {DocumentFragment}
 */
V.createIndicatorsFragment = function (indicators) {
  let fragment = new DocumentFragment();

  for (let i = 0; i < indicators.length; i++) {
    fragment.append(htmlToFragment(genericRenderer(templateIndicator, indicators[i])));
  }
  return fragment;
};

/**
 * Revenus des 7 jours : colonnes (décoratives) et liste des valeurs.
 * . days : tableau renvoyé par M.getRevenueDays()
 * > DocumentFragment
 *
 * @param {Array<Object>} days
 * @returns {DocumentFragment}
 */
V.createRevenueFragment = function (days) {
  let fragment = htmlToFragment(templateRevenue);

  let columns = days.map(function (day) {
    return htmlToFragment(
      genericRenderer(templateColumn, { hauteur: day.hauteur, jour: day.libelle })
    );
  });
  let values = days.map(function (day) {
    return htmlToFragment(
      genericRenderer(templateDayValue, {
        jour: day.libelle,
        total: formatPrice(day.total),
        nombre: `${day.nombre} retrait${day.nombre > 1 ? "s" : ""}`,
      })
    );
  });

  fragment.querySelector('slot[name="colonnes"]').replaceWith(...columns);
  fragment.querySelector('slot[name="valeurs"]').replaceWith(...values);
  return fragment;
};

/**
 * Réservations par statut, chaque statut menant à la liste filtrée.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createStatusesFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateStatuses, { total: state.orderTotal, montant: formatPrice(state.reservedAmount) })
  );

  let items = state.statuses.map(function (item) {
    let element = htmlToFragment(
      genericRenderer(templateStatus, {
        href: routeUrl(`/admin/commandes?statut=${encodeURIComponent(item.status)}`),
        nombre: item.nombre,
      })
    );
    element.querySelector('slot[name="badge"]').replaceWith(StatusBadgeView.dom(item.status));
    return element;
  });
  fragment.querySelector('slot[name="statuts"]').replaceWith(...items);
  return fragment;
};

/**
 * Classement des bijoux les plus réservés.
 * . top : tableau de produitsLesPlusVendus
 * > DocumentFragment
 *
 * @param {Array<Object>} top
 * @returns {DocumentFragment}
 */
V.createProductsFragment = function (top) {
  let fragment = htmlToFragment(templateProducts);
  let content = null;

  if (top.length === 0) {
    content = htmlToFragment(templateNoProducts);
  } else {
    content = htmlToFragment(templateRanking);
    let list = content.querySelector("ol");
    for (let i = 0; i < top.length; i++) {
      list.append(
        htmlToFragment(
          genericRenderer(templateProduct, {
            rang: i + 1,
            nom: top[i].nom,
            quantite: `${top[i].quantite} ex.`,
            montant: formatPrice(top[i].montant),
          })
        )
      );
    }
  }

  fragment.querySelector('slot[name="contenu"]').replaceWith(content);
  return fragment;
};

/**
 * Alertes de stock : résumé et une ligne par combinaison à surveiller.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createAlertsFragment = function (state) {
  let hasAlerts = state.alerts.length > 0;
  let fragment = htmlToFragment(
    genericRenderer(templateAlerts, { resume: state.alertSummary, couleur: hasAlerts ? "text-danger" : "text-muted" })
  );
  let slot = fragment.querySelector('slot[name="liste"]');

  if (!hasAlerts) {
    slot.remove();
    return fragment;
  }

  let list = htmlToFragment(templateAlertList);
  for (let i = 0; i < state.alerts.length; i++) {
    let alert = state.alerts[i];
    list.querySelector("ul").append(
      htmlToFragment(
        genericRenderer(templateAlert, {
          produit: alert.produit,
          libelle: alert.libelle === "Modèle unique" ? "" : alert.libelle,
          etat: alert.stock <= 0 ? "Épuisé" : `${alert.stock} en stock`,
          couleur: alert.stock <= 0 ? "text-danger" : "text-muted",
        })
      )
    );
  }
  slot.replaceWith(list);
  return fragment;
};

/**
 * Histogramme des stocks : une barre horizontale par bijou, avec sa valeur écrite.
 * . bars : tableau renvoyé par M.getStockBars()
 * > DocumentFragment
 *
 * @param {Array<Object>} bars
 * @returns {DocumentFragment}
 */
V.createStocksFragment = function (bars) {
  let fragment = htmlToFragment(templateStocks);

  let items = bars.map(function (bar) {
    let tone = STOCK_TONES[bar.disponibilite] ?? STOCK_TONES.en_stock;
    let label = "";
    if (bar.disponibilite === "epuise") {
      label = "épuisé";
    } else if (bar.disponibilite === "stock_faible") {
      label = "faible";
    }

    return htmlToFragment(
      genericRenderer(templateStockBar, {
        nom: bar.nom,
        largeur: bar.largeur,
        stock: bar.stock,
        etat: label,
        couleur: tone.fill,
        couleurTexte: tone.text,
      })
    );
  });

  fragment.querySelector('slot[name="barres"]').replaceWith(...items);
  return fragment;
};

/**
 * Tableau de bord complet.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createBoardFragment = function (state) {
  let fragment = htmlToFragment(templateBoard);

  fragment.querySelector('[data-zone="indicateurs"]').replaceChildren(V.createIndicatorsFragment(state.indicators));
  fragment.querySelector('slot[name="revenus"]').replaceWith(V.createRevenueFragment(state.revenueDays));
  fragment.querySelector('slot[name="statuts"]').replaceWith(V.createStatusesFragment(state));
  fragment.querySelector('slot[name="produits"]').replaceWith(V.createProductsFragment(state.top));
  fragment.querySelector('slot[name="alertes"]').replaceWith(V.createAlertsFragment(state));
  fragment.querySelector('slot[name="stocks"]').replaceWith(V.createStocksFragment(state.stockBars));
  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, erreur ou tableau.
 * Une actualisation qui échoue garde le tableau et ajoute le message d'erreur.
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

  let fragment = V.createBoardFragment(state);
  if (state.loadError !== null) {
    fragment.prepend(htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError })));
  }
  return fragment;
};

/**
 * Remplace le contenu de la page par celui qui correspond à l'état reçu, puis
 * met à jour l'heure des données et le bouton « Actualiser ».
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderPage = function (state) {
  let zone = V.root.querySelector('[data-zone="contenu"]');
  zone.setAttribute("aria-busy", String(state.status === "loading" || state.isRefreshing));
  zone.replaceChildren(V.createContentFragment(state));

  let update = V.root.querySelector('[data-zone="maj"]');
  if (state.isRefreshing) {
    update.textContent = "Actualisation…";
  } else if (state.generatedAt !== null) {
    let prefix = state.refreshMessage === null ? "" : `${state.refreshMessage} `;
    update.textContent = `${prefix}Données au ${formatDate(state.generatedAt)}.`;
  } else {
    update.textContent = "";
  }

  let button = V.root.querySelector('[data-action="actualiser"]');
  if (state.status === "ready" && !state.isRefreshing) {
    button.removeAttribute("aria-disabled");
  } else {
    button.setAttribute("aria-disabled", "true");
  }
};

/**
 * Page appelée par le routeur sur la route « /admin/statistiques ».
 *
 * @returns {DocumentFragment}
 */
export function AdminStatsPage() {
  return C.init();
}
