import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Pastille jaune du nombre d'articles, à côté du lien « Panier ».
// Le texte masqué complète le nom du lien pour les lecteurs d'écran :
// « Panier 3 articles ».
let CartBadgeView = {
  /**
   * Remplit le template de la pastille.
   *
   * @param {number} count - Nombre d'articles, au moins 1.
   * @returns {string} - Le HTML de la pastille.
   */
  html: function (count) {
    return genericRenderer(template, {
      nombre: count,
      unite: count > 1 ? "articles" : "article",
    });
  },

  /**
   * Construit la pastille ; rien pour un panier vide ou inconnu.
   *
   * @param {number|null} count - Nombre d'articles, ou null s'il n'est pas connu.
   * @returns {DocumentFragment}
   */
  dom: function (count) {
    if (count === null || count === 0) {
      return new DocumentFragment();
    }
    return htmlToFragment(CartBadgeView.html(count));
  },
};

export { CartBadgeView };
