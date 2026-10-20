# AGENTS.md — SAE301 Matira Création Click & Collect

## 0. Mission

Prototype full-stack et responsive de click & collect pour **Matira Création**
(bijouterie en perle de Tahiti, Papeete) : le client réserve en ligne, essaie et
règle au retrait en boutique. Le code part d'un starter de catalogue de films ;
le domaine film est remplacé progressivement par le domaine bijou (catégories,
produits, variantes, stock, commandes).

Le site doit fonctionner sur mobile, tablette et desktop, en conservant la
navigation, l'accessibilité, la sécurité et la séparation front/back existantes.

Liens (production, développement, GitHub, Figma, site de l'enseigne) : voir
`README.md`. Architecture, installation et analyse des user stories : voir
`README.md`.

## 1. Règles impératives

- Ne committe ni ne pousse jamais sans demande explicite (Git distant inclus).
- N'ajoute aucune dépendance ou outil de build sans justification et accord si
  l'impact est significatif.
- Ne versionne jamais de secret : seul `back/config/config.example.php` est
  commité, les identifiants réels restent sur le serveur.
- Ne renomme, ne déplace ni ne réorganise aucun fichier existant sans demande
  explicite. Respecte l'architecture en place.
- Avant une modification structurante, parcours le dépôt concerné (`front/`,
  `back/`, `sql/`, configurations) et les appelants ; après, valide avec les
  commandes adaptées.
- Si deux architectures raisonnables changent fortement le code, arrête-toi et
  demande.
- Ne code pas sans mon accord : je demande des fonctions ou fonctionnalités
  ponctuelles, pas de tout faire à ma place.
- **JAMAIS de `foreach`** (PHP comme JS).
- **JAMAIS de `fn` en PHP** : `function` classique.
- **JAMAIS de fonction fléchée en JavaScript** : `function` classique.
- JSDoc / PHPDoc sur toute fonction, méthode ou classe publique. Les
  commentaires n'expliquent que l'intention d'un choix non évident.
- Noms de méthodes et variables en anglais ; données métier et commentaires
  pédagogiques peuvent rester en français.
- HTML et CSS valides au validateur W3C.
- Test : `cd front/`, `npm run dev`, puis ouverture de l'URL affichée par Vite
  (config dans `front/vite.config.js`). `/api/...` est relayé vers l'API
  déployée.

## 2. Architecture

| Zone        | Rôle                                                   | Emplacement |
| ----------- | ------------------------------------------------------ | ----------- |
| Front       | SPA Vite, Tailwind CSS 4, routeur client               | `front/`    |
| Back        | API JSON PHP (`Core/`, `Controller/`, `Model/`, `routes.php`) | `back/` |
| Données     | Schéma et seeds SQL                                    | `sql/`      |
| Entrée HTTP | Réécriture `/api/...` vers PHP, le reste vers le front | `.htaccess` |

- Front : conserve le découpage `layouts/`, `pages/`, `ui/`, `data/`, `lib/`.
- Back : `back/index.php` reste le point d'entrée unique.
- Ne crée ni couche ni framework pour contourner cette structure.
- Le chemin de déploiement ne doit être défini qu'à deux endroits, identiques :
  `BASE` dans `front/vite.config.js` et `chemin` dans `back/config/config.php`.

## 3. MVC strict

Chaque page dynamique respecte le découpage, sans exception. En cas de doute
sur l'emplacement d'une fonction, demande plutôt que de mélanger les rôles.

| Rôle | Responsabilité | Interdit |
| ---- | -------------- | -------- |
| **M** Modèle | Données, appels, filtres et calculs ; reçoit des valeurs simples et **retourne des données**, jamais du HTML | Référencer `V`, toucher au DOM |
| **V** Vue | Templates, rendu, DOM, déclaration des événements ; reçoit les données en paramètre | Référencer `M`, logique métier, handler hors `C` |
| **C** Contrôleur | Orchestre M et V, charge les données, valide les actions, contient les handlers ; seul à référencer M et V | Accéder au DOM autrement que via `ev`, stocker les données |

- Un nouveau besoin se découpe ainsi : donnée ou calcul → M ; affichage ou
  événement → V ; réaction à l'événement → C.
- `C.init()` est le point d'entrée de la page (retourné au routeur dans le
  front modulaire).
- Conventions : `M.filter...`, `V.formatOne...`, `V.render...`, `V.init`,
  `C.init`, `C.handler_<action>(ev)`. Une fonction par propriété,
  précédée d'un commentaire `. paramètre` / `> valeur de retour` comme dans
  l'existant.
- Un composant UI reçoit ses données et signale l'action par callback. Une page
  se reconstruit depuis son état après une mutation importante.

## 4. Front-end

- ES modules et conventions existantes de `front/src/`.
- Délégation d'événements sur un ancêtre commun pour les éléments recréés.
- Toute donnée injectée dans un template est échappée ; `innerHTML` brut
  uniquement via les helpers existants.
