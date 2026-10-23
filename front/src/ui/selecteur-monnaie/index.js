import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";

// Choix de la monnaie d'affichage des prix. Le composant reçoit les monnaies et
// la monnaie courante, et signale le choix par un callback : il ne mémorise rien.
let CurrencySelectView = {
  /**
   * @param {{currencies: Array<{code: string, libelle: string}>, current: string, visibleLabel: boolean}} data
   *        Monnaies proposées, code de la monnaie courante, et vrai pour afficher le mot « Monnaie »
   *        (sinon réservé aux lecteurs d'écran).
   * @param {function(string): void} onChange - Reçoit le code choisi.
   * @returns {DocumentFragment}
   */
  dom: function (data, onChange) {
    let fragment = htmlToFragment(genericRenderer(template, { classeLibelle: data.visibleLabel ? "" : "sr-only" }));
    let select = fragment.querySelector("select");

    // Les <option> sont créées ici : un <slot> placé dans un <select> serait supprimé par le parseur HTML.
    select.replaceChildren(
      ...data.currencies.map(function (currency) {
        let option = document.createElement("option");
        option.value = currency.code;
        option.textContent = currency.libelle;
        return option;
      })
    );
    select.value = data.current;
    select.addEventListener("change", function () {
      onChange(select.value);
    });

    return fragment;
  },
};

export { CurrencySelectView };
