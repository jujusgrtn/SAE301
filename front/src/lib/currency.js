/**
 * Monnaie d'affichage des prix. La base et l'API ne connaissent que le franc
 * pacifique (XPF) : la conversion n'est qu'un confort de lecture, le règlement
 * se fait toujours en XPF au retrait. Le choix est gardé dans le navigateur.
 */

/** Événement émis sur document quand la personne change de monnaie. */
export const CURRENCY_CHANGED_EVENT = "currency:changed";

const STORAGE_KEY = "matira-monnaie";

/**
 * Monnaies proposées. `xpfPerUnit` : combien de XPF vaut une unité.
 * L'euro est rattaché au franc pacifique par une parité fixe (1 € = 119,332 XPF) ;
 * le dollar flotte, son taux ci-dessous est une valeur approchée à réviser.
 */
export const CURRENCIES = {
  XPF: { code: "XPF", libelle: "XPF (franc pacifique)", xpfPerUnit: 1 },
  EUR: { code: "EUR", libelle: "EUR (euro)", xpfPerUnit: 119.332 },
  USD: { code: "USD", libelle: "USD (dollar)", xpfPerUnit: 102 },
};

/**
 * Lit la monnaie mémorisée ; XPF si rien n'est mémorisé ou si le stockage est refusé.
 *
 * @returns {string} « XPF », « EUR » ou « USD ».
 */
function readStoredCode() {
  try {
    let code = window.localStorage.getItem(STORAGE_KEY);
    return Object.keys(CURRENCIES).includes(code) ? code : "XPF";
  } catch (error) {
    return "XPF";
  }
}

/**
 * Le back-office travaille toujours en XPF : on y saisit et contrôle les prix réels.
 *
 * @returns {boolean} Vrai si la page affichée est une page d'administration.
 */
export function isCurrencyLocked() {
  return /\/admin(\/|$)/.test(window.location.pathname);
}

/**
 * Monnaie en vigueur pour la page affichée.
 *
 * @returns {string} « XPF », « EUR » ou « USD ».
 */
export function getCurrency() {
  return isCurrencyLocked() ? "XPF" : readStoredCode();
}

/**
 * Mémorise la monnaie choisie ; un code inconnu est ignoré.
 *
 * @param {string} code - « XPF », « EUR » ou « USD ».
 * @returns {void}
 */
export function setCurrency(code) {
  if (!Object.keys(CURRENCIES).includes(code)) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch (error) {
    // Stockage refusé : le choix ne durera que jusqu'au rechargement.
  }
}

/**
 * Écrit un montant dans la monnaie en vigueur.
 * 14900 -> « 14 900 XPF » ; en euro « 124,86 € » ; en dollar « 146,08 $ ».
 * Les espaces sont insécables : le montant ne se coupe jamais en fin de ligne.
 *
 * @param {number} amount - Montant entier en XPF.
 * @param {boolean} whole - Vrai pour arrondir à l'unité (bornes de filtre).
 * @returns {string}
 */
export function formatAmount(amount, whole) {
  let code = getCurrency();

  if (code === "XPF") {
    let digits = String(Math.round(Number(amount)));
    return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")} XPF`;
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: code,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(Number(amount) / CURRENCIES[code].xpfPerUnit);
}
