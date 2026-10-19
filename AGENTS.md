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
| Site en production  | https://mmi.unilim.fr/~segrestan1/SAE301-Starter/Base/       |
| Site en développement | http://localhost:5173/~segrestan1/SAE301-Starter/Base/     |
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
  ouverture de http://localhost:5173/~segrestan1/SAE301-Starter/Base/ grâce à
  la config `vite.config.js` (si le port 5173 est pris, Vite affiche le port
  utilisé). Les requêtes `/api/...` sont relayées vers l'API déployée sur
  mmi.unilim.fr.
- Le HTML et le CSS doivent être valides au validateur du W3C.

## 2. Architecture actuelle à respecter

Le dépôt est un full-stack sans framework applicatif. Les chemins sont donnés
depuis le dossier `Base/` (racine déployée sur le serveur) :

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

Le chemin du projet `/~segrestan1/SAE301-Starter/Base/` apparaît à deux
endroits seulement et doit y rester identique : `BASE` dans
`front/vite.config.js` et `chemin` dans `back/config/config.php`.

Voir README.md

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

## 7. Données, commandes et sécurité

Le futur modèle métier doit préserver les décisions documentées dans
l'analyse des user stories (README.md) :

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

Respecte l'ordre défini dans l'analyse des user stories (README.md) sauf
décision explicite :

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