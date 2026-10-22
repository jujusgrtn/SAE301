import { AdminCategoryData } from "../../data/admin-categorie.js";
import { genericRenderer, htmlToFragment, routeUrl } from "../../lib/utils.js";
import template from "./template.html?raw";
import templateLoading from "./chargement.html?raw";
import templateUnauthorized from "./non-connecte.html?raw";
import templateNotFound from "./introuvable.html?raw";
import templateLoadError from "./erreur-chargement.html?raw";
import templateForm from "./formulaire.html?raw";
import templateChoice from "./emplacement-choix.html?raw";
import templateFixed from "./emplacement-fixe.html?raw";
import templateOption from "./option.html?raw";
import templateError from "./erreur.html?raw";

/**
 * Page « Catégorie » du back-office (US GOF-c) : formulaire de création
 * (/admin/categories/nouveau, avec ?parent=… pour une sous-catégorie) et de
 * modification (/admin/categories/:id/modifier).
 *
 * Le serveur revalide chaque champ et décide de l'accès. En cas d'erreur du
 * serveur, le formulaire n'est pas reconstruit : la saisie reste en place.
 */

// ---------------------------------------------------------------------------
// M — Modèle : état de la page et accès aux données
// ---------------------------------------------------------------------------

let M = {
  visit: 0, // numéro de l'affichage, pour ignorer une réponse arrivée après un changement de page
  mode: "create", // "create" | "edit"
  id: null, // identifiant de la catégorie en modification
  presetParent: null, // valeur brute de ?parent= dans l'adresse (création)
  status: "loading", // "loading" | "ready" | "unauthorized" | "notfound" | "error"
  categories: [], // arbre renvoyé par GET /api/admin/categories
  category: null, // catégorie en modification : { id, nom, slug, description, parent }
  loadError: null, // texte si le formulaire n'a pas pu être préparé
  isSubmitting: false,
  submitError: null, // texte de la dernière erreur d'enregistrement
};

/**
 * Prépare l'état pour un nouvel affichage de la page.
 * . id : identifiant de la catégorie à modifier, ou null pour une création
 * . presetParent : valeur de ?parent= dans l'adresse, ou null
 * > aucune valeur de retour
 *
 * @param {number|null} id
 * @param {string|null} presetParent
 * @returns {void}
 */
M.reset = function (id, presetParent) {
  M.visit += 1;
  M.mode = id === null ? "create" : "edit";
  M.id = id;
  M.presetParent = presetParent;
  M.status = "loading";
  M.categories = [];
  M.category = null;
  M.loadError = null;
  M.isSubmitting = false;
  M.submitError = null;
};

/**
 * Charge l'arbre des catégories : il fournit les emplacements possibles et,
 * en modification, la catégorie elle-même. Cet appel vérifie aussi la
 * connexion administrateur dès l'ouverture.
 * . aucun paramètre
 * > Promise<void>
 *
 * @returns {Promise<void>}
 */
M.fetchForm = async function () {
  let visit = M.visit;

  try {
    let data = await AdminCategoryData.fetchAll();

    if (visit !== M.visit) {
      return;
    }
    M.categories = data.categories;

    if (M.mode === "edit") {
      M.category = M.describe(M.id);
      M.status = M.category === null ? "notfound" : "ready";
    } else {
      M.status = "ready";
    }
  } catch (error) {
    if (visit !== M.visit) {
      return;
    }
    if (error.statut === 401) {
      M.status = "unauthorized";
    } else {
      M.status = "error";
      M.loadError = `Impossible de préparer le formulaire : ${error.message}`;
    }
  }
};

/**
 * Une catégorie de l'arbre, avec sa catégorie principale s'il s'agit d'une sous-catégorie.
 * . id : identifiant de la catégorie
 * > { id, nom, slug, description, parent: { id, nom } | null }, ou null si elle n'existe pas
 *
 * @param {number} id
 * @returns {Object|null}
 */
M.describe = function (id) {
  for (let i = 0; i < M.categories.length; i++) {
    let main = M.categories[i];

    if (main.id === id) {
      return { id: main.id, nom: main.nom, slug: main.slug, description: main.description, parent: null };
    }

    for (let j = 0; j < main.sousCategories.length; j++) {
      let sub = main.sousCategories[j];

      if (sub.id === id) {
        return {
          id: sub.id,
          nom: sub.nom,
          slug: sub.slug,
          description: sub.description,
          parent: { id: main.id, nom: main.nom },
        };
      }
    }
  }
  return null;
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
 * . values : champs du formulaire { nom, description, parentId? } (chaînes)
 * > Promise<{isCurrent, noticeKey}> : noticeKey vaut « cree » ou « modifie » en cas
 *   de succès, null sinon ; isCurrent est faux si la page a été quittée pendant l'envoi
 *
 * @param {{nom: string, description: string, parentId?: string}} values
 * @returns {Promise<{isCurrent: boolean, noticeKey: string|null}>}
 */
M.submit = async function (values) {
  let visit = M.visit;
  let noticeKey = null;

  try {
    if (M.mode === "edit") {
      await AdminCategoryData.update({ id: M.id, nom: values.nom, description: values.description });
      noticeKey = "modifie";
    } else {
      let parentId = values.parentId === undefined || values.parentId === "" ? null : Number(values.parentId);

      await AdminCategoryData.create({ nom: values.nom, description: values.description, parentId: parentId });
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
 * Emplacement présélectionné à la création : la catégorie principale donnée
 * par ?parent=…, si elle existe.
 * . aucun paramètre
 * > identifiant sous forme de chaîne, ou '' (catégorie principale)
 *
 * @returns {string}
 */
M.getPresetParentId = function () {
  let found = M.categories.find(function (category) {
    return String(category.id) === M.presetParent;
  });

  return found === undefined ? "" : String(found.id);
};

/**
 * Photographie de l'état, transmise à la Vue.
 * . aucun paramètre
 * > { mode, status, categories, loadError, values, category, presetParentId, isSubmitting, submitError }
 *
 * @returns {Object}
 */
M.getState = function () {
  return {
    mode: M.mode,
    status: M.status,
    categories: M.categories,
    loadError: M.loadError,
    values: {
      nom: M.category === null ? "" : M.category.nom,
      description: M.category === null ? "" : M.category.description,
    },
    category: M.category,
    presetParentId: M.mode === "create" ? M.getPresetParentId() : "",
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

  let result = await M.submit(Object.fromEntries(new FormData(ev.target)));

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
 * Point d'entrée : formulaire en état de chargement, rendu au routeur, puis
 * chargement lancé sans l'attendre.
 * . id : identifiant lu dans l'adresse (« 12 »), ou undefined pour une création
 *
 * @param {string|undefined} id
 * @returns {DocumentFragment}
 */
C.init = function (id) {
  let numericId = id === undefined ? null : Number(id);

  M.reset(numericId, V.readPresetParent());
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

/**
 * Crée la structure de la page, mémorise sa racine et y délègue l'envoi du
 * formulaire (qui n'existe pas encore pendant le chargement).
 * . mode : "create" | "edit"
 * > DocumentFragment de la page
 *
 * @param {string} mode
 * @returns {DocumentFragment}
 */
V.init = function (mode) {
  let fragment = htmlToFragment(
    genericRenderer(template, {
      urlListe: routeUrl("/admin/categories"),
      titre: mode === "edit" ? "Modifier la catégorie" : "Nouvelle catégorie",
    })
  );
  V.root = fragment.firstElementChild;
  V.root.addEventListener("submit", C.handler_submitForm);
  return fragment;
};

/**
 * Valeur de ?parent= dans l'adresse (lien « Ajouter une sous-catégorie »).
 * . aucun paramètre
 * > chaîne, ou null si elle est absente
 *
 * @returns {string|null}
 */
V.readPresetParent = function () {
  return new URLSearchParams(window.location.search).get("parent");
};

/**
 * Bloc « Emplacement » du formulaire : une liste de catégories principales à
 * la création, un rappel (non modifiable) à la modification.
 * . state : état renvoyé par M.getState()
 * > DocumentFragment
 *
 * @param {Object} state
 * @returns {DocumentFragment}
 */
V.createLocationFragment = function (state) {
  if (state.mode === "edit") {
    return htmlToFragment(
      genericRenderer(templateFixed, {
        emplacement: state.category.parent === null ? "catégorie principale" : `sous-catégorie de ${state.category.parent.nom}`,
        slug: state.category.slug,
      })
    );
  }

  let fragment = htmlToFragment(templateChoice);
  let select = fragment.querySelector("select");

  select.append(htmlToFragment(genericRenderer(templateOption, { valeur: "", libelle: "Aucune : catégorie principale" })));
  for (let i = 0; i < state.categories.length; i++) {
    select.append(
      htmlToFragment(
        genericRenderer(templateOption, { valeur: state.categories[i].id, libelle: `Sous-catégorie de ${state.categories[i].nom}` })
      )
    );
  }
  select.value = state.presetParentId;
  return fragment;
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
      nom: state.values.nom,
      description: state.values.description,
      urlListe: routeUrl("/admin/categories"),
      libelleBouton: V.formatOneButtonLabel(state.mode),
    })
  );

  fragment.querySelector('slot[name="emplacement"]').replaceWith(V.createLocationFragment(state));
  return fragment;
};

/**
 * Libellé du bouton d'enregistrement.
 * . mode : "create" | "edit"
 * > chaîne
 *
 * @param {string} mode
 * @returns {string}
 */
V.formatOneButtonLabel = function (mode) {
  return mode === "edit" ? "Enregistrer les modifications" : "Créer la catégorie";
};

/**
 * Contenu correspondant à l'état : chargement, non connecté, catégorie
 * introuvable, erreur ou formulaire.
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
    return htmlToFragment(genericRenderer(templateNotFound, { urlListe: routeUrl("/admin/categories") }));
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
  let zone = V.root.querySelector('[data-zone="contenu"]');
  zone.setAttribute("aria-busy", String(state.status === "loading"));
  zone.replaceChildren(V.createContentFragment(state));
};

/**
 * Marque le bouton d'enregistrement selon l'envoi en cours, sans reconstruire
 * le formulaire. aria-disabled plutôt que disabled pour que le bouton garde
 * le focus.
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
    button.textContent = V.formatOneButtonLabel(state.mode);
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
 * Retourne à la liste des catégories, avec l'annonce du résultat.
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
  window.history.pushState(null, "", routeUrl(`/admin/categories?notice=${encodeURIComponent(noticeKey)}`));
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Page appelée par le routeur sur « /admin/categories/nouveau » (sans id) et
 * « /admin/categories/:id/modifier ».
 *
 * @param {{id?: string}} params - Paramètres de l'adresse.
 * @returns {DocumentFragment}
 */
export function AdminCategoryFormPage(params) {
  return C.init(params.id);
}
