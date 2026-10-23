import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import { ProductCardView } from "../carte-produit/index.js";
import iconCheck from "../../assets/design/icone-check.svg";
import template from "./template.html?raw";
import templateFilterGroup from "./filtre-groupe.html?raw";
import templateCheckbox from "./case.html?raw";
import templateChips from "./puces.html?raw";
import templateChip from "./puce.html?raw";
import templateSortOption from "./option-tri.html?raw";
import templatePagination from "./pagination.html?raw";
import templatePageChip from "./page-puce.html?raw";
import templateEmpty from "./vide.html?raw";
import templateList from "./liste.html?raw";

// Liste filtrable du catalogue : filtres en colonne (desktop) ou en pastilles
// (mobile), tri, cartes et pagination. Le composant reçoit l'état déjà calculé
// et signale chaque action par un callback : il ne filtre ni ne trie lui-même.
//
// state : {
//   total: texte « 21 bijoux »,
//   groupTitle, groups: [{ valeur, libelle, checked }],
//   availabilities: [...], prices: [...] (même forme),
//   sorts: [{ valeur, libelle }], sort,
//   items: bijoux de la page, page, pages
// }
// actions : { onToggle(filtre, valeur, coche), onSort(valeur), onPage(numero), onReset() }
let CatalogueView = {
  /**
   * Une case à cocher du bloc de filtres.
   *
   * @param {string} filter - « groupe », « dispo » ou « prix ».
   * @param {{valeur: string, libelle: string, checked: boolean}} item
   * @returns {DocumentFragment}
   */
  createCheckbox: function (filter, item) {
    let fragment = htmlToFragment(
      genericRenderer(templateCheckbox, { filtre: filter, valeur: item.valeur, libelle: item.libelle, iconeCheck: iconCheck })
    );
    fragment.querySelector("input").checked = item.checked;
    return fragment;
  },

  /**
   * Un bloc de filtres (Catégorie, Disponibilité, Prix).
   *
   * @param {string} title - Titre du bloc.
   * @param {string} filter - Nom du filtre.
   * @param {Array<Object>} items - Cases à cocher.
   * @returns {DocumentFragment}
   */
  createFilterGroup: function (title, filter, items) {
    let fragment = htmlToFragment(genericRenderer(templateFilterGroup, { titre: title }));
    let boxes = items.map(function (item) {
      return CatalogueView.createCheckbox(filter, item);
    });

    fragment.querySelector('slot[name="cases"]').replaceWith(...boxes);
    return fragment;
  },

  /**
   * Les pastilles de catégories (mobile).
   *
   * @param {string} title - Titre accessible du groupe.
   * @param {Array<Object>} groups
   * @returns {DocumentFragment}
   */
  createChips: function (title, groups) {
    let fragment = htmlToFragment(genericRenderer(templateChips, { titre: title }));
    let chips = groups.map(function (group) {
      return htmlToFragment(
        genericRenderer(templateChip, { valeur: group.valeur, libelle: group.libelle, presse: String(group.checked) })
      );
    });

    fragment.querySelector('slot[name="puces"]').replaceWith(...chips);
    return fragment;
  },

  /**
   * La pagination : un bouton par page, plus « Suivant ».
   *
   * @param {number} page - Page affichée.
   * @param {number} pages - Nombre de pages.
   * @returns {DocumentFragment}
   */
  createPagination: function (page, pages) {
    if (pages <= 1) {
      return new DocumentFragment();
    }

    let fragment = htmlToFragment(templatePagination);
    let chips = [];

    for (let number = 1; number <= pages; number++) {
      chips.push(
        htmlToFragment(
          genericRenderer(templatePageChip, {
            valeur: number,
            libelle: number,
            etiquette: `Page ${number}`,
            courante: number === page ? 'aria-current="page"' : "",
          })
        )
      );
    }
    if (page < pages) {
      chips.push(
        htmlToFragment(
          genericRenderer(templatePageChip, { valeur: page + 1, libelle: "Suivant", etiquette: "Page suivante", courante: "" })
        )
      );
    }

    fragment.querySelector('slot[name="pages"]').replaceWith(...chips);
    return fragment;
  },

  /**
   * Construit la liste complète et branche ses actions.
   *
   * @param {Object} state - Voir le commentaire du composant.
   * @param {Object} actions - Callbacks.
   * @returns {DocumentFragment}
   */
  dom: function (state, actions) {
    let fragment = htmlToFragment(genericRenderer(template, { total: state.total }));

    let filters = new DocumentFragment();
    if (state.groups.length > 0) {
      filters.append(CatalogueView.createFilterGroup(state.groupTitle, "groupe", state.groups));
    }
    filters.append(CatalogueView.createFilterGroup("Disponibilité", "dispo", state.availabilities));
    filters.append(CatalogueView.createFilterGroup("Prix", "prix", state.prices));
    fragment.querySelector('slot[name="filtres"]').replaceWith(filters);

    let chipsSlot = fragment.querySelector('slot[name="puces"]');
    if (state.groups.length > 0) {
      chipsSlot.replaceWith(CatalogueView.createChips(state.groupTitle, state.groups));
    } else {
      chipsSlot.parentElement.remove();
    }

    let select = fragment.querySelector('select[data-filter="tri"]');
    select.replaceChildren(
      ...state.sorts.map(function (sort) {
        return htmlToFragment(genericRenderer(templateSortOption, sort));
      })
    );
    select.value = state.sort;

    let listSlot = fragment.querySelector('slot[name="liste"]');
    if (state.items.length === 0) {
      listSlot.replaceWith(htmlToFragment(templateEmpty));
    } else {
      let list = htmlToFragment(templateList);
      let cards = state.items.map(function (product) {
        let item = document.createElement("li");
        item.append(ProductCardView.dom(product));
        return item;
      });
      list.querySelector('slot[name="cartes"]').replaceWith(...cards);
      listSlot.replaceWith(list);
    }

    fragment.querySelector('slot[name="pagination"]').replaceWith(CatalogueView.createPagination(state.page, state.pages));

    // Une seule écoute, sur le composant entier : les cases, pastilles et boutons sont recréés à chaque rendu.
    let root = fragment.firstElementChild;
    root.addEventListener("change", function (ev) {
      let control = ev.target.closest("[data-filter]");

      if (control === null) {
        return;
      }
      if (control.dataset.filter === "tri") {
        actions.onSort(control.value);
      } else if (control.type === "checkbox") {
        actions.onToggle(control.dataset.filter, control.dataset.value, control.checked);
      }
    });
    root.addEventListener("click", function (ev) {
      let control = ev.target.closest("button[data-filter]");

      if (control === null) {
        return;
      }
      if (control.dataset.filter === "groupe") {
        actions.onToggle("groupe", control.dataset.value, control.getAttribute("aria-pressed") !== "true");
      } else if (control.dataset.filter === "page") {
        actions.onPage(Number(control.dataset.value));
      } else if (control.dataset.filter === "reinitialiser") {
        actions.onReset();
      }
    });

    return fragment;
  },
};

export { CatalogueView };
