import { getRequest } from "../lib/api-request.js";

let CategoryData = {};

/**
 * Arbre du menu : GET /api/categories (US DEC-a).
 *
 * La réponse contient les catégories principales et leurs sous-catégories :
 * { categories: [{ nom, slug, sousCategories: [{ nom, slug }] }] }
 * Une erreur HTTP est levée sous forme d'ErreurApi (voir lib/api-request.js).
 *
 * @returns {Promise<{categories: Array<Object>}>}
 */
CategoryData.fetchMenu = async function () {
  return getRequest("categories");
};

export { CategoryData };
