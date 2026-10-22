import { AdminData } from "../../data/admin.js";
import { AdminProductData } from "../../data/admin-produit.js";
import { CategoryData } from "../../data/categorie.js";
import { formatFileSize } from "../../lib/format.js";
import { productImageUrl } from "../../lib/image.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateNotFound from "./introuvable.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateForm from "./formulaire.html?raw";
import templateSingleStock from "./stock-unique.html?raw";
import templateVariantStocks from "./stock-variantes.html?raw";
import templateVariantStock from "./stock-variante.html?raw";
import templateCurrentPhoto from "./photo-actuelle.html?raw";
import templatePreview from "./apercu.html?raw";
import templatePreviewError from "./apercu-erreur.html?raw";
import templateError from "./erreur.html?raw";
import templateGroup from "./groupe.html?raw";
import templateOption from "./option.html?raw";

/**
 * Page « Bijou » du back-office (US GOF-a) : formulaire de création
 * (/admin/produits/nouveau) et de modification (/admin/produits/:id/modifier).
 *
 * Le serveur revalide chaque champ et décide de l'accès : les contrôles de la
 * page (champs obligatoires, taille de la photo) ne font qu'éviter un aller-retour.
 * En cas d'erreur du serveur, le formulaire n'est pas reconstruit : la saisie et
 * la photo choisie restent en place.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  // Mêmes limites que le serveur (ProductImageStorage), qui reste seul juge.
  PHOTO_TYPES: ["image/jpeg", "image/png", "image/webp"],
  PHOTO_MAX_BYTES: 2 * 1024 * 1024,

  visit: 0, // numéro de l'affichage, pour ignorer une réponse arrivée après un changement de page
  mode: "create", // "create" | "edit"
  id: null, // identifiant du bijou en modification
  status: "loading", // "loading" | "ready" | "unauthorized" | "notfound" | "error"
  categories: [], // arbre renvoyé par GET /api/categories
  product: null, // bijou en modification, tel que le renvoie GET /api/admin/produit
  loadError: null, // texte si le formulaire n'a pas pu être préparé
  isSubmitting: false,
  submitError: null, // texte de la dernière erreur d'enregistrement
};

/**
 * Prépare l'état pour un nouvel affichage de la page.
 * . id : identifiant du bijou à modifier, ou null pour une création
 * > aucune valeur de retour
 *
 * @param {number|null} id
 * @returns {void}
 */
M.reset = function (id) {
  M.visit += 1;
  M.mode = id === null ? "create" : "edit";
  M.id = id;
  M.status = "loading";
  M.categories = [];
  M.product = null;
  M.loadError = null;
  M.isSubmitting = false;
  M.submitError = null;
};

/**
 * Charge ce dont le formulaire a besoin : les sous-catégories à proposer et,
 * en modification, le bijou. En création, la connexion administrateur est
 * vérifiée dès l'ouverture plutôt qu'à l'enregistrement.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchForm = async function () {
  let visit = M.visit;

  try {
    let results = await Promise.all([
      CategoryData.fetchMenu(),
      M.mode === "edit" ? AdminProductData.fetchOne(M.id) : AdminData.fetch(),
    ]);

    if (visit !== M.visit) {
      return;
    }
    M.categories = results[0].categories;
    M.product = M.mode === "edit" ? results[1].produit : null;
    M.status = "ready";
  } catch (error) {
    if (visit !== M.visit) {
      return;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else if (error.statut === 404) {
      M.status = "notfound";
    } else {
      M.status = "error";
      M.loadError = `Impossible de préparer le formulaire : ${error.message}`;
    }
  }
};

/**
 * Vérifie la photo choisie avant tout envoi.
 * . info : { size, type } du fichier choisi, ou null si le choix a été vidé
 * > { status: "none" | "ok" | "refused", message }
 *
 * @param {{size: number, type: string}|null} info
 * @returns {{status: string, message: string|null}}
 */
