import { htmlToFragment } from "../../lib/utils.js";
import { ProductCardView } from "../carte-produit/index.js";
import template from "./template.html?raw";
import templateEmpty from "./vide.html?raw";

// Grille du catalogue. Elle compose un autre composant, ProductCardView : les
// cartes prennent la place du <slot name="cartes">.
let ProductGridView = {
  /**
   * Construit la grille des bijoux reçus, ou l'état vide s'il n'y en a aucun.
   *
   * @param {Array<Object>} products - Bijoux renvoyés par GET /api/produits.
   * @returns {DocumentFragment}
   */
  dom: function (products) {
    if (products.length === 0) {
      return htmlToFragment(templateEmpty);
    }

    let fragment = htmlToFragment(template);
    let cards = products.map(function (product) {
      return ProductCardView.dom(product);
    });
    fragment.querySelector('slot[name="cartes"]').replaceWith(...cards);
    return fragment;
  },
};

export { ProductGridView };
