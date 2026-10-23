import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Navigation entre les pages d'une liste. Ce sont des liens, et non des
// boutons : chaque page a son adresse (?page=2), qu'on peut copier, rouvrir ou
// atteindre avec le bouton Précédent du navigateur.
let PaginationView = {
  /**
   * Remplit le template.
   *
   * @param {{page: number, pagesTotal: number, hrefPrecedente: string|null, hrefSuivante: string|null}} data
   *        Adresses complètes (avec le chemin du projet) des pages voisines, null s'il n'y en a pas.
   * @returns {string} Le HTML de la navigation.
   */
  html: function (data) {
    return genericRenderer(template, {
      page: data.page,
      pagesTotal: data.pagesTotal,
      hrefPrecedente: data.hrefPrecedente ?? "",
      hrefSuivante: data.hrefSuivante ?? "",
    });
  },

  /**
   * Construit la navigation. Un lien sans page à atteindre perd son adresse :
   * il reste affiché (la mise en page ne bouge pas) mais n'est plus actionnable.
   *
   * @param {{page: number, pagesTotal: number, hrefPrecedente: string|null, hrefSuivante: string|null}} data
   * @returns {DocumentFragment}
   */
  dom: function (data) {
    let fragment = htmlToFragment(PaginationView.html(data));

    PaginationView.disableIfMissing(fragment.querySelector('[data-zone="precedente"]'), data.hrefPrecedente);
    PaginationView.disableIfMissing(fragment.querySelector('[data-zone="suivante"]'), data.hrefSuivante);

    return fragment;
  },

  /**
   * Rend un lien inactif quand il n'a pas de destination.
   *
   * @param {HTMLAnchorElement} link
   * @param {string|null} href
   * @returns {void}
   */
  disableIfMissing: function (link, href) {
    if (href !== null) {
      return;
    }
    link.removeAttribute("href");
    link.removeAttribute("data-link");
    link.setAttribute("role", "link");
    link.setAttribute("aria-disabled", "true");
  },
};

export { PaginationView };