M.checkPhoto = function (info) {
  if (info === null) {
    return { status: "none", message: null };
  }
  if (!M.PHOTO_TYPES.includes(info.type)) {
    return { status: "refused", message: "Format non accepté : utilisez un JPEG, un PNG ou un WebP." };
  }
  if (info.size > M.PHOTO_MAX_BYTES) {
    return { status: "refused", message: "La photo est trop lourde (2 Mo au maximum)." };
  }
  return { status: "ok", message: null };
};

/**
 * Indique si l'enregistrement peut partir : formulaire prêt, aucun envoi en
 * cours (un double clic n'envoie qu'une requête).
 * . aucun paramètre
 * > booléen
 *
 * @returns {boolean}
 */
M.canSubmit = function () {
  return M.status === "ready" && !M.isSubmitting;
};

/**
 * Passe l'enregistrement en cours et efface l'erreur précédente.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
M.startSubmit = function () {
  M.isSubmitting = true;
  M.submitError = null;
};

/**
 * Envoie le formulaire au serveur : création ou modification selon le mode.
 * . formData : champs du formulaire (et photo éventuelle)
 * > Promise<{isCurrent, noticeKey}> : noticeKey vaut « cree » ou « modifie » en cas
 *   de succès, null sinon ; isCurrent est faux si la page a été quittée pendant l'envoi
 *
 * @param {FormData} formData
 * @returns {Promise<{isCurrent: boolean, noticeKey: string|null}>}
 */
M.submit = async function (formData) {
  let visit = M.visit;
  let noticeKey = null;

  try {
    if (M.mode === "edit") {
      await AdminProductData.update(formData);
      noticeKey = "modifie";
    } else {
      await AdminProductData.create(formData);
      noticeKey = "cree";
    }
  } catch (error) {
    M.submitError =
      error.statut === 401
        ? "Votre session d'administration a expiré : reconnectez-vous au back-office, puis recommencez."
        : error.message;
  }

  if (visit !== M.visit) {
    return { isCurrent: false, noticeKey: noticeKey };
  }
  M.isSubmitting = false;
  return { isCurrent: true, noticeKey: noticeKey };
};

/**
 * Photographie de l'état, transmise à la Vue. Les valeurs du formulaire sont
 * celles du bijou en modification, ou vides pour une création.
 * . aucun paramètre
 * > { mode, status, categories, loadError, values, variants, currentImage, isSubmitting, submitError }
 *   variants : les combinaisons { id, libelle, stock } d'un bijou à options (vide sinon : un seul stock)
 *
 * @returns {Object}
 */
M.getState = function () {
  let product = M.product;

  return {
    mode: M.mode,
    status: M.status,
    categories: M.categories,
    loadError: M.loadError,
    values: {
      id: product === null ? "" : String(product.id),
      nom: product === null ? "" : product.nom,
      description: product === null ? "" : product.description,
      prix: product === null ? "" : String(product.prix),
      stock: product === null ? "" : String(product.stock),
      sousCategorie: product === null ? "" : product.sousCategorie.slug,
      altPhoto: product === null || product.image === null ? "" : product.image.alt,
    },
    variants: product !== null && product.nombreVariantes > 1 ? product.variantes : [],
    currentImage: product === null ? null : product.image,
    isSubmitting: M.isSubmitting,
    submitError: M.submitError,
  };
};

// ---------------------------------------------------------------------------
// C — Contrôleur : orchestre M et V
// ---------------------------------------------------------------------------

let C = {};

/**
 * Charge le formulaire puis l'affiche.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
C.loadForm = async function () {
  let visit = M.visit;

  await M.fetchForm();

  if (visit === M.visit) {
    V.renderPage(M.getState());
  }
};

/**
 * Envoi du formulaire. Le navigateur a déjà vérifié les champs obligatoires ;
 * le serveur revérifie tout.
 * . ev : événement submit, délégué depuis la racine de la page
 * > Promise<void>
 *
 * @param {SubmitEvent} ev
 * @returns {Promise<void>}
 */
