import { formatPrice } from "./format.js";

/**
 * Règles du catalogue : filtres, tri et pagination d'une liste de bijoux déjà
 * chargée (page « Nos bijoux » et pages de catégorie). Ce sont des fonctions
 * pures : la liste vient de l'API, rien ici n'appelle le réseau. Les filtres
 * vivent dans l'adresse (?groupe=…&dispo=…&prix=…&tri=…&page=…) pour qu'une
 * vue se partage et se retrouve.
 */

/** Bijoux par page (deux rangées de quatre sur desktop). */
export const PER_PAGE = 8;

/** Tris proposés ; le premier est celui par défaut. */
export const SORTS = [
  { valeur: "nouveautes", libelle: "nouveautés" },
  { valeur: "prix-croissant", libelle: "prix croissant" },
  { valeur: "prix-decroissant", libelle: "prix décroissant" },
];

/** Disponibilités filtrables (valeurs de `disponibilite` renvoyées par l'API). */
export const AVAILABILITIES = [
  { valeur: "en_stock", libelle: "En stock" },
  { valeur: "stock_faible", libelle: "Bientôt épuisé" },
];

/** Tranches de prix, en XPF (la borne haute de « moyen » est incluse). */
export const PRICE_RANGES = [
  { valeur: "bas", min: 0, max: 7999 },
  { valeur: "moyen", min: 8000, max: 15000 },
  { valeur: "haut", min: 15001, max: Infinity },
];

/**
 * Libellé d'une tranche dans la monnaie en vigueur : les bornes restent celles
 * du XPF, seul leur affichage est converti.
 *
 * @param {{valeur: string}} range - Une entrée de PRICE_RANGES.
 * @returns {string} Par exemple « Moins de 8 000 XPF » ou « 8 000 à 15 000 XPF ».
 */
export function describePriceRange(range) {
  if (range.valeur === "bas") {
    return `Moins de ${formatPrice(8000, true)}`;
  }
  if (range.valeur === "moyen") {
    return `${formatPrice(8000, true)} à ${formatPrice(15000, true)}`;
  }
  return `Plus de ${formatPrice(15000, true)}`;
}

/**
 * Prix à payer d'un bijou, promotion automatique comprise.
 *
 * @param {{prix: number, prixPromo?: number|null}} product - Bijou renvoyé par l'API.
 * @returns {number}
 */
export function getEffectivePrice(product) {
  return product.prixPromo ?? product.prix;
}

/**
 * Lit les filtres dans l'adresse. Toute valeur inconnue est ignorée : l'adresse
 * est saisie par l'utilisateur, elle ne fait jamais foi.
 *
 * @param {string} search - Chaîne de requête (window.location.search).
 * @param {Array<string>} validGroups - Slugs des groupes proposés (catégories ou sous-catégories).
 * @returns {{groupes: Array<string>, dispo: Array<string>, prix: Array<string>, tri: string, page: number}}
 */
