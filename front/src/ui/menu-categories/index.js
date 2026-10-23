import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateVertical from "./template-vertical.html?raw";
import templateLink from "./lien.html?raw";
import templateVerticalLink from "./lien-vertical.html?raw";
import templateUnavailable from "./indisponible.html?raw";

// Menu des catégories principales, affiché dans l'en-tête : à l'horizontale sur
// desktop, en liste verticale dans le menu mobile.
// Les catégories sont celles de GET /api/categories : [{ nom, slug, sousCategories }]
let CategoryMenuView = {
  /**
   * Remplit le template d'un lien du menu.
   *
   * @param {{nom: string, slug: string}} category - Une catégorie principale.
   * @param {boolean} isVertical - Vrai pour le menu mobile.
   * @returns {string} - Le HTML du lien.
   */
  formatOneLink: function (category, isVertical) {
    return genericRenderer(isVertical ? templateVerticalLink : templateLink, {
      href: routeUrl(`/categorie/${encodeURIComponent(category.slug)}`),
      nom: category.nom,
    });
  },

  /**
   * Construit le menu, ou un message s'il n'a pas pu être chargé.
   *
   * aria-current est posé ici, car le menu peut arriver après le passage du
   * routeur, qui ne marque que les liens présents lors de l'affichage.
   *
   * @param {Array<Object>|null} categories - Catégories du menu, ou null en cas d'erreur.
   * @param {string} currentPathname - Adresse de la page affichée (location.pathname).
   * @param {boolean} [isVertical] - Vrai pour la liste verticale du menu mobile.
   * @returns {DocumentFragment}
   */
  dom: function (categories, currentPathname, isVertical = false) {
    if (categories === null) {
      return htmlToFragment(templateUnavailable);
    }

    let fragment = htmlToFragment(isVertical ? templateVertical : template);
    let links = categories.map(function (category) {
      return htmlToFragment(CategoryMenuView.formatOneLink(category, isVertical));
    });
    fragment.querySelector('slot[name="liens"]').replaceWith(...links);

    let anchors = fragment.querySelectorAll("a[data-link]");
    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i].pathname === currentPathname) {
        anchors[i].setAttribute("aria-current", "page");
      }
    }

    return fragment;
  },
};

export { CategoryMenuView };
