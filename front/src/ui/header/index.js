import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import iconAccount from "../../assets/design/icone-compte.svg";
import iconBag from "../../assets/design/icone-panier.svg";
import iconMenu from "../../assets/design/icone-menu.svg";
import logo from "../../assets/design/logo-turquoise.svg";
import template from "./template.html?raw";

// En-tête du site : bandeau, logo, catégories, compte et panier. Les catégories,
// le libellé du compte et le compteur du panier sont posés ensuite par le
// layout. Sur mobile, les catégories s'ouvrent dans un panneau : le bouton de
// l'en-tête est le seul comportement propre à ce composant.
let HeaderView = {
  /**
   * @returns {string} Le HTML de l'en-tête.
   */
  html: function () {
    return genericRenderer(template, {
      logo: logo,
      iconeMenu: iconMenu,
      iconeCompte: iconAccount,
      iconePanier: iconBag,
    });
  },

  /**
   * Construit l'en-tête et branche l'ouverture du menu mobile.
   *
   * @returns {DocumentFragment}
   */
  dom: function () {
    let fragment = htmlToFragment(HeaderView.html());
    let button = fragment.querySelector('[data-action="menu"]');
    let panel = fragment.querySelector("#menu-mobile");

    button.addEventListener("click", function () {
      let isOpen = button.getAttribute("aria-expanded") === "true";

      button.setAttribute("aria-expanded", String(!isOpen));
      button.setAttribute("aria-label", isOpen ? "Ouvrir le menu" : "Fermer le menu");
      panel.hidden = isOpen;
    });

    return fragment;
  },
};

export { HeaderView };