export function readFilters(search, validGroups) {
  let params = new URLSearchParams(search);
  let keep = function (key, allowed) {
    return (params.get(key) ?? "")
      .split(",")
      .filter(function (value) {
        return allowed.includes(value);
      });
  };
  let sort = params.get("tri");
  let page = Number(params.get("page"));

  return {
    groupes: keep("groupe", validGroups),
    dispo: keep(
      "dispo",
      AVAILABILITIES.map(function (item) {
        return item.valeur;
      })
    ),
    prix: keep(
      "prix",
      PRICE_RANGES.map(function (item) {
        return item.valeur;
      })
    ),
    tri: SORTS.some(function (item) {
      return item.valeur === sort;
    })
      ? sort
      : SORTS[0].valeur,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/**
 * Écrit les filtres sous forme de chaîne de requête ; les valeurs par défaut
 * ne s'écrivent pas.
 *
 * @param {{groupes: Array<string>, dispo: Array<string>, prix: Array<string>, tri: string, page: number}} filters
 * @returns {string} Par exemple « ?groupe=bagues&page=2 », ou une chaîne vide.
 */
export function buildSearch(filters) {
  let params = new URLSearchParams();

  if (filters.groupes.length > 0) {
    params.set("groupe", filters.groupes.join(","));
  }
  if (filters.dispo.length > 0) {
    params.set("dispo", filters.dispo.join(","));
  }
  if (filters.prix.length > 0) {
    params.set("prix", filters.prix.join(","));
  }
  if (filters.tri !== SORTS[0].valeur) {
    params.set("tri", filters.tri);
  }
  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }

  let query = params.toString().replaceAll("%2C", ",");
  return query === "" ? "" : `?${query}`;
}

/**
 * Garde les bijoux qui respectent tous les filtres. Dans un même filtre, les
 * valeurs cochées s'additionnent (« Colliers » ou « Bagues ») ; les filtres
 * entre eux se cumulent.
 *
 * @param {Array<Object>} products - Bijoux de l'API.
 * @param {{groupes: Array<string>, dispo: Array<string>, prix: Array<string>}} filters
 * @param {function(Object): string} groupOf - Slug du groupe d'un bijou.
 * @returns {Array<Object>}
 */
export function filterProducts(products, filters, groupOf) {
  return products.filter(function (product) {
    let price = getEffectivePrice(product);

    if (filters.groupes.length > 0 && !filters.groupes.includes(groupOf(product))) {
      return false;
    }
    if (filters.dispo.length > 0 && !filters.dispo.includes(product.disponibilite)) {
      return false;
    }
    if (filters.prix.length > 0) {
      return PRICE_RANGES.some(function (range) {
        return filters.prix.includes(range.valeur) && price >= range.min && price <= range.max;
      });
    }
    return true;
  });
}

/**
 * Trie sans modifier la liste reçue.
 *
 * @param {Array<Object>} products - Bijoux de l'API.
 * @param {string} sort - Une valeur de SORTS.
 * @returns {Array<Object>}
 */
export function sortProducts(products, sort) {
  let list = products.slice();

  if (sort === "prix-croissant") {
    return list.sort(function (a, b) {
      return getEffectivePrice(a) - getEffectivePrice(b) || a.id - b.id;
    });
  }
  if (sort === "prix-decroissant") {
    return list.sort(function (a, b) {
      return getEffectivePrice(b) - getEffectivePrice(a) || a.id - b.id;
    });
  }
  return list.sort(function (a, b) {
    return b.dateAjout.localeCompare(a.dateAjout) || b.id - a.id;
  });
}

/**
 * Une page de la liste. Une page trop loin est ramenée à la dernière.
 *
 * @param {Array<Object>} products - Bijoux déjà filtrés et triés.
 * @param {number} page - Numéro demandé, à partir de 1.
 * @returns {{items: Array<Object>, page: number, pages: number, total: number}}
 */
export function paginate(products, page) {
  let pages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  let current = Math.min(Math.max(1, page), pages);

  return {
    items: products.slice((current - 1) * PER_PAGE, current * PER_PAGE),
    page: current,
    pages: pages,
    total: products.length,
  };
}

/**
 * Compose tout ce que le composant de liste doit afficher : cases cochées,
 * bijoux de la page, nombre total et pagination.
 *
 * @param {Array<Object>} products - Bijoux de la page « catalogue » ou « catégorie ».
 * @param {{groupes: Array<string>, dispo: Array<string>, prix: Array<string>, tri: string, page: number}} filters
 * @param {Array<{valeur: string, libelle: string}>} groups - Groupes proposés (peut être vide).
 * @param {string} groupTitle - Titre du bloc de groupes (« Catégorie », « Sous-catégorie »).
 * @param {function(Object): string} groupOf - Slug du groupe d'un bijou.
 * @returns {Object} État attendu par CatalogueView.dom().
 */
export function buildListState(products, filters, groups, groupTitle, groupOf) {
  let checked = function (selected) {
    return function (item) {
      return { valeur: item.valeur, libelle: item.libelle, checked: selected.includes(item.valeur) };
    };
  };
  let result = paginate(sortProducts(filterProducts(products, filters, groupOf), filters.tri), filters.page);

  return {
    total: `${result.total} ${result.total > 1 ? "bijoux" : "bijou"}`,
    groupTitle: groupTitle,
    groups: groups.map(checked(filters.groupes)),
    availabilities: AVAILABILITIES.map(checked(filters.dispo)),
    prices: PRICE_RANGES.map(function (range) {
      return { valeur: range.valeur, libelle: describePriceRange(range), checked: filters.prix.includes(range.valeur) };
    }),
    sorts: SORTS,
    sort: filters.tri,
    items: result.items,
    page: result.page,
    pages: result.pages,
  };
}
