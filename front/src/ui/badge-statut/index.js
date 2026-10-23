import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Les classes sont écrites en entier, et non assemblées : Tailwind ne génère
// que les classes qu'il trouve telles quelles dans le code.
const STATUSES = {
  "en cours": { texte: "En cours", couleurs: "bg-info-soft text-info" },
  disponible: { texte: "Disponible au retrait", couleurs: "bg-success-soft text-success" },
  retirée: { texte: "Retirée", couleurs: "bg-grey-soft text-muted" },
  annulée: { texte: "Annulée", couleurs: "bg-danger-soft text-danger" },
};

// Statut d'une réservation (valeur de commande.statut, renvoyée par l'API).
// Le texte porte l'information : la couleur ne fait que la souligner.
let StatusBadgeView = {
  /**
   * Libellé d'un statut, tel qu'il s'affiche dans le back-office.
   *
   * @param {string} status - « en cours », « disponible », « retirée » ou « annulée ».
   * @returns {string} Le statut lui-même s'il est inconnu.
   */
  formatOneLabel: function (status) {
    return STATUSES[status] === undefined ? status : STATUSES[status].texte;
  },

  /**
   * Remplit le template du badge.
   *
   * @param {string} status - Statut de la réservation.
   * @returns {string} Le HTML du badge.
   */
  html: function (status) {
    return genericRenderer(template, {
      texte: StatusBadgeView.formatOneLabel(status),
      couleurs: STATUSES[status] === undefined ? "bg-grey-soft text-muted" : STATUSES[status].couleurs,
    });
  },

  /**
   * Construit le badge.
   *
   * @param {string} status - Statut de la réservation.
   * @returns {DocumentFragment}
   */
  dom: function (status) {
    return htmlToFragment(StatusBadgeView.html(status));
  },
};

export { StatusBadgeView };
