/**
 * Bascule entre thème clair et thème sombre.
 *
 * Le thème initial est appliqué par le script placé dans index.html, avant le
 * premier affichage. Le choix est conservé en localStorage : le serveur n'en a
 * jamais besoin, contrairement aux préférences du catalogue, qui conditionnent
 * la requête SQL et voyagent donc dans des cookies.
 *
 * Le localStorage est commun à toutes les pages d'une origine, donc à tous les
 * sites hébergés sous https://mmi.unilim.fr/~login/… : la clé porte le chemin
 * du projet pour ne jamais croiser celle d'un autre site (même clé que le
 * script d'index.html).
 */
const CLE_THEME = `matira:${import.meta.env.BASE_URL}:theme`;

export function basculerTheme() {
  const sombre = document.documentElement.classList.toggle("theme-dark");

  try {
    localStorage.setItem(CLE_THEME, sombre ? "sombre" : "clair");
  } catch (e) {
    // Stockage indisponible : le thème s'applique quand même, mais ne
    // survivra pas au rechargement.
  }
}