C.handler_submitForm = async function (ev) {
  if (ev.target.closest("form[data-form]") === null) {
    return;
  }
  ev.preventDefault();

  if (!M.canSubmit()) {
    return;
  }

  M.startSubmit();
  V.renderBusy(M.getState());

  let result = await M.submit(new FormData(ev.target));

  if (!result.isCurrent) {
    return;
  }
  if (result.noticeKey !== null && M.submitError === null) {
    V.goToList(result.noticeKey);
    return;
  }

  V.renderBusy(M.getState());
  V.renderSubmitError(M.getState());
};

/**
 * Choix d'un fichier dans le champ photo : contrôle immédiat et aperçu.
 * . ev : événement change, délégué depuis la racine de la page
 * > aucune valeur de retour
 *
 * @param {Event} ev
 * @returns {void}
 */
C.handler_changePhoto = function (ev) {
  if (ev.target.name !== "photo") {
    return;
  }

  let input = ev.target;
  let file = input.files.length > 0 ? input.files[0] : null;
  let check = M.checkPhoto(file === null ? null : { size: file.size, type: file.type });

  V.renderPhotoPreview(check, file, input);
};

/**
 * Point d'entrée : formulaire en état de chargement, rendu au routeur, puis
 * chargement lancé sans l'attendre.
 * . id : identifiant lu dans l'adresse (« 12 »), ou undefined pour une création
 * > DocumentFragment de la page
 *
 * @param {string|undefined} id
 * @returns {DocumentFragment}
 */
C.init = function (id) {
  let numericId = id === undefined ? null : Number(id);

  M.reset(numericId);
  let fragment = V.init(M.mode);

  if (numericId !== null && (!Number.isInteger(numericId) || numericId < 1)) {
    M.status = "notfound";
    V.renderPage(M.getState());
    return fragment;
  }

  V.renderPage(M.getState());
  C.loadForm();
  return fragment;
};

// ---------------------------------------------------------------------------
// V — Vue : rendu et DOM
// ---------------------------------------------------------------------------

let V = {};

V.root = null; // élément racine de la page affichée
V.previewUrl = null; // adresse temporaire de l'aperçu de la photo choisie

/**
 * Crée la structure de la page, mémorise sa racine et y délègue les
 * événements du formulaire (qui n'existe pas encore pendant le chargement).
 * . mode : "create" | "edit"
 * > DocumentFragment de la page
 *
 * @param {string} mode
 * @returns {DocumentFragment}
 */
V.init = function (mode) {
  let fragment = htmlToFragment(
    genericRenderer(template, {
      urlListe: routeUrl("/admin/produits"),
      titre: mode === "edit" ? "Modifier le bijou" : "Nouveau bijou",
    })
  );
  V.root = fragment.firstElementChild;
  V.root.addEventListener("submit", C.handler_submitForm);
  V.root.addEventListener("change", C.handler_changePhoto);
  return fragment;
};

/**
 * Remplit la liste des sous-catégories, groupées par catégorie principale.
 * . select : liste déroulante à remplir, categories : arbre du menu,
 *   selectedSlug : sous-catégorie à présélectionner, ou ''
 * > aucune valeur de retour
 *
 * @param {HTMLSelectElement} select
 * @param {Array<Object>} categories
 * @param {string} selectedSlug
 * @returns {void}
 */
V.fillCategories = function (select, categories, selectedSlug) {
  select.append(htmlToFragment(genericRenderer(templateOption, { valeur: "", libelle: "Choisir une sous-catégorie…" })));

  for (let i = 0; i < categories.length; i++) {
    let group = htmlToFragment(genericRenderer(templateGroup, { nom: categories[i].nom })).firstElementChild;

    for (let j = 0; j < categories[i].sousCategories.length; j++) {
      let sub = categories[i].sousCategories[j];
      group.append(htmlToFragment(genericRenderer(templateOption, { valeur: sub.slug, libelle: sub.nom })));
    }
    select.append(group);
  }

  select.value = selectedSlug;
};

