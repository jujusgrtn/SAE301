import { formatPrice } from "./format.js";

/**
 * Règles des options d'un bijou (US OPT-c, OPT-b, OPT-a), partagées par la
 * fiche produit et le panier. Ce sont des fonctions pures : elles lisent la
 * fiche renvoyée par GET /api/produit
 *
 *   product.options   [{ id, nom, valeurs: [{ id, valeur, supplement }] }]
 *   product.variantes [{ id, libelle, prix, valeurs: [valeurId…], stock }]
 *
 * et une sélection { optionId: valeurId }. Le serveur reste seul juge : ces
 * règles servent à guider le choix, jamais à le valider.
 */

/**
 * Retrouve la variante qui correspond à une combinaison de valeurs : celle
 * dont les valeurs sont exactement les valeurs choisies.
 *
 * @param {Object} product - Fiche du bijou.
 * @param {Object} selected - { optionId: valeurId }.
 * @returns {Object|null} La variante, ou null si cette combinaison n'est pas proposée.
 */
export function findVariant(product, selected) {
  let chosen = Object.values(selected);

  let variant = product.variantes.find(function (candidate) {
    return (
      candidate.valeurs.length === chosen.length &&
      chosen.every(function (valueId) {
        return candidate.valeurs.includes(valueId);
      })
    );
  });
  return variant === undefined ? null : variant;
}

/**
 * La sélection qui décrit une variante : pour chaque option, la valeur de la variante.
 *
 * @param {Object} product - Fiche du bijou.
 * @param {Object|undefined} variant - Variante dont on veut la sélection.
 * @returns {Object} { optionId: valeurId } (vide pour un bijou sans option).
 */
export function getSelection(product, variant) {
  let selected = {};

  if (variant === undefined || variant === null) {
    return selected;
  }

  product.options.forEach(function (option) {
    let value = option.valeurs.find(function (candidate) {
      return variant.valeurs.includes(candidate.id);
    });
    if (value !== undefined) {
      selected[option.id] = value.id;
    }
  });
  return selected;
}

/**
 * Prix d'une sélection : le prix du bijou plus le supplément de chaque valeur
 * choisie. Le serveur applique la même règle (VariantModel::PRICE_SQL).
 *
 * @param {Object} product - Fiche du bijou.
 * @param {Object} selected - { optionId: valeurId }.
 * @returns {number} Prix en XPF.
 */
export function getPrice(product, selected) {
  let price = product.prix;

  product.options.forEach(function (option) {
    let value = option.valeurs.find(function (candidate) {
      return candidate.id === selected[option.id];
    });
    if (value !== undefined) {
      price += value.supplement;
    }
  });
  return price;
}

/**
 * Disponibilité de chaque valeur, selon les autres choix en cours : la
 * combinaison obtenue en choisissant cette valeur existe-t-elle, a-t-elle du stock ?
 *
 * @param {Object} product - Fiche du bijou.
 * @param {Object} selected - { optionId: valeurId }.
 * @returns {Object} { valeurId: "disponible" | "epuise" | "absente" }
 */
export function getValueStatuses(product, selected) {
  let statuses = {};

  product.options.forEach(function (option) {
    option.valeurs.forEach(function (value) {
      let candidate = Object.assign({}, selected, { [option.id]: value.id });
      let variant = findVariant(product, candidate);

      if (variant === null) {
        statuses[value.id] = "absente";
      } else {
        statuses[value.id] = variant.stock > 0 ? "disponible" : "epuise";
      }
    });
  });
  return statuses;
}

/**
 * Libellé d'une valeur d'option, avec son supplément s'il y en a un et sa
 * disponibilité si la combinaison n'est pas commandable (le texte porte
 * l'information : la couleur ne fait que la souligner).
 *
 * @param {{valeur: string, supplement: number}} value - Valeur d'option.
 * @param {string} status - « disponible », « epuise » ou « absente ».
 * @returns {string} Par exemple « Perle de Tahiti (+3 000 XPF) — épuisé ».
 */
export function formatValueLabel(value, status) {
  let label = value.supplement > 0 ? `${value.valeur} (+${formatPrice(value.supplement)})` : value.valeur;

  if (status === "epuise") {
    return `${label} — épuisé`;
  }
  return status === "absente" ? `${label} — indisponible` : label;
}
