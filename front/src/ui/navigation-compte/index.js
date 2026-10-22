import { htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Navigation de l'espace personnel du client. Les liens sont des liens
// `data-link` : le routeur y pose lui-même l'adresse complète et
// aria-current="page" sur la page affichée.
let AccountNavigationView = {
  /**
   * @returns {string} Le HTML de la navigation.
   */
  html: function () {
    return template;
  },

  /**
   * @returns {DocumentFragment}
   */
  dom: function () {
    return htmlToFragment(AccountNavigationView.html());
  },
};

export { AccountNavigationView };