/**
 * Libellé du champ photo, selon qu'il y a déjà une photo ou non.
 * . state : état renvoyé par M.getState()
 * > chaîne
 *
 * @param {Object} state
 * @returns {string}
 */
V.formatOnePhotoLabel = function (state) {
  if (state.currentImage !== null) {
    return "Remplacer la photo";
  }
  return state.mode === "edit" ? "Ajouter une photo" : "Photo (facultative)";
};

/**
 * Champ de stock du bijou, ou un champ par combinaison s'il a des options
 * (US OPT-b) : chaque combinaison a son propre stock.
 * . fragment : le formulaire, state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {DocumentFragment} fragment
 * @param {Object} state
 * @returns {void}
 */
V.fillStock = function (fragment, state) {
  let singleSlot = fragment.querySelector('slot[name="stock-unique"]');
  let variantsSlot = fragment.querySelector('slot[name="stock-variantes"]');

  if (state.variants.length === 0) {
    singleSlot.replaceWith(htmlToFragment(genericRenderer(templateSingleStock, { stock: state.values.stock })));
    variantsSlot.remove();
    return;
  }

  singleSlot.remove();
  let group = htmlToFragment(templateVariantStocks);
  let fields = state.variants.map(function (variant) {
    return htmlToFragment(
      genericRenderer(templateVariantStock, { id: variant.id, libelle: variant.libelle, stock: String(variant.stock) })
    );
  });
  group.querySelector('slot[name="variantes"]').replaceWith(...fields);
  variantsSlot.replaceWith(group);
};

/**
 * Formulaire complet, prérempli avec les valeurs de l'état.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createFormFragment = function (state) {
  let fragment = htmlToFragment(
    genericRenderer(templateForm, {
      id: state.values.id,
      nom: state.values.nom,
      description: state.values.description,
      prix: state.values.prix,
      stock: state.values.stock,
      altPhoto: state.values.altPhoto,
      urlListe: routeUrl("/admin/produits"),
      libellePhoto: V.formatOnePhotoLabel(state),
      libelleBouton: state.mode === "edit" ? "Enregistrer les modifications" : "Créer le bijou",
    })
  );

  V.fillCategories(fragment.querySelector('select[name="sousCategorie"]'), state.categories, state.values.sousCategorie);
  V.fillStock(fragment, state);

  let slot = fragment.querySelector('slot[name="photo-actuelle"]');
  if (state.currentImage === null) {
    slot.remove();
  } else {
    slot.replaceWith(
      htmlToFragment(
        genericRenderer(templateCurrentPhoto, {
          src: productImageUrl(state.currentImage.fichier, true),
          alt: state.currentImage.alt,
        })
      )
    );
  }

  return fragment;
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, bijou introuvable,
 * erreur ou formulaire.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createContentFragment = function (state) {
  if (state.status === "loading") {
    return htmlToFragment(templateLoading);
  }
  if (state.status === "unauthorized") {
    return htmlToFragment(genericRenderer(templateUnauthorized, { urlBackOffice: routeUrl("/admin") }));
  }
  if (state.status === "notfound") {
    return htmlToFragment(genericRenderer(templateNotFound, { urlListe: routeUrl("/admin/produits") }));
  }
  if (state.status === "error") {
    return htmlToFragment(genericRenderer(templateLoadError, { texte: state.loadError }));
  }
  return V.createFormFragment(state);
};

/**
 * Remplace le contenu de la page par celui qui correspond à l'état reçu.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderPage = function (state) {
  V.releasePreview();

  let zone = V.root.querySelector('[data-zone="contenu"]');
  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(V.createContentFragment(state));
};

/**
 * Marque le bouton d'enregistrement selon l'envoi en cours, sans reconstruire
 * le formulaire : la saisie, la photo choisie et le focus restent en place.
 * aria-disabled plutôt que disabled pour que le bouton garde le focus.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderBusy = function (state) {
  let button = V.root.querySelector('form[data-form] [type="submit"]');

  if (button === null) {
    return;
  }

  if (state.isSubmitting) {
    button.setAttribute("aria-disabled", "true");
    button.textContent = "Enregistrement…";
  } else {
    button.removeAttribute("aria-disabled");
    button.textContent = state.mode === "edit" ? "Enregistrer les modifications" : "Créer le bijou";
  }
};

/**
 * Affiche l'erreur d'enregistrement en haut du formulaire (ou l'efface) et y
 * place le focus, pour qu'elle soit lue et que le clavier reparte de là.
 * . state : état renvoyé par M.getState()
 * > aucune valeur de retour
 *
 * @param {Object} state
 * @returns {void}
 */
