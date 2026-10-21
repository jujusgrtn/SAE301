/**
 * Appels à l'API.
 *
 * L'API est servie avec le front, sous le même chemin :
 * /~login/SAE301-Starter/api/... (import.meta.env.BASE_URL vaut /~login/SAE301-Starter/).
 *
 * Front et API ayant la même origine, le navigateur joint automatiquement les
 * cookies du site à chaque requête : aucune option n'est nécessaire ici.
 */
const API_URL = import.meta.env.BASE_URL + "api/";

/**
 * Erreur renvoyée par l'API, avec son code de statut HTTP.
 *
 * Une page a parfois besoin de distinguer un 401 d'un 403 pour afficher le bon
 * message : le message seul ne le permettrait pas.
 */
class ErreurApi extends Error {
  constructor(message, statut) {
    super(message);
    this.name = "ErreurApi";
    this.statut = statut;
  }
}

/**
 * Envoie une requête et renvoie la réponse JSON, convertie en objet.
 * Lève une ErreurApi si le serveur répond par une erreur.
 */
let request = async function (uri, options) {
  const response = await fetch(API_URL + uri, options);

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    throw new ErreurApi("Réponse illisible du serveur.", response.status);
  }

  if (!response.ok) {
    // L'API décrit ses erreurs dans un champ « erreur ».
    throw new ErreurApi(data?.erreur ?? `Erreur ${response.status}`, response.status);
  }

  return data;
};

/**
 * Lecture d'une ressource. Par exemple : await getRequest("films?page=2")
 */
let getRequest = function (uri) {
  return request(uri, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
};

/**
 * Envoi de données au format JSON. Par exemple :
 * await postRequest("login", { login: "alice", mdp: "azerty" })
 */
let postRequest = function (uri, data = {}) {
  return request(uri, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
};

/**
 * Envoi d'un formulaire avec fichier (multipart/form-data). Par exemple :
 * await postFormRequest("admin/produits/creer", new FormData(formulaire))
 *
 * Pas d'en-tête Content-Type ici : le navigateur le fabrique lui-même, avec la
 * séparation propre à cet envoi (boundary). En poser un à la main casserait
 * le décodage côté serveur.
 */
let postFormRequest = function (uri, formData) {
  return request(uri, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: formData,
  });
};

export { getRequest, postRequest, postFormRequest, ErreurApi };
