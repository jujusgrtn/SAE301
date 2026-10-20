import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateFilter from "./filtre.html?raw";

// Filtres d'une catégorie : « Tout », puis une pastille par sous-catégorie.
let SubCategoriesView = {
  /**
   * Remplit le template d'une pastille.
   *
   * @param {string} label - Texte de la pastille.
   * @param {string} slug - Slug de la catégorie visée.
   * @returns {string} - Le HTML de la pastille.
   */
  formatOneFilter: function (label, slug) {
    return genericRenderer(templateFilter, {
      href: routeUrl(`/categorie/${encodeURIComponent(slug)}`),
      nom: label,
    });
  },

  /**
   * Construit la liste des filtres et marque celui de la page affichée.
   *
   * @param {{mainCategory: {nom: string, slug: string}, subCategories: Array<{nom: string, slug: string}>, currentSlug: string}} data
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    let fragment = htmlToFragment(template);

    let filters = [SubCategoriesView.formatOneFilter("Tout", data.mainCategory.slug)];
    let subFilters = data.subCategories.map(function (subCategory) {
      return SubCategoriesView.formatOneFilter(subCategory.nom, subCategory.slug);
    });
    let items = filters.concat(subFilters).map(function (html) {
      return htmlToFragment(html);
    });
    fragment.querySelector('slot[name="filtres"]').replaceWith(...items);

    let current = routeUrl(`/categorie/${encodeURIComponent(data.currentSlug)}`);
    let anchors = fragment.querySelectorAll("a[data-link]");
    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i].getAttribute("href") === current) {
        anchors[i].setAttribute("aria-current", "page");
      }
    }

    return fragment;
  },
};

export { SubCategoriesView };
