import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const COLORS = {
  en_stock: "bg-success-soft text-success",
  stock_faible: "bg-warning-soft text-warning",
  epuise: "bg-danger-soft text-danger",
};

// Disponibilité d'un bijou ou d'une variante, telle que la calcule le serveur
// (voir back/src/Model/Stock.php). Le texte porte l'information : la couleur
// ne fait que la souligner.
let StockBadgeView = {
  /**
   * Texte du badge.
   *
   * @param {string} availability - "en_stock" | "stock_faible" | "epuise".
   * @param {number} quantity - Exemplaires en stock.
   * @returns {string}
   */
  formatOneLabel: function (availability, quantity) {
    if (availability === "epuise") {
      return "Épuisé";
    }
    if (availability === "stock_faible") {
      return `Plus que ${quantity} en stock`;
    }
    return "En stock";
  },

  /**
   * Remplit le template du badge.
   *
   * @param {{disponibilite: string, stock: number}} data - Disponibilité renvoyée par l'API.
   * @returns {string} - Le HTML du badge.
   */
  html: function (data) {
    return genericRenderer(template, {
      texte: StockBadgeView.formatOneLabel(data.disponibilite, data.stock),
      couleurs: COLORS[data.disponibilite] ?? COLORS.en_stock,
    });
  },

  /**
   * Construit le badge.
   *
   * @param {{disponibilite: string, stock: number}} data - Disponibilité renvoyée par l'API.
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    return htmlToFragment(StockBadgeView.html(data));
  },
};

export { StockBadgeView };
