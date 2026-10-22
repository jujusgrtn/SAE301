import { formatPrice } from "../../lib/format.js";
import { genericRenderer, htmlToFragment } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLine from "./ligne.html?raw";
import templateError from "./erreur.html?raw";

// Résultat de « Commander à nouveau » (US SUI-a) : ce qui est dans le panier
// et, pour chaque bijou, pourquoi tout n'a pas pu être transféré. Les données
// viennent du serveur ; ce composant ne fait que les écrire en phrases.
let ReorderResultView = {
  /**
   * Phrase d'une ligne du résultat.
   *
   * @param {{nomProduit: string, quantiteDemandee: number, quantiteAjoutee: number, statut: string,
   *          ancienPrix?: number, nouveauPrix?: number}} line
   * @returns {string}
   */
  formatOneLine: function (line) {
    let name = line.nomProduit;
    let added = `${line.quantiteAjoutee} ${line.quantiteAjoutee > 1 ? "exemplaires ajoutés" : "exemplaire ajouté"}`;
    let price = line.nouveauPrix === undefined ? "" : ` Prix actualisé : ${formatPrice(line.ancienPrix)} → ${formatPrice(line.nouveauPrix)}.`;

    if (line.statut === "ajoutee") {
      return `${name} : ${added}.${price}`;
    }
    if (line.statut === "partielle") {
      return `${name} : seulement ${line.quantiteAjoutee} sur ${line.quantiteDemandee} (stock limité).${price}`;
    }
    if (line.statut === "limite") {
      return `${name} : votre panier contient déjà le maximum possible.`;
    }
    if (line.statut === "epuisee") {
      return `${name} : épuisé.`;
    }
    return `${name} : n'est plus proposé.`;
  },

  /**
   * Phrase de titre : combien d'articles sont dans le panier.
   *
   * @param {{articlesDemandes: number, articlesAjoutes: number}} result
   * @returns {string}
   */
  formatTitle: function (result) {
    if (result.articlesAjoutes === 0) {
      return "Aucun bijou n'a pu être ajouté à votre panier.";
    }
    if (result.articlesAjoutes === result.articlesDemandes) {
      return `${result.articlesAjoutes} ${result.articlesAjoutes > 1 ? "articles ajoutés" : "article ajouté"} à votre panier.`;
    }
    return `${result.articlesAjoutes} article${result.articlesAjoutes > 1 ? "s" : ""} sur ${result.articlesDemandes} ajouté${result.articlesAjoutes > 1 ? "s" : ""} à votre panier.`;
  },

  /**
   * Construit le résultat.
   *
   * @param {{lignes: Array<Object>, articlesDemandes: number, articlesAjoutes: number}} result - Champ `resultat` de la réponse.
   * @param {string} urlPanier - Adresse complète de la page du panier.
   * @returns {DocumentFragment}
   */
  dom: function (result, urlPanier) {
    let fragment = htmlToFragment(
      genericRenderer(template, {
        titre: ReorderResultView.formatTitle(result),
        couleur: result.articlesAjoutes === 0 ? "text-danger" : "text-success",
        urlPanier: urlPanier,
      })
    );

    let lines = result.lignes.map(function (line) {
      return htmlToFragment(genericRenderer(templateLine, { texte: ReorderResultView.formatOneLine(line) }));
    });
    fragment.querySelector('slot[name="lignes"]').replaceWith(...lines);

    return fragment;
  },

  /**
   * Construit le message d'une demande qui a échoué.
   *
   * @param {string} text - Message à afficher.
   * @returns {DocumentFragment}
   */
  domError: function (text) {
    return htmlToFragment(genericRenderer(templateError, { texte: text }));
  },
};

export { ReorderResultView };
