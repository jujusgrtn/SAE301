import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { formatPrice } from "../../lib/format.js";
import template from "./template.html?raw";
import templateImage from "./image.html?raw";
import templateNoImage from "./sans-image.html?raw";

// Les photos sont servies par Vite depuis front/public/, sous la base du projet.
// Chaque fichier existe en 800 px (fichier.webp) et en 400 px (fichier-400.webp).
const IMAGES_URL = import.meta.env.BASE_URL + "images/produits/";

// Carte d'un bijou, tel que le renvoie l'API :
// { nom, slug, prix, categorie: { nom }, sousCategorie: { nom }, image: { fichier, alt } | null }
let ProductCardView = {
  /**
   * Remplit le template de l'image principale, ou celui d'un bijou sans photo.
   *
   * @param {{fichier: string, alt: string} | null} image - Image principale du bijou.
   * @returns {string} - Le HTML de l'image.
   */
  formatOneImage: function (image) {
    if (image === null) {
      return templateNoImage;
    }

    const file = encodeURIComponent(image.fichier);

    return genericRenderer(templateImage, {
      src: `${IMAGES_URL}${file}.webp`,
      srcPetite: `${IMAGES_URL}${file}-400.webp`,
      alt: image.alt,
    });
  },

  /**
   * Remplit le template de la carte avec les valeurs mises en forme.
   *
   * @param {Object} product - Un bijou renvoyé par GET /api/produits.
   * @returns {string} - Le HTML de la carte, sans l'image.
   */
  html: function (product) {
    return genericRenderer(template, {
      categorie: product.categorie.nom,
      nom: product.nom,
      href: routeUrl(`/produit/${encodeURIComponent(product.slug)}`),
      matiere: product.sousCategorie.nom,
      prix: formatPrice(product.prix),
    });
  },

  /**
   * Construit la carte complète : l'image prend la place du <slot name="image">.
   *
   * @param {Object} product - Un bijou renvoyé par GET /api/produits.
   * @returns {DocumentFragment}
   */
  dom: function (product) {
    let fragment = htmlToFragment(ProductCardView.html(product));
    let image = htmlToFragment(ProductCardView.formatOneImage(product.image));
    fragment.querySelector('slot[name="image"]').replaceWith(image);
    return fragment;
  },
};

export { ProductCardView };
