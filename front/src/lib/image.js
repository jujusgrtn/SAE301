/**
 * Adresses des photos des bijoux.
 *
 * La valeur de image_produit.fichier (renvoyée par l'API dans image.fichier)
 * désigne l'une de ces deux origines :
 *  - un nom simple (« bague-ginkgo-keishi ») : une photo du catalogue d'origine,
 *    dans front/public/images/produits/ ;
 *  - un chemin (« uploads/produits/bague-ginkgo-3fa9c1d2 ») : une photo envoyée
 *    depuis le back-office, à la racine du site (hors de front/dist/ que le
 *    build vide).
 * Dans les deux cas, <fichier>.webp mesure 800 px et <fichier>-400.webp 400 px.
 */

/**
 * Adresse complète d'une photo, avec le chemin du projet.
 *
 * @param {string} file - Valeur de image.fichier.
 * @param {boolean} isSmall - Vrai pour la version 400 px, faux pour la 800 px.
 * @returns {string}
 */
export function productImageUrl(file, isSmall) {
  const path = file.includes("/") ? file : `images/produits/${file}`;
  const encoded = path.split("/").map(encodeURIComponent).join("/");

  return import.meta.env.BASE_URL + encoded + (isSmall ? "-400.webp" : ".webp");
}