V.renderSubmitError = function (state) {
  let zone = V.root.querySelector('[data-zone="erreur-formulaire"]');

  if (zone === null) {
    return;
  }
  if (state.submitError === null) {
    zone.replaceChildren();
    return;
  }

  zone.replaceChildren(htmlToFragment(genericRenderer(templateError, { texte: state.submitError })));
  zone.querySelector('[data-zone="erreur"]').focus();
};

/**
 * Libère l'aperçu de la photo précédente : l'adresse temporaire tient de la
 * mémoire tant qu'elle n'est pas révoquée.
 * . aucun paramètre
 * > aucune valeur de retour
 *
 * @returns {void}
 */
V.releasePreview = function () {
  if (V.previewUrl !== null) {
    URL.revokeObjectURL(V.previewUrl);
    V.previewUrl = null;
  }
};

/**
 * Affiche l'aperçu de la photo choisie, ou la raison de son refus (le champ
 * est alors vidé : rien ne sera envoyé).
 * . check : { status, message } renvoyé par M.checkPhoto(), file : fichier choisi
 *   ou null, input : champ fichier
 * > aucune valeur de retour
 *
 * @param {{status: string, message: string|null}} check
 * @param {File|null} file
 * @param {HTMLInputElement} input
 * @returns {void}
 */
V.renderPhotoPreview = function (check, file, input) {
  let zone = V.root.querySelector('[data-zone="apercu"]');

  V.releasePreview();

  if (check.status === "refused") {
    input.value = "";
    zone.replaceChildren(htmlToFragment(genericRenderer(templatePreviewError, { texte: check.message })));
    return;
  }
  if (check.status === "none") {
    zone.replaceChildren();
    return;
  }

  V.previewUrl = URL.createObjectURL(file);
  zone.replaceChildren(
    htmlToFragment(
      genericRenderer(templatePreview, { src: V.previewUrl, nom: file.name, taille: formatFileSize(file.size) })
    )
  );
};

/**
 * Retourne à la liste des produits, avec l'annonce du résultat.
 *
 * Le routeur affiche la page de l'adresse courante à chaque événement
 * popstate : on change l'adresse, puis on le prévient, comme le ferait le
 * bouton Précédent du navigateur.
 * . noticeKey : « cree » ou « modifie »
 * > aucune valeur de retour
 *
 * @param {string} noticeKey
 * @returns {void}
 */
V.goToList = function (noticeKey) {
  window.history.pushState(null, "", routeUrl(`/admin/produits?notice=${encodeURIComponent(noticeKey)}`));
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Page appelée par le routeur sur « /admin/produits/nouveau » (sans id) et
 * « /admin/produits/:id/modifier ».
 *
 * @param {{id?: string}} params - Paramètres de l'adresse.
 * @returns {DocumentFragment}
 */
export function AdminProductFormPage(params) {
  return C.init(params.id);
}
