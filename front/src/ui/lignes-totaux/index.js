import { formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Lignes « Sous-total » et « Code … : −X » à placer au-dessus du total d'une
// réservation ou d'un panier (US PRO-a). Sans réduction, le composant ne produit
// rien : le total seul suffit.
let TotalsView = {
  /**
   * @param {{sousTotal: number, reduction: number, codePromo: string|null, pourcentagePromo: number|null}} data
   *        Montants en XPF ; le sous-total est le total avant réduction.
   * @returns {DocumentFragment} Les deux lignes, ou un fragment vide s'il n'y a pas de réduction.
   */
  dom: function (data) {
    if (data.reduction <= 0 || data.codePromo === null) {
      return new DocumentFragment();
    }

    return htmlToFragment(
      genericRenderer(template, {
        sousTotal: formatPrice(data.sousTotal),
        code: data.codePromo,
        pourcentage: `−${data.pourcentagePromo} %`,
        reduction: `−${formatPrice(data.reduction)}`,
      })
    );
  },
};

export { TotalsView };
