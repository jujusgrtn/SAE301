import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import logo from "../../assets/design/logo-blanc.svg";
import template from "./template.html?raw";

// Pied de page du site : boutique, click & collect, informations. Les pages
// « conditions générales », « mentions légales » et « contact » n'existent pas
// encore : ces libellés sont du texte, pas des liens vers une page absente.
let FooterView = {
  /**
   * @returns {string} Le HTML du pied de page.
   */
  html: function () {
    return genericRenderer(template, { logo: logo, annee: new Date().getFullYear() });
  },

  /**
   * @returns {DocumentFragment}
   */
  dom: function () {
    return htmlToFragment(FooterView.html());
  },
};

export { FooterView };
