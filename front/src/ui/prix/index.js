import { formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Prix d'un bijou (US PRO-c). Sans promotion, le prix seul. En promotion, le prix
// initial barré, le prix à payer et le pourcentage de réduction ; les lecteurs
// d'écran entendent « prix initial … prix promotionnel … » (la barre et la couleur ne
// portent pas l'information à elles seules).
let PriceView = {
  /**
   * Pourcentage de réduction entre deux prix, arrondi.
   *
   * @param {number} price - Prix à payer.
   * @param {number} initialPrice - Prix avant promotion.
   * @returns {number}
   */
  getPercentage: function (price, initialPrice) {
    return Math.round((1 - price / initialPrice) * 100);
  },

  /**
   * Construit l'affichage du prix.
   *
   * @param {{prix: number, prixInitial: number|null}} data - Prix à payer, et prix avant promotion (égal ou null sans promotion).
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    if (data.prixInitial === null || data.prixInitial <= data.prix) {
      let fragment = new DocumentFragment();
      fragment.append(document.createTextNode(formatPrice(data.prix)));
      return fragment;
    }

    return htmlToFragment(
      genericRenderer(template, {
        initial: formatPrice(data.prixInitial),
        prix: formatPrice(data.prix),
        pourcentage: `−${PriceView.getPercentage(data.prix, data.prixInitial)} %`,
      })
    );
  },
};

export { PriceView };