- Appels réseau via `front/src/data/` et `front/src/lib/api-request.js`, en
  `async/await`, avec gestion explicite des erreurs et statuts HTTP.
- Le routeur garde les liens `data-link`, le `basename` Vite et la page 404.
- États visibles et accessibles : chargement, vide, erreur, succès,
  authentification, indisponibilité du stock.
- URL propres imposées par les user stories (catégorie, produit, admin).
- Prix en XPF, sans centimes, avec espaces insécables.

## 5. Design et responsive

- Respecte la charte Matira et les maquettes Figma (lien dans `README.md`) :
  interface claire, orientée produit, qui valorise les photos de bijoux.
- Les tokens (couleurs, typographie) viennent de la charte et sont définis dans
  le CSS du front : ne duplique pas de valeurs en dur, réutilise les tokens.
- Contraste AA obligatoire : n'utilise pas la couleur de marque claire comme
  couleur de texte sur fond blanc, prends le token de texte dédié.
- Mobile First, aucune casse entre 320 px et desktop. Vérifie au minimum
  320/375 px, 768 px et 1440 px quand l'UI change.
- Images : `alt`, ratio, lazy-loading si pertinent, état de chargement.
- Animations discrètes et utiles.

### Tailwind CSS 4

- Reste sur Tailwind v4 (`@tailwindcss/vite`) ; pas de Sass ni de CSS séparé.
- Tokens dans `@theme inline`, en séparant primitifs et sémantiques.
- Variables privées de composant (`--_bg`, `--_fg`…) ; les modifiers ne font
  que les réassigner.
- Classes écrites en entier pour la détection par le compilateur.

## 6. Back-end PHP

- `declare(strict_types=1)` dans chaque fichier ; tout est typé.
- Contrôleurs : valident et orchestrent. Modèles : interrogent la base.
  `Core/` : abstractions HTTP, DB, routage.
- Encapsulation `private`/`protected` ; abstraction et polymorphisme pour les
  comportements réellement partagés.
- Jamais de `foreach` : `for`, `while`, `array_map` ou équivalent explicite.
- Jamais de HTML renvoyé : JSON via `Response::json()` / `Response::erreur()`,
  avec code HTTP explicite et `exit`.

## 7. Données et sécurité

Respecte les décisions de l'analyse des user stories (`README.md`) :

- prix en entiers (XPF) ; stock porté par la variante (au moins une variante par
  produit) ;
- panier et lignes de commande identifiés par `variantId`, option choisie et
  prix unitaire figé ;
- commande validée dans une transaction SQL, numéro unique, décrément et
  journal du stock, recrédit à l'annulation ;
- seeds disponibles dès le début pour débloquer les écrans de lecture.

Obligatoire :

- requêtes PDO préparées ; liste blanche serveur pour tout identifiant SQL
  dynamique (`ORDER BY`, colonnes, filtres) ;
- `session_start()` une seule fois, après configuration du cookie (`Path`,
  `HttpOnly`, `Secure`, `SameSite`) et avant toute sortie ;
- `session_regenerate_id(true)` après connexion ou élévation de privilège ;
- mots de passe via `password_hash()` ;
- aucun rôle, droit, prix ou état de commande de confiance côté client ;
- validation serveur de quantité, variante, disponibilité, prix et état de
  commande ;
- écritures de commande et de stock atomiques, idempotentes si nécessaire,
  protégées contre la survente.

## 8. Ordre de réalisation

Suis l'ordre et le graphe de dépendances des user stories du `README.md`, sauf
décision explicite : ne commence pas une US dont les dépendances ne sont pas
terminées. Conserve la traçabilité interface ↔ API ↔ modèle SQL ↔ critères
d'acceptation ↔ validation. Une branche Git par user story
(`feature/<ID>-<nom>`), fusionnée dans `main` uniquement à ma demande.

## 9. Vérification obligatoire

À la fin de chaque requête : `node .agents/skills/verifier-mvc/scripts/check-mvc.js .`

## 10. Documentation

Toute documentation générée est pédagogique : sections numérotées, tableaux
récapitulatifs, check-lists et diagnostic.

## 11. Compte rendu après modification

<<<<<<< Updated upstream
Fournis un résumé clair et expliqué avec :

1. la liste des fichiers modifiés, créés ou supprimés avec leur chemin d'accès ;
2. le détail des modifications apportées avec les lignes ;
3. les éventuels points d'attention et/ou étapes suivantes recommandées, en
   respectant toujours l'ordre qui doit être suivi ;
4. les éventuels impacts sur le reste de l'application.
=======
1. Fichiers modifiés, créés ou supprimés (avec chemin).
2. Détail des modifications (avec lignes).
3. Points d'attention et prochaines étapes, dans l'ordre de la section 8.
4. Impacts sur le reste de l'application.
5. Commandes `git add`, `commit` et `push` à exécuter.
>>>>>>> Stashed changes
