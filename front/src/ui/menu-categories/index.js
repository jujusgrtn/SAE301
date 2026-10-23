import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateVertical from "./template-vertical.html?raw";
import templateLink from "./lien.html?raw";
import templatePanel from "./panneau.html?raw";
import templateColumn from "./colonne.html?raw";
import templatePanelLink from "./lien-panneau.html?raw";
import templateVerticalLink from "./lien-vertical.html?raw";
import templateUnavailable from "./indisponible.html?raw";

// Menu des catégories principales, affiché dans l'en-tête : à l'horizontale sur
// desktop, en liste verticale dans le menu mobile.
// Les catégories sont celles de GET /api/categories : [{ nom, slug, sousCategories }]
//
// Sur desktop, chaque catégorie ouvre un panneau au survol et au focus clavier,
// avec deux colonnes : « Prix » (tranches du catalogue) et « Matière » (les
// sous-catégories, qui sont des matières : plaqué or, acier…).
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
   * Une colonne du panneau : un titre et une liste de liens.
   *
   * @param {string} title - « Prix » ou « Matière ».
   * @param {Array<{href: string, libelle: string, isFilter: boolean}>} links - Liens de la colonne.
   * @returns {DocumentFragment}
   */
  createColumn: function (title, links) {
    let fragment = htmlToFragment(genericRenderer(templateColumn, { titre: title }));
    let items = links.map(function (link) {
      let item = htmlToFragment(genericRenderer(templatePanelLink, { href: link.href, libelle: link.libelle }));

      if (link.isFilter) {
        // Un filtre mène à la page de la catégorie : il n'est pas la « page courante ».
        item.querySelector("a").setAttribute("data-no-current", "");
      }
      return item;
    });

    fragment.querySelector('slot[name="liens"]').replaceWith(...items);
    return fragment;
  },

  /**
   * Le panneau d'une catégorie : colonne « Prix », puis « Matière » si elle a des sous-catégories.
   *
   * @param {Object} category - Catégorie principale, avec ses sous-catégories.
   * @param {Array<{valeur: string, libelle: string}>} priceLinks - Tranches de prix proposées.
   * @returns {DocumentFragment}
   */
  createPanel: function (category, priceLinks) {
    let fragment = htmlToFragment(templatePanel);
    let columns = [];
    let categoryUrl = routeUrl(`/categorie/${encodeURIComponent(category.slug)}`);

    if (priceLinks.length > 0) {
      columns.push(
        CategoryMenuView.createColumn(
          "Prix",
          priceLinks.map(function (price) {
            return { href: `${categoryUrl}?prix=${encodeURIComponent(price.valeur)}`, libelle: price.libelle, isFilter: true };
          })
        )
      );
    }
    if (category.sousCategories.length > 0) {
      columns.push(
        CategoryMenuView.createColumn(
          "Matière",
          category.sousCategories.map(function (sub) {
            return { href: routeUrl(`/categorie/${encodeURIComponent(sub.slug)}`), libelle: sub.nom, isFilter: false };
          })
        )
      );
    }

    fragment.querySelector('slot[name="colonnes"]').replaceWith(...columns);
    return fragment;
  },

  /**
   * Échap referme le panneau ouvert et rend le focus au lien de la catégorie ;
   * le panneau se rouvre dès que la souris ou le focus quitte la catégorie puis y revient.
   *
   * @param {HTMLElement} nav - Le menu.
   * @returns {void}
   */
  listen: function (nav) {
    nav.addEventListener("keydown", function (ev) {
      let item = ev.target.closest("li[data-item]");

      if (ev.key !== "Escape" || item === null) {
        return;
      }
      item.dataset.ferme = "true";
      item.querySelector("a").focus();
    });

    let reopen = function (ev) {
      let item = ev.target.closest("li[data-item]");

      if (item !== null && !item.contains(ev.relatedTarget)) {
        delete item.dataset.ferme;
      }
    };
    nav.addEventListener("focusout", reopen);
    nav.addEventListener("mouseout", reopen);
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
   * @param {Array<{valeur: string, libelle: string}>} [priceLinks] - Tranches de prix du panneau (desktop).
   * @returns {DocumentFragment}
   */
  dom: function (categories, currentPathname, isVertical = false, priceLinks = []) {
    if (categories === null) {
      return htmlToFragment(templateUnavailable);
    }

    let fragment = htmlToFragment(isVertical ? templateVertical : template);
    let links = categories.map(function (category) {
      let link = htmlToFragment(CategoryMenuView.formatOneLink(category, isVertical));

      if (!isVertical) {
        link.querySelector('slot[name="panneau"]').replaceWith(CategoryMenuView.createPanel(category, priceLinks));
      }
      return link;
    });
    fragment.querySelector('slot[name="liens"]').replaceWith(...links);

    let anchors = fragment.querySelectorAll("a[data-link]:not([data-no-current])");
    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i].pathname === currentPathname) {
        anchors[i].setAttribute("aria-current", "page");
      }
    }

    if (!isVertical) {
      CategoryMenuView.listen(fragment.querySelector("nav"));
    }

    return fragment;
  },
};

export { CategoryMenuView };
