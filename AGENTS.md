# AGENTS.md — SAE301 Matira Création Click & Collect

## 0. Mission du projet

Ce dépôt est un prototype full-stack de site web responsive de click & collect
pour **Matira Création**, bijouterie en perle de Tahiti installée au centre
Vaima, à Papeete ([matiracreation.com](https://www.matiracreation.com/)).
L'enseigne a un catalogue en ligne mais ni panier ni retrait en boutique : le
client réserve ses bijoux en ligne, les essaie et les règle au retrait.

Le code actuel est encore le catalogue de films pédagogique du starter : il
sert de base technique, mais le produit cible est une boutique de bijoux
(catégories, produits, variantes, stock, commandes).

Le résultat attendu doit fonctionner sur mobile, tablette et desktop. Il doit
conserver les principes de navigation, d'accessibilité, de sécurité et de
séparation front/back existants, tout en remplaçant progressivement le domaine
film par le domaine bijou.

Liens du projet :

| Ressource           | Lien                                                         |
| ------------------- | ------------------------------------------------------------ |
| Site en production  | https://mmi.unilim.fr/~segrestan1/SAE301-Starter/       |
| Site en développement | http://localhost:5173/~segrestan1/SAE301-Starter/     |
| Dépôt GitHub        | https://github.com/jujusgrtn/SAE301                          |
| Maquettes Figma     | https://www.figma.com/design/BF6DnP4noqun61O6jHr4MJ          |
| Site de l'enseigne  | https://www.matiracreation.com/                              |

Ne réorganise, ne renomme et ne déplace jamais un fichier existant sans demande
explicite. Respecte l'architecture présente avant de proposer une évolution.
Parcours l'intégralité du dépôt, y compris `front/`, `back/`, `sql/`, les
configurations et les sous-dossiers, avant une modification structurante.

## 1. Règles d'exécution impératives

- Ne committe et ne pousse jamais automatiquement. Le commit, le push et toute
  action Git distante ne sont effectués que si l'utilisateur le demande
  explicitement.
- Ne crée pas de dépendance, bibliothèque ou outil de build supplémentaire sans
  justification et accord lorsque l'impact est significatif.
- Ne modifie pas des secrets ou identifiants réels. Les valeurs sensibles
  (identifiants MySQL de `back/config/config.php`) restent sur le serveur et ne
  doivent jamais être ajoutées au dépôt : seul `config.example.php` est versionné.
- Avant une modification importante, lis les fichiers concernés et leurs
  appelants. Après modification, valide le comportement avec les commandes
  adaptées.
- Si deux architectures sont raisonnables et que le choix change fortement le
  code, arrête-toi et demande une décision.
- Les commentaires expliquent uniquement l'intention d'un choix non évident.
  Toute fonction, méthode ou classe publique doit être documentée en JSDoc ou
  PHPDoc.
- JAMAIS DE `foreach`.
- JAMAIS DE `fn` en PHP : toujours des `function` classiques simples.
- JAMAIS de fonctions fléchées (`=>`) en JavaScript : toujours des `function` classiques.
- Les noms de méthodes et variables sont en anglais dans le code ; les données
  métier et commentaires pédagogiques peuvent rester en français comme dans
  l'existant.
- Pour chaque test ou vérification : `cd front/`, puis `npm run dev`, puis
  ouverture de http://localhost:5173/~segrestan1/SAE301-Starter/ grâce à
  la config `vite.config.js` (si le port 5173 est pris, Vite affiche le port
  utilisé). Les requêtes `/api/...` sont relayées vers l'API déployée sur
  mmi.unilim.fr.
- Le HTML et le CSS doivent être valides au validateur du W3C.

## 2. Architecture actuelle à respecter

Le dépôt est un full-stack sans framework applicatif. Les chemins sont donnés
depuis la racine du dépôt (`~/public_html/SAE301-Starter/`, racine déployée sur
le serveur) :

| Zone        | Rôle                                                                          | Emplacement  |
| ----------- | ----------------------------------------------------------------------------- | ------------ |
| Front       | SPA Vite, Tailwind CSS 4, routeur client, pages et composants                 | `front/`     |
| Back        | API JSON PHP, routage, contrôleurs et accès PDO/MySQL                         | `back/`      |
| Données     | Schéma et seeds SQL, à faire évoluer vers catégories/produits/variantes/stock/commandes | `sql/` |
| Entrée HTTP | Réécriture `/api/...` vers PHP et du reste vers `front/dist/`                 | `.htaccess`  |

Le front conserve le découpage `layouts/`, `pages/`, `ui/`, `data/` et `lib/`.
Le back conserve `Core/`, `Controller/`, `Model/`, `routes.php` et son point
d'entrée `back/index.php`. Ne crée pas une nouvelle couche ou un nouveau
framework seulement pour contourner cette structure.

Le chemin du projet `/~segrestan1/SAE301-Starter/` apparaît à deux
endroits seulement et doit y rester identique : `BASE` dans
`front/vite.config.js` et `chemin` dans `back/config/config.php`.

### 2.1 Arborescence du dépôt

```text
SAE301-Starter/                 racine du dépôt = racine déployée sur le serveur
├── AGENTS.md                   règles du projet (ce document)
├── SKILL.md                    méthode de réalisation d'une US, avec exemples
├── MEMOIRE.md                  mémoire du projet : décisions, préférences, avancement, pièges (voir §12)
├── README.md                   présentation du starter d'origine (films), en partie obsolète
├── .htaccess                   point d'entrée HTTP
├── .gitignore                  node_modules, dist, config.php et uploads/produits exclus de Git
├── uploads/
│   ├── .htaccess               n'autorise que les fichiers .webp
│   └── produits/               photos envoyées depuis le back-office (créé à l'exécution, non versionné)
├── sql/
│   └── import.sql              schéma et données initiales
├── back/                       API PHP, ne renvoie que du JSON (voir 6.2)
│   ├── index.php               point d'entrée unique
│   ├── config/
│   │   ├── config.php          identifiants MySQL réels (non versionné)
│   │   ├── config.example.php  modèle versionné, sans identifiants
│   │   └── .htaccess           interdit l'accès depuis le navigateur
│   └── src/
│       ├── Core/               Request, Response, Router, Database
│       ├── Controller/         validation et orchestration
│       ├── Model/              accès à la base, règles métier, stockage des photos
│       ├── routes.php          table des routes de l'API
│       └── .htaccess           interdit l'accès depuis le navigateur
└── front/                      SPA Vite + Tailwind
    ├── index.html              document HTML initial
    ├── vite.config.js          chemin du projet, proxy de développement
    ├── public/images/produits/ photos du catalogue d'origine (800 px et 400 px)
    ├── src/
    │   ├── main.js             routes et layout
    │   ├── global.css          Tailwind, tokens de la charte, thème sombre
    │   ├── layouts/            structures de page (en-tête, menu, compteur du panier)
    │   ├── pages/              une page par route : page.js (M/V/C) + templates .html
    │   ├── ui/                 composants réutilisables : index.js + template.html
    │   ├── data/               appels à l'API, un module par ressource
    │   └── lib/                routeur, rendu des templates, requêtes, formats, images
    └── dist/                   résultat de npm run build (non versionné)
```

### 2.2 Installation, développement et déploiement

**Installation**

1. Importer `sql/import.sql` dans la base depuis phpMyAdmin (base sélectionnée,
   onglet « Importer »). ⚠️ L'import est rejouable parce qu'il commence par des
   `DROP TABLE` : il **supprime et recrée** toutes les tables du projet
   (comptes, réservations et stocks compris). Ne jamais le rejouer sur une base
   qui contient des données à conserver ; pour ajouter une table, exécuter
   seulement son `CREATE TABLE` dans l'onglet « SQL ». Les tables `film` et
   `genre` du starter ne sont pas touchées.
2. Copier `back/config/config.example.php` en `back/config/config.php`, puis y
   renseigner les identifiants MySQL et le chemin du projet
   (`/~votre_login/SAE301-Starter/`).
3. Dans `front/vite.config.js`, donner à `BASE` **exactement** le même chemin.
4. Dans `front/` : `npm install`.

**Développement**

```bash
cd front
npm run dev
```

Le front est servi par Vite à `http://localhost:5173/~votre_login/SAE301-Starter/`.
Le proxy de `vite.config.js` relaie `/api` et `/uploads` vers l'API déployée sur
`mmi.unilim.fr`, sous le même chemin : pour le navigateur, front et API sont un
seul site, donc les cookies de session sont acceptés et renvoyés. Utiliser
Chrome ou Firefox : les cookies sont `Secure`, et Safari peut les refuser sur
`http://localhost`.

**Déploiement**

```bash
cd front
npm run build
```

Le dépôt est déployé tel quel dans `~/public_html/SAE301-Starter/` : `.htaccess`,
`back/`, `uploads/.htaccess` et `front/dist/` (jamais `front/node_modules/`). Le
`.htaccess` sert les fichiers de `front/dist/` et répond `front/dist/index.html`
à toute autre adresse : c'est le routeur du front qui affiche la bonne page ou
la 404.

⚠️ Sur le serveur de l'IUT, le dossier de travail **est** le dossier déployé :
toute modification de `back/` est en production dès qu'elle est enregistrée. Une
route qui dépend d'une table absente répond 500 tant que la table n'est pas
créée ; le front, lui, n'est mis à jour qu'après `npm run build`.

**Comptes de test** (jeu de données de `sql/import.sql`)

| Compte | Identifiant | Mot de passe | Où se connecter |
| --- | --- | --- | --- |
| client (table `utilisateur`) | `client@matira.test` | `Matira2026!` | `/connexion` |
| administrateur (table `administrateur`) | `admin` | `MatiraAdmin2026!` | `/admin` |

### 2.3 Diagnostic rapide

| Symptôme | Cause probable et vérifications |
| --- | --- |
| « Not Found » ou liste de dossier sur la racine | `.htaccess` non déposé, ou `front/dist/` absent : lancer `npm run build` depuis `front/` |
| Page blanche, assets en 404 | `BASE` de `vite.config.js` différent du dossier de dépôt ; relancer `npm run build` |
| Route front (`/admin`…) en 404 après rechargement | `.htaccess` ne renvoie pas vers `front/dist/index.html` |
| API en 404 en développement | proxy Vite, ou back absent du serveur ; vérifier `BASE` |
| Catalogue vide ou erreur de chargement | identifiants de `back/config/config.php`, base non importée |
| Connexion ou panier perdus à chaque requête | `chemin` de `config.php` différent de `BASE` (le cookie de session n'est pas renvoyé) |
| Erreur 500 juste après une US qui touche au SQL | table ou colonne absente de la base : exécuter son `CREATE TABLE` (voir 2.2) |
| Photo envoyée cassée (image absente) | règle `uploads/` du `.htaccess`, ou dossier `uploads/produits/` non inscriptible par PHP |
| `npm` introuvable `package.json` | se placer dans `front/` avant `npm run dev` ou `npm run build` |
| `git push` : `ECONNREFUSED …vscode-git-….sock` | terminal ouvert dans une ancienne session VS Code : en ouvrir un nouveau |

## 3. MVC strict

Pour chaque page dynamique, respecter strictement :

- **M — Modèle** : état de la page, données reçues, appels et transformations
  métier. Il ne référence jamais la Vue et ne touche jamais au DOM.
- **V — Vue** : templates, rendu, accès DOM et déclaration des événements. Elle
  reçoit les données en paramètre et ne référence jamais le Modèle.
- **C — Contrôleur** : orchestre M et V, charge les données, valide les actions
  et contient les handlers. C est le seul objet qui référence M et V.

En JavaScript vanilla, `C.init()` est appelé après toutes les déclarations
comme point d'entrée de la page. Dans le front modulaire actuel, la fonction de
page peut retourner `C.init()` au routeur, mais la séparation M/C/V reste
obligatoire.

Lorsqu'une fonctionnalité est ajoutée, la découper ainsi :

1. donnée, règle ou calcul → M ;
2. affichage, template ou écouteur → V ;
3. réaction à l'action → C.

Un composant UI ne décide pas de la donnée à afficher : il reçoit ses données
et signale l'action via des callbacks. Une page est reconstruite depuis son
état après une mutation importante ; évite les modifications DOM dispersées.

**Toute modification ou ajout respecte strictement ce découpage.** En cas de doute
sur l'emplacement d'une fonction, s'arrêter et demander plutôt que de mélanger les rôles.

```
data (M) ----get----
                    |
                 C (Contrôleur) ------> page web
                    |
template (V) --get--
```

### M — le Modèle : les données et leur manipulation

- Contient les données de l'application (`M.products`) et les fonctions qui les lisent,
  filtrent ou transforment (`M.filterProducts(byCategory)`).
- Ses fonctions reçoivent des valeurs simples en paramètre et **retournent des données**
  (tableaux, objets), jamais du HTML.
- **Interdit :** toute référence à `V`, tout accès au DOM (`document`, `window`, éléments HTML,
  événements).
- Autorisé : appeler `C` si besoin.

### V — la Vue : la page web

- Seul endroit où l'on touche au DOM : `document.querySelector`, lecture des `<template>`,
  `innerHTML`, `addEventListener`.
- `V.formatOne...(valeur)` remplit un template (`{{nom}}` → valeur) et retourne une chaîne.
- `V.render...(data)` reçoit les données **en paramètre** et les affiche ; elle ne décide
  pas quelles données afficher.
- `V.init()` enregistre les événements à surveiller et leur associe un gestionnaire de `C`.
- **Interdit :** toute référence à `M`, toute logique métier (filtrer, trier, calculer sur les
  données), tout gestionnaire d'événement qui ne soit pas une méthode de `C`.

### C — le Contrôleur : le lien entre M et V

- `C.init()` lance l'application : initialise la Vue (et le Modèle s'il en a besoin), puis fait
  le premier affichage. L'appel `C.init();` en dernière ligne est l'unique point d'entrée.
- `C.handler_<action>(ev)` gère un événement : lit l'information utile dans `ev`
  (ex. `ev.target.dataset.category`), interroge ou met à jour `M`, puis appelle `V` pour
  rafraîchir l'affichage.
- C est le seul objet autorisé à référencer à la fois `M` et `V`.
- **Interdit :** accéder au DOM autrement que par l'objet `ev` reçu ; stocker les données de
  l'application (elles vont dans `M`).

### Conventions à suivre

- Une fonction par propriété : `M.xxx = function(...) { ... }`, précédée d'un commentaire
  qui donne ses paramètres (`. paramètre ...`) et sa valeur de retour (`> valeur de retour ...`),
  comme dans le code existant.
- Noms : `M.filter...`, `V.formatOne...`, `V.render...`, `V.init`, `C.init`, `C.handler_clickOn...`.
- Un nouveau besoin se découpe toujours ainsi : donnée ou calcul → M ; affichage ou
  événement → V ; réaction à l'événement → C.

## 4. Front-end JavaScript

- Utilise ES modules et les conventions déjà présentes dans `front/src/`.
- Privilégie la délégation d'événements sur un ancêtre commun lorsque des
  éléments sont recréés dynamiquement.
- Toutes les données injectées dans un placeholder doivent être échappées.
  N'utilise `innerHTML` brut que via les helpers existants et jamais avec une
  valeur utilisateur non échappée.
- Les appels réseau passent par `front/src/data/` et
  `front/src/lib/api-request.js`, avec `async/await`, gestion explicite des
  erreurs et des statuts HTTP.
- Le routeur doit conserver les liens `data-link`, le `basename` Vite et la
  page 404.
- Les états loading, vide, erreur, succès, authentification et indisponibilité
  du stock doivent être visibles et accessibles.
- URL propres imposées par les user stories : `/categorie/nom-categorie`
  (DEC-a), `/produit/nom-produit` (DEC-c), `/admin` (GOF-b).
- Les prix sont en francs pacifiques (XPF), sans centimes : affichage
  `14 900 XPF`, avec espaces insécables.

## 5. Design responsive et direction artistique

Le site respecte la charte graphique de Matira Création et les maquettes Figma
du projet (voir le lien en section 0) :

- interface claire et lumineuse, orientée produit, qui met en valeur les
  photos de bijoux et la perle de Tahiti ;
- logo Matira Création (feuille de palmier, MATIRA / CRÉATION) en turquoise
  sur fond clair, en blanc sur fond turquoise ;
- bandeau supérieur turquoise rappelant le retrait gratuit au centre Vaima,
  navigation par catégories (Plaqué or, Acier, Homme…) utilisable au clavier ;
- typographie **Raleway** ;
- palette de la charte :

| Token                | Valeur    | Usage                                              |
| -------------------- | --------- | -------------------------------------------------- |
| Turquoise 500        | `#4DC5C1` | couleur de marque, accents, bordures actives       |
| Turquoise 700        | `#1C7C78` | textes et liens turquoise, boutons (contraste AA)  |
| Turquoise 50 / 100   | `#F1FAF9` / `#DDF3F2` | fonds doux                             |
| Jaune 400            | `#E5E337` | accent ponctuel (compteur du panier)               |
| Nacre 50 / 100       | `#FAF7F2` / `#F2ECE3` | fonds chauds                           |
| Gris 900 / 600 / 300 | `#1C1C1C` / `#5B6162` / `#D5DCDC` | texte, texte secondaire, bordures |
| Vert 700 / Rouge 700 | `#23683A` / `#A3261E` | états succès / erreur, stock           |

- le turquoise `#4DC5C1` ne sert jamais de couleur de texte sur fond blanc
  (contraste insuffisant) : utiliser `#1C7C78` ;
- cartes produit : photo carrée, catégorie en petites capitales turquoise,
  nom, prix, badge de stock ;
- contrastes conformes à l'accessibilité, animations discrètes et utiles ;
- grilles et composants Mobile First : deux colonnes de produits sur mobile,
  composition intermédiaire tablette, grille et navigation étendues desktop ;
- aucune largeur, image ou interaction ne doit casser entre 320 px et desktop ;
- les images doivent prévoir `alt`, ratio, lazy-loading lorsque pertinent et
  état de chargement.

Le responsive est une contrainte fonctionnelle, pas une finition. Vérifie au
minimum les vues à 320/375 px, 768 px et 1440 px lorsque l'UI est modifiée.
Utilise Tailwind en Mobile First et garde les classes écrites en entier pour
que le compilateur les détecte.

### CSS, Tailwind et Sass

- Le projet actuel utilise Tailwind CSS 4 via `@tailwindcss/vite`.
- Configure les tokens dans `@theme inline`, en séparant tokens primitifs et
  tokens sémantiques.
- Utilise des variables CSS privées de composant (`--_bg`, `--_fg`, etc.) ;
  les modifiers ne font que réassigner les variables.
- Ne pas introduire Sass ni de CSS classique séparé : on reste sur Tailwind v4.
- Architecture Tailwind v4 à respecter (exemple avec la charte Matira) :

```css
@import "tailwindcss";

@theme inline {
  --color-primary: var(--clr-primary);
  --color-primary-text: var(--clr-primary-text);
}

@layer base {
  :root {
    /* Tokens primitifs (couleurs de base) */
    --clr-turquoise-500: #4dc5c1;
    --clr-turquoise-700: #1c7c78;
    --clr-jaune-400: #e5e337;

    /* Tokens sémantiques (ils disent à quoi ils servent) */
    --clr-primary: var(--clr-turquoise-500);
    --clr-primary-text: var(--clr-turquoise-700);
    --clr-cart-badge: var(--clr-jaune-400);
  }
}

.bouton--white {
  --clr-text-btn: var(--clr-turquoise-700);
}
```

## 6. Back-end PHP

### 6.1 Règles de code

- `declare(strict_types=1)` dans chaque fichier PHP.
- Conserve `back/index.php` comme point d'entrée unique : autoload,
  configuration, connexion, session, contrôleurs et routeur.
- Les contrôleurs valident la requête et orchestrent ; les modèles interrogent
  la base ; `Core/` contient les abstractions HTTP, DB et routage.
- Type toutes les propriétés, paramètres et valeurs de retour.
- Encapsule l'état avec `private`/`protected`, getters/setters validants et
  fluent setters uniquement lorsqu'ils correspondent au besoin.
- Préfère abstraction et polymorphisme pour les comportements réellement
  partagés.
- N'utilise jamais `foreach` ; utilise `for`, `while`, `array_map` ou un autre
  itérateur explicite.
- Ne renvoie jamais de HTML depuis l'API : les réponses restent JSON via
  `Response::json()` ou `Response::erreur()`.

### 6.2 Les couches du back

| Couche | Dossier | Rôle | Ne fait pas |
| --- | --- | --- | --- |
| Point d'entrée | `back/index.php` | autoload, configuration, connexion, assemblage des dépendances, session, routeur | aucune logique métier |
| Routes | `back/src/routes.php` | table `'MÉTHODE /api/chemin' => [Contrôleur::class, 'méthode']` | — |
| Core | `back/src/Core/` | abstractions HTTP, base et routage, sans règle métier | connaître un bijou, un panier ou une commande |
| Contrôleurs | `back/src/Controller/` | valident la requête, vérifient les droits, orchestrent, choisissent le code HTTP | écrire du SQL |
| Modèles | `back/src/Model/` | requêtes préparées, transactions, règles métier, stockage des photos | lire la requête HTTP ou répondre |

### 6.3 Démarrage d'une requête (`back/index.php`)

1. `declare(strict_types=1)`, puis autoload des classes `App\` depuis `back/src/`.
2. Chargement de `back/config/config.php` (`chemin`, `bdd`, `debug`).
3. Dans un `try` : toute exception non prévue devient une réponse JSON **500**
   (détaillée si `debug` vaut `true`, générique sinon) ; `display_errors` reste à `0`
   pour ne jamais casser le JSON.
4. Connexion PDO (`Database::connexion`), puis **assemblage explicite** des
   contrôleurs : chaque contrôleur reçoit ses modèles dans son constructeur,
   chaque modèle reçoit le PDO. Aucune injection automatique : tout se lit dans
   `index.php`.
5. Chargement de `routes.php`.
6. Réglage **unique** du cookie de session (`Path` = `chemin`, `HttpOnly`,
   `Secure`, `SameSite=Lax`), puis `session_start()`.
7. `Router::traiter(Request::depuisGlobals())`.

### 6.4 `Core/`

| Classe | Rôle et points à connaître |
| --- | --- |
| `Request` | méthode, chemin à partir de `/api/`, paramètres de requête (`parametre()`), corps (`corps()`) : le **JSON** reçu, ou les champs d'un formulaire **multipart** ; `fichier('photo')` donne un fichier envoyé ; `envoiRefuse()` signale un corps rejeté par PHP (au-delà de `post_max_size`, `$_POST` et `$_FILES` arrivent vides sans erreur) |
| `Response` | `json($donnees, $statut)` et `erreur($message, $statut)` terminent le script par `exit` : le code écrit après n'est jamais exécuté. Cookies à poser **avant** |
| `Router` | compare `MÉTHODE /api/chemin` à la table des routes ; **pas de paramètre dans le chemin** : l'identifiant ou le slug passent en paramètre de requête (`/api/produit?slug=…`) ou dans le corps ; route inconnue → 404 JSON |
| `Database` | PDO en `ERRMODE_EXCEPTION`, `FETCH_ASSOC`, `utf8mb4`, et `ATTR_EMULATE_PREPARES` à `false` : **un même marqueur nommé ne peut pas apparaître deux fois** dans une requête (utiliser deux noms distincts) |

### 6.5 Routes de l'API

| Route | Contrôleur::méthode | Accès | Effet |
| --- | --- | --- | --- |
| `GET /api/produits` (`?categorie=slug`) | `ProductController::index` | public | catalogue, ou bijoux d'une catégorie (400 slug mal formé, 404 inconnu) |
| `GET /api/produit?slug=` | `ProductController::show` | public | fiche d'un bijou : photos, variantes, stock |
| `GET /api/categories` | `CategoryController::index` | public | arbre catégories → sous-catégories |
| `GET /api/panier` | `CartController::show` | session | contenu du panier, recalculé depuis la base |
| `POST /api/panier/ajouter` | `CartController::add` | session | ajoute des exemplaires (400 requête invalide, 404 variante absente, 409 stock insuffisant) |
| `POST /api/panier/modifier` | `CartController::update` | session | fixe la quantité d'une ligne, 0 la retire (404 ligne absente, 409 si la hausse dépasse le stock) |
| `POST /api/panier/retirer` | `CartController::remove` | session | retire une ligne |
| `GET /api/compte` | `AccountController::show` | public | client connecté, ou `connecte: false` (toujours 200) |
| `POST /api/compte/connexion` | `AccountController::login` | public | connexion (401 sans préciser si c'est l'e-mail ou le mot de passe) |
| `POST /api/compte/inscription` | `AccountController::register` | public | crée le compte et connecte (201 ; 400 champ refusé, 409 e-mail déjà utilisé) |
| `POST /api/compte/deconnexion` | `AccountController::logout` | public | détruit la session, panier compris |
| `POST /api/compte/modifier` | `AccountController::update` | client | JSON `{ prenom, nom, email }` ; renvoie l'état de connexion à jour (401 ; 400 champ refusé ; 409 e-mail d'un autre compte) |
| `POST /api/compte/mot-de-passe` | `AccountController::changePassword` | client | JSON `{ motDePasseActuel, nouveauMotDePasse }` : le mot de passe **actuel est exigé** (401 ; 400 actuel faux, nouveau invalide ou identique) ; l'identifiant de session est renouvelé |
| `GET /api/commandes` (`?statut=&du=&au=&page=`) | `OrderController::index` | client | historique **du client connecté**, récentes d'abord, 10 par page ; `du` et `au` (AAAA-MM-JJ, jours inclus) bornent la date ; renvoie `total`, `page`, `pages` et les effectifs par statut (401 ; 400 statut, date ou page invalide, ou `du` après `au`) ; une page trop loin est ramenée à la dernière |
| `POST /api/commandes` | `OrderController::create` | client | valide le panier en une transaction (401, 400 panier vide, 409 stock) |
| `POST /api/commandes/reutiliser` | `OrderController::reorder` | client | JSON `{ numero }` : « Commander à nouveau », ajoute au panier ce qui est disponible d'une réservation **du client** ; renvoie `panier` et `resultat` (une ligne par bijou : `ajoutee`, `partielle`, `limite`, `epuisee`, `retiree`, avec l'ancien et le nouveau prix s'il a changé) (401 ; 400 numéro mal formé ; 404 absente ou d'un autre client) |
| `GET /api/commande?numero=` | `OrderController::show` | client | une réservation **du client connecté** (404 si elle appartient à un autre) |
| `GET /api/admin/compte` | `AdminController::show` | admin (401 sinon) | administrateur connecté |
| `POST /api/admin/connexion` | `AdminController::login` | public | connexion au back-office |
| `POST /api/admin/deconnexion` | `AdminController::logout` | public | ferme la session d'administration |
| `GET /api/admin/produits` | `AdminProductController::index` | admin | liste des bijoux |
| `GET /api/admin/produit?id=` | `AdminProductController::show` | admin | un bijou pour le formulaire de modification |
| `POST /api/admin/produits/creer` | `AdminProductController::create` | admin | crée un bijou ; multipart : champs + photo facultative (201) |
| `POST /api/admin/produits/modifier` | `AdminProductController::update` | admin | modifie un bijou ; multipart, avec `id` (404 absent, 409 plusieurs options) |
| `POST /api/admin/produits/supprimer` | `AdminProductController::remove` | admin | suppression en cascade (JSON `{ id }`) |
| `GET /api/admin/categories` | `AdminCategoryController::index` | admin | arbre des catégories avec le nombre de sous-catégories et de bijoux |
| `POST /api/admin/categories/creer` | `AdminCategoryController::create` | admin | JSON `{ nom, description?, parentId? }` : catégorie principale, ou sous-catégorie si `parentId` (201 ; 400 champ refusé ou parent qui n'est pas une catégorie principale) |
| `POST /api/admin/categories/modifier` | `AdminCategoryController::update` | admin | JSON `{ id, nom, description? }` ; le slug et la place ne changent pas (404 absente) |
| `POST /api/admin/categories/deplacer` | `AdminCategoryController::move` | admin | JSON `{ id, sens }`, `sens` = `haut` ou `bas` : échange avec la voisine du même niveau, renvoie l'arbre à jour (404 absente) |
| `POST /api/admin/categories/supprimer` | `AdminCategoryController::remove` | admin | refusée (409) tant que la catégorie contient des sous-catégories ou des bijoux ; renvoie l'arbre à jour |
| `GET /api/admin/commandes` | `AdminOrderController::index` | admin | réservations de tous les clients, récentes d'abord ; `?statut=` filtre (400 statut inconnu) ; renvoie aussi les effectifs par statut |
| `GET /api/admin/commande?numero=` | `AdminOrderController::show` | admin | une réservation avec client, lignes et statuts accessibles (`transitions`) |
| `POST /api/admin/commandes/statut` | `AdminOrderController::changeStatus` | admin | JSON `{ numero, statut }` ; annuler rend au stock ce que le journal a enregistré (`stockRendu`) ; 409 si le passage n'est pas permis |

### 6.6 Contrôleurs, modèles et dépendances

| Contrôleur | Modèles utilisés | Rôle des modèles |
| --- | --- | --- |
| `ProductController` | `ProductModel`, `CategoryModel` | lecture des bijoux ; résolution du slug de catégorie |
| `CategoryController` | `CategoryModel` | arbre du menu |
| `CartController` | `VariantModel`, `Cart` | `Cart` : panier en session (quantités, limite de 10, résumé) ; `VariantModel` : prix et stock lus en base |
| `AccountController` | `UserModel` | comptes clients (mot de passe haché bcrypt), profil et changement de mot de passe |
| `OrderController` | `OrderModel`, `UserModel`, `VariantModel` | `OrderModel` : transaction de réservation, historique paginé et filtré du client, lignes à réutiliser ; `VariantModel` : relecture du panier après un transfert |
| `AdminController` | `AdminModel` | comptes administrateurs |
| `AdminAreaController` (abstrait) | `AdminModel` | `requireAdmin()` : accès décidé par la session **et** la base à chaque requête |
| `AdminProductController` (hérite de `AdminAreaController`) | `ProductModel`, `AdminProductModel`, `CategoryModel`, `ProductImageStorage` | lecture, écriture, photos |
| `AdminCategoryController` (hérite de `AdminAreaController`) | `AdminCategoryModel` | arbre avec effectifs, création, modification, ordre, suppression |
| `AdminOrderController` (hérite de `AdminAreaController`) | `AdminOrderModel`, `StockModel` | réservations, changement de statut, recrédit du stock à l'annulation |

Modèles transverses : `StockModel` (décrément à la réservation, ajustement manuel, **journal** `mouvement_stock`
dans la même transaction que l'opération), `Stock` (règle unique de disponibilité : seuil de stock faible),
`StockException` (stock insuffisant → **409**), `CategoryInUseException` (catégorie encore utilisée → **409**), `OrderStatus` (statuts et transitions permises, seule source
de ces règles) et `OrderTransitionException` (passage de statut non permis → **409**),
`Reorder` (règle de « Commander à nouveau » : quoi transférer au panier selon le stock, la limite par bijou et les bijoux supprimés), `Slug` (slug d'URL à partir d'un nom, longueur maximale selon la colonne), `ProductImageStorage`
(contrôle, conversion et suppression des photos envoyées).

### 6.7 Session, accès et codes HTTP

| Clé de `$_SESSION` | Contenu | Écrite par |
| --- | --- | --- |
| `panier` | `{ variantId => quantité }` | `CartController` |
| `clientId` | identifiant du client connecté | `AccountController` |
| `adminId` | identifiant de l'administrateur connecté | `AdminController` |

- Seul un **identifiant** est rangé en session ; l'identité est relue en base à chaque requête.
- Connexion : `session_regenerate_id(true)` puis écriture de la clé. Déconnexion : session détruite.
- Le front n'envoie jamais de prix ni d'identité : le serveur relit tout en base.

| Code | Sens dans le projet |
| --- | --- |
| 200 / 201 | succès / ressource créée |
| 400 | requête mal formée ou champ refusé (message destiné à l'utilisateur) |
| 401 | non connecté (client ou administrateur) |
| 403 | connecté sans le droit |
| 404 | ressource absente, **ou appartenant à un autre** (on ne révèle rien) |
| 409 | conflit avec l'état du serveur : stock insuffisant, e-mail déjà utilisé, catégorie encore utilisée, changement de statut non permis |
| 500 | erreur interne |

### 6.8 Base de données et fichiers

| Table | Contenu | Effet de la suppression d'une ligne |
| --- | --- | --- |
| `categorie` | catégories (`parent_id` NULL) et sous-catégories | refusée (`RESTRICT`) tant qu'elle a des sous-catégories ou des bijoux |
| `produit` | bijou : nom, slug, description, prix (entier XPF), sous-catégorie | supprime ses variantes et ses photos (`CASCADE`) |
| `variante` | option du bijou (« Modèle unique »), **porte le stock** | les lignes de commande et le journal gardent leurs données, `variante_id` passe à `NULL` |
| `image_produit` | photos ; `ordre` 0 = photo principale | — |
| `utilisateur` · `administrateur` | comptes clients · comptes du back-office | un client est refusé (`RESTRICT`) tant qu'il a des réservations |
| `commande` · `ligne_commande` | réservation (`MC-AAAA-NNNNN`) et lignes à nom et prix figés | supprime ses lignes (`CASCADE`) ; `commande_id` passe à `NULL` dans le journal |
| `mouvement_stock` | journal : variation signée, stock résultant, motif (`reservation`, `annulation`, `ajustement`) | — |

Photos : celles du catalogue d'origine sont dans `front/public/images/produits/` (nom simple dans
`image_produit.fichier`) ; celles envoyées depuis le back-office sont dans `uploads/produits/`
(`uploads/produits/nom` dans `fichier`), hors de `front/dist/` que `npm run build` vide. Chaque photo existe
en deux tailles : `<fichier>.webp` (800 px) et `<fichier>-400.webp` (400 px).

### 6.9 Ajouter une route

- [ ] Méthode du modèle (requête préparée, ligne SQL → tableau typé) dans `back/src/Model/`.
- [ ] Méthode du contrôleur : validation, droits, orchestration, `Response::json()` / `Response::erreur()`.
- [ ] Ligne dans `back/src/routes.php`.
- [ ] Contrôleur et modèles créés dans `back/index.php` s'ils sont nouveaux.
- [ ] Table ou colonne nouvelle : `CREATE TABLE` ajouté à `sql/import.sql` **et** exécuté sur la base (2.2).
- [ ] `php -l` sur les fichiers touchés ; essai avec une vraie session (voir `SKILL.md`, section 7).

### 6.10 Héritage du starter (films)

Le catalogue de films du starter subsiste : `CatalogueController`, `FilmModel` et la route `GET /api/films`.
`AuthController` et `StatsController` ne sont plus ni routés ni enregistrés dans `index.php`. Ces fichiers sont
à supprimer lorsque le domaine films sera retiré, sur demande.

## 7. Données, commandes et sécurité

Le modèle métier préserve les décisions suivantes, issues de l'analyse des
user stories :

- tables `categorie`, `produit`, `variante`, `image_produit`, puis commandes ;
- au moins 3 catégories de 4 bijoux, tirés du catalogue de matiracreation.com ;
- prix stockés en entiers (XPF, sans centimes) ;
- une variante par produit au minimum (« Modèle unique » pour un bijou sans
  option), avec stock porté par la variante ; les options des bijoux sont par
  exemple le coloris de la perle ou la taille de bague ;
- panier et lignes de commande identifiés par `variantId`, avec option choisie
  et prix unitaire figé ;
- validation de commande dans une transaction SQL dès la première version ;
- numéro de commande unique (ex. `MC-2026-00042`), statut initial « en cours » ;
- décrément et journal du stock à la validation, recrédit lors de l'annulation ;
- authentification par session serveur et rôle non fiable côté client ;
- seeds disponibles dès le début pour débloquer les écrans de lecture.

Règles obligatoires :

- requêtes PDO préparées pour les valeurs ;
- liste blanche serveur pour tout identifiant SQL dynamique (`ORDER BY`,
  colonnes, filtres structurants) ;
- `session_start()` une seule fois, après configuration du cookie (`Path`,
  `HttpOnly`, `Secure`, `SameSite`) et avant toute sortie ;
- `session_regenerate_id(true)` après connexion réussie ou élévation de
  privilège ;
- mots de passe hachés avec `password_hash()` (bcrypt) ;
- aucun rôle, droit, prix ou état de commande de confiance dans un cookie ;
- réponses JSON centralisées avec code HTTP explicite et terminaison via `exit` ;
- validation serveur de toute quantité, variante, disponibilité, prix et état
  de commande ; le front ne fait jamais foi ;
- les écritures de commande et de stock sont atomiques, idempotentes lorsque
  nécessaire et protégées contre la survente.

## 8. Ordre de réalisation métier

Respecte l'ordre suivant, issu de l'analyse des user stories, sauf décision
explicite :

1. Fondations : dépôt, schéma (catégories, produits, variantes, images),
   seeds Matira, layout et tokens de la charte ;
2. `DEC-b` catalogue de produits ;
3. `DEC-a` navigation par catégories ;
4. `DEC-c` détail d'un produit — epic « Découvrir l'offre » terminé ;
5. `CMD-b` panier d'achat ;
6. `CMD-c` authentification ;
7. `CMD-a` validation de commande — jalon 1, parcours d'achat complet ;
8. `STK-b` affichage des stocks ;
9. `STK-c` contraintes de stock ;
10. `STK-a` décrément et journal du stock ;
11. `GOF-b` back-office ;
12. `GOF-a` gestion des produits, puis `GOF-c` gestion des catégories — jalon 2 ;
13. `PIL-b` gestion des commandes, avec `STK-a` recrédit à l'annulation ;
14. `SUI-b`, `SUI-c`, puis `SUI-a` ;
15. `OPT-c`, puis `OPT-b`, puis `OPT-a` — jalon 3 ;
16. `PIL-a` statistiques ;
17. `PRO-a/b/c` uniquement en bonus, après stabilisation.

Ne commence pas une US si ses dépendances du graphe ne sont pas terminées,
sauf demande explicite. Pour chaque US, conserve la traçabilité entre
interface, API, modèle SQL, critères d'acceptation et validation. Une branche
Git par user story (`feature/DEC-b-catalogue`…), fusionnée dans `main` une
fois terminée, uniquement à ma demande.

Ne code pas sans mon accord et mes demandes. Je te demande de coder des
fonctions ou fonctionnalités par-ci par-là, pas de tout faire à ma place.

## 9. Vérification obligatoire

Toujours à la fin de chaque requête, vérifier le découpage :
`node .agents/skills/verifier-mvc/scripts/check-mvc.js .`

## 10. Documentation et compte rendu

Toute documentation générée doit être pédagogique : sections numérotées,
tableaux récapitulatifs, check-lists et diagnostic.

## 11. Après chaque modification

Fournis un résumé clair et expliqué avec :

1. la liste des fichiers modifiés, créés ou supprimés avec leur chemin d'accès ;
2. le détail des modifications apportées avec les lignes ;
3. les éventuels points d'attention et/ou étapes suivantes recommandées, en
   respectant toujours l'ordre qui doit être suivi ;
4. les éventuels impacts sur le reste de l'application.
5. Les commandes a exécuter pour add, commit et push les modifications.
6. Ce qu'il faudrait ajouter dans `AGENTS.md`, `SKILL.md` et `MEMOIRE.md` (§12), sans les modifier : la personne qui développe les met à jour elle-même, sur `main`.

## 12. Mémoire du projet (`MEMOIRE.md`)

`MEMOIRE.md`, à la racine, est la mémoire du projet : tout ce qu'un agent doit savoir pour reprendre le
travail sans tout redécouvrir. Il est versionné avec le code. Il ne remplace ni ce document (les règles)
ni `SKILL.md` (la méthode).

| Quand | Obligation |
| --- | --- |
| Début de session, avant toute tâche non triviale | lire `MEMOIRE.md` en entier |
| Fin de chaque tâche, avec le compte rendu du §11 | **ne pas modifier** `MEMOIRE.md` (ni `AGENTS.md`, ni `SKILL.md`) pendant une US : ils vivent sur `main`, pas sur les branches d'US ; lister dans le compte rendu ce qui servira plus tard (décision, préférence, piège, point en attente, avancement). Les mettre à jour seulement sur demande, avec la date en tête |

Règles de contenu :

- Chaque entrée est courte, vérifiable et datée par une **date absolue** (jamais « hier », « la semaine dernière »).
- Pas de doublon avec `AGENTS.md` ou `SKILL.md` : renvoyer vers eux.
- **Aucun secret** : ni mot de passe, ni jeton, ni identifiant réel. Le dépôt est sur GitHub.
- Une entrée devenue fausse est corrigée ou supprimée, jamais laissée. En cas de contradiction avec le code, le code fait foi.
- La personne qui développe n'est jamais désignée par un pronom genré : écrire « la personne qui développe » ou « l'équipe ».
- Le commit de `MEMOIRE.md` suit la règle du §1 : l'agent ne commite pas, il donne la commande.

Check-list de fin de tâche :

- [ ] une décision, une préférence ou un piège nouveau → listé dans le compte rendu (et ajouté à la bonne section de `MEMOIRE.md` seulement sur demande)
- [ ] l'avancement (§5) et les points en attente (§7) reflètent l'état réel
- [ ] la date « Dernière mise à jour » est celle du jour
- [ ] `MEMOIRE.md` ne contient aucun secret
