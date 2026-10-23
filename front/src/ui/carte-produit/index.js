import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import { productImageUrl } from "../../lib/image.js";
import { StockBadgeView } from "../badge-stock/index.js";
import { PriceView } from "../prix/index.js";
import template from "./template.html?raw";
import templateImage from "./image.html?raw";
import templateNoImage from "./sans-image.html?raw";

// Carte d'un bijou, tel que le renvoie l'API :
// { nom, slug, prix (avant promotion), prixPromo (ou null), categorie: { nom }, sousCategorie: { nom }, image: { fichier, alt } | null }
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

    return genericRenderer(templateImage, {
      src: productImageUrl(image.fichier, false),
      srcPetite: productImageUrl(image.fichier, true),
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
    fragment
      .querySelector('slot[name="prix"]')
      .replaceWith(PriceView.dom({ prix: product.prixPromo ?? product.prix, prixInitial: product.prix }));
    fragment.querySelector('slot[name="stock"]').replaceWith(StockBadgeView.dom(product));
    return fragment;
  },
};

export { ProductCardView };
