/**
 * Petites fonctions de mise en forme, sans dépendance.
 */

/**
 * 149 -> « 2 h 29 »
 */
export function formaterDuree(minutes) {
  const heures = Math.floor(minutes / 60);
  const restant = minutes % 60;

  if (heures === 0) {
    return `${restant} min`;
  }

  return `${heures} h ${String(restant).padStart(2, "0")}`;
}

/**
 * 8.6 -> « 8,6 » (la virgule décimale française)
 */
export function formaterNote(note) {
  return Number(note).toFixed(1).replace(".", ",");
}

/**
 * 14900 -> « 14 900 XPF »
 *
 * Le franc pacifique n'a pas de centimes. Les espaces sont insécables (U+00A0) :
 * le prix ne se coupe jamais en fin de ligne, même dans une carte étroite.
 *
 * @param {number} price - Prix entier en XPF.
 * @returns {string} - Le prix mis en forme.
 */
export function formatPrice(price) {
  const digits = String(Math.round(Number(price)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${grouped} XPF`;
}

/**
 * Taille d'un fichier en toutes lettres.
 * 85000 -> « 83 Ko » ; 1572864 -> « 1,5 Mo »
 *
 * @param {number} bytes - Taille en octets.
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Alerte d'une ligne de panier dont la quantité dépasse le stock (US STK-c).
 * 0 -> « Épuisé : retirez ce bijou pour valider. »
 * 2 -> « Plus que 2 disponibles : réduisez la quantité. »
 *
 * @param {number} stock - Exemplaires en stock.
 * @returns {string}
 */
export function formatStockWarning(stock) {
  if (stock <= 0) {
    return "Épuisé : retirez ce bijou pour valider.";
  }
  return `Plus que ${stock} ${stock > 1 ? "disponibles" : "disponible"} : réduisez la quantité.`;
}

/**
 * « 2026-10-20 08:47:34 » (DATETIME MySQL) -> « 20 octobre 2026 à 08:47 »
 *
 * @param {string} dateTime - Date renvoyée par l'API, heure locale du serveur.
 * @returns {string} - La date en toutes lettres, ou la valeur reçue si elle est illisible.
 */
export function formatDate(dateTime) {
  const date = new Date(String(dateTime).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) {
    return String(dateTime);
  }

  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

/**
 * Calcule une teinte stable à partir d'une chaîne, pour donner à chaque film un
 * visuel qui lui est propre sans charger la moindre image.
 */
export function teinteDepuisTexte(texte) {
  let somme = 0;

  for (const caractere of texte) {
    somme += caractere.codePointAt(0);
  }

  return somme % 360;
}
