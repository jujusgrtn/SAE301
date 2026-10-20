# SAE301 — Organisation et fonctionnement de l'application

## 1. Présentation générale

SAE301 est un prototype full-stack de site de click & collect pour
**Matira Création**, bijouterie en perle de Tahiti du centre Vaima, à Papeete.
Le code fonctionnel actuel repose encore sur le catalogue de films pédagogique
du starter, mais l'architecture est destinée à accueillir progressivement un
catalogue de bijoux (catégories, produits, variantes, stock, commandes).

| Ressource             | Lien                                                       |
| --------------------- | ---------------------------------------------------------- |
| Site en production    | https://mmi.unilim.fr/~segrestan1/SAE301-Starter/     |
| Site en développement | http://localhost:5173/~segrestan1/SAE301-Starter/     |
| Dépôt GitHub          | https://github.com/jujusgrtn/SAE301                        |
| Maquettes Figma       | https://www.figma.com/design/BF6DnP4noqun61O6jHr4MJ        |

L'application est composée de trois parties principales :

| Partie    | Rôle                                                            | Emplacement            |
| --------- | --------------------------------------------------------------- | ---------------------- |
| Front-end | Application web monopage, affichage, navigation et interactions | [`front/`](./front/)   |
| Back-end  | API PHP JSON, authentification, catalogue et statistiques       | [`back/`](./back/)     |
| Données   | Schéma et données initiales de la base                          | [`sql/`](./sql/)       |

Le projet n'utilise pas de framework applicatif. Le front est construit avec
Vite, JavaScript en modules ES et Tailwind CSS 4. Le back-end utilise PHP,
PDO et une organisation en couches `Core`, `Controller` et `Model`.

## 2. Organisation globale du dépôt

La racine du dépôt est la racine déployée sur le serveur, dans
`~/public_html/SAE301-Starter/`.

```text
SAE301-Starter/
├── AGENTS.md                 règles générales pour les modifications
├── ARCHITECTURE.md           ce document
├── README.md                 présentation, installation, analyse des user stories
├── SKILL.md                  méthode de réalisation d'une US, avec exemples
├── .gitignore                node_modules, dist et config.php exclus de Git
├── .htaccess                 point d'entrée HTTP déployé
├── back/
│   ├── index.php             point d'entrée unique de l'API
│   ├── config/
│   │   ├── config.php        identifiants MySQL réels (non versionné)
│   │   ├── config.example.php modèle versionné, sans identifiants
│   │   └── .htaccess         interdit l'accès depuis le navigateur
│   └── src/
│       ├── Core/             requête, réponse, routeur et base de données
│       ├── Controller/       orchestration des cas d'utilisation
│       ├── Model/            accès et transformations des données
│       ├── routes.php        déclaration des routes API
│       └── .htaccess         interdit l'accès depuis le navigateur
├── front/
│   ├── index.html            document HTML initial
│   ├── vite.config.js        base URL, proxy API et configuration Vite
│   ├── package.json          scripts et dépendances front
│   ├── src/                  code source de l'application web
│   └── dist/                 résultat de npm run build (non versionné)
└── sql/
    └── import.sql            schéma et données initiales
```

`back/config/config.php` contient le mot de passe MySQL : il reste sur le
serveur et n'est jamais ajouté au dépôt. Seul `config.example.php` est
versionné.

## 3. Fonctionnement d'une requête

### 3.1 En production

Le fichier [`.htaccess`](./.htaccess) sert de point d'aiguillage :

1. une URL commençant par `/api/` est réécrite vers
   [`back/index.php`](./back/index.php) ;
2. les fichiers compilés du front sont servis depuis `front/dist/` ;
3. une route front qui ne correspond pas à un fichier réel reçoit
   `front/dist/index.html`, afin que le routeur JavaScript puisse afficher la
   page demandée ;
4. les autres fichiers internes, comme `front/src/` ou la configuration PHP,
   ne sont pas exposés directement.

Le back-end renvoie uniquement des réponses JSON. Il ne génère pas de HTML.

### 3.2 Au démarrage du back-end

[`back/index.php`](./back/index.php) :

1. active le typage strict ;
2. enregistre l'autoload des classes `App\` depuis `back/src/` ;
3. charge la configuration de [`config.php`](./back/config/config.php) ;
4. ouvre la connexion PDO à MySQL ;
5. instancie les modèles et contrôleurs ;
6. charge les routes depuis [`routes.php`](./back/src/routes.php) ;
7. configure une seule fois le cookie de session et démarre la session ;
8. transmet la requête au routeur.

Le routeur compare la méthode HTTP et le chemin reçus avec la table des routes,
puis appelle la méthode du contrôleur correspondant.

### 3.3 Au démarrage du front

Le fichier [`front/src/main.js`](./front/src/main.js) est le point d'entrée
JavaScript :

1. il crée un routeur avec `import.meta.env.BASE_URL` comme base ;
2. il associe le layout principal à toutes les routes ;
3. il déclare la page catalogue sur `/` ;
4. il déclare la page administration sur `/admin` ;
5. il déclare la page 404 avec `*` en dernier ;
6. il lance le routeur.

Une navigation interne ne recharge pas la page. Le routeur intercepte les liens
portant `data-link`, modifie l'historique avec `pushState`, puis rend la page
associée à la nouvelle URL.

## 4. Organisation de `front/src/`

Le front est séparé en quatre familles principales : `pages`, `ui`, `data` et
`lib`. Cette organisation applique une séparation MVC adaptée à JavaScript
modulaire.

```text
front/src/
├── main.js
├── global.css
├── layouts/
│   └── root/
├── pages/
│   ├── 404/
│   ├── catalogue/
│   └── admin/
├── ui/
│   ├── header/
│   ├── barre-outils/
│   ├── carte-film/
│   ├── grille-films/
│   ├── pagination/
│   ├── formulaire-connexion/
│   ├── message/
│   └── statistiques/
├── data/
│   ├── film.js
│   ├── auth.js
│   └── stats.js
└── lib/
    ├── api-request.js
    ├── format.js
    ├── router.js
    ├── theme.js
    └── utils.js
```

Les fichiers `film`, `carte-film`, `grille-films` et `statistiques` sont ceux du
starter : ils seront remplacés par leurs équivalents bijoux au fil des user
stories (voir section 9).

### 4.1 `main.js`

[`main.js`](./front/src/main.js) assemble les routes et le layout, mais ne
contient pas le rendu détaillé des pages. Il sert de bootstrap de l'application.

Les routes actuellement disponibles sont :

| Route front          | Page                                        |
| -------------------- | ------------------------------------------- |
| `/`                  | catalogue (films du starter)                |
| `/admin`             | connexion et statistiques d'administration  |
| toute route inconnue | page 404                                    |

Routes prévues par les user stories :

| Route front                 | US    | Page                       |
| --------------------------- | ----- | -------------------------- |
| `/`                         | DEC-b | catalogue de bijoux        |
| `/categorie/:slug`          | DEC-a | bijoux d'une catégorie     |
| `/produit/:slug`            | DEC-c | fiche produit              |
| `/panier`                   | CMD-b | panier                     |
| `/connexion`                | CMD-c | connexion et inscription   |
| `/commande/recapitulatif`   | CMD-a | récapitulatif de commande  |
| `/commande/confirmation`    | CMD-a | confirmation               |
| `/compte/commandes`         | SUI-c | historique des commandes   |
| `/admin`                    | GOF-b | back-office                |

### 4.2 `layouts/`

Un layout définit une structure commune à plusieurs pages. Le layout
[`root/layout.js`](./front/src/layouts/root/layout.js) :

- charge son template HTML ;
- insère le composant d'en-tête ;
- conserve un `<slot>` sans nom pour recevoir la page courante.

Le layout ne charge pas lui-même les données métier d'une page.

### 4.3 `pages/`

Chaque page dynamique regroupe son modèle, son contrôleur et sa vue dans un
module de page. Cette proximité facilite le suivi d'une route tout en
conservant les responsabilités séparées.

#### Page catalogue

[`pages/catalogue/page.js`](./front/src/pages/catalogue/page.js) :

- **Modèle (`M`)** : mémorise la dernière réponse du catalogue (films et
  réglages appliqués) et le message courant ;
- **Contrôleur (`C`)** : charge une page du catalogue, réagit au changement de
  tri, de nombre d'éléments par page et de page ;
- **Vue (`V`)** : compose la barre d'outils, la grille, la pagination et les
  messages à partir de l'état.

Après une action importante, la page est reconstruite depuis l'état du modèle
(`V.rafraichir()`). Cela évite de disperser des modifications DOM dans les
gestionnaires d'événements.

#### Page administration

[`pages/admin/page.js`](./front/src/pages/admin/page.js) :

- charge les statistiques auprès du serveur ;
- affiche le formulaire de connexion ;
- traite la connexion et la déconnexion ;
- distingue les erreurs `401` (non connecté) et `403` (accès refusé) ;
- affiche les statistiques uniquement lorsque le serveur les renvoie.

La page ne considère pas le rôle présent dans le navigateur comme une preuve de
droit : l'autorisation est décidée par l'API.

#### Page 404

[`pages/404/`](./front/src/pages/404/) contient le template et le rendu de la
page affichée lorsqu'aucune route ne correspond.

### 4.4 `ui/`

Les dossiers de [`front/src/ui/`](./front/src/ui/) contiennent des composants
présentatifs réutilisables. En général, chaque composant possède :

- un `template.html` pour sa structure et ses classes Tailwind ;
- un `index.js` pour produire une chaîne HTML ou un `DocumentFragment`.

Les composants actuellement présents sont :

| Composant              | Fonction                                                     |
| ---------------------- | ------------------------------------------------------------ |
| `header`               | navigation, lien vers l'administration et changement de thème |
| `barre-outils`         | choix du tri (titre, année, note) et du nombre par page       |
| `carte-film`           | affichage d'un film : genre, titre, réalisateur, note, durée  |
| `grille-films`         | composition des cartes du catalogue, ou état vide             |
| `pagination`           | pages précédente et suivante                                  |
| `formulaire-connexion` | saisie et envoi des identifiants                              |
| `message`              | états de succès ou d'erreur                                   |
| `statistiques`         | synthèse des statistiques et répartition par genre            |

Un composant UI reçoit ses données et ses callbacks depuis la page. Il ne doit
pas appeler directement l'API, choisir une route métier ou posséder l'état
global du catalogue.

### 4.5 `data/`

Les modules de [`front/src/data/`](./front/src/data/) sont la couche modèle
orientée API. Ils ne touchent pas au DOM.

| Module                           | Appels actuels                                        |
| -------------------------------- | ----------------------------------------------------- |
| [`film.js`](./front/src/data/film.js)   | `GET /api/films?page=…` avec tri et nombre par page facultatifs |
| [`auth.js`](./front/src/data/auth.js)   | `POST /api/login` et `POST /api/logout`        |
| [`stats.js`](./front/src/data/stats.js) | `GET /api/admin/stats`                         |

Les modules `data/` délèguent l'appel HTTP à
[`lib/api-request.js`](./front/src/lib/api-request.js). La page reçoit les
résultats ou les erreurs et décide de l'affichage à produire.

### 4.6 `lib/`

Les modules de [`front/src/lib/`](./front/src/lib/) fournissent les fonctions
techniques partagées :

| Module           | Responsabilité                                                     |
| ---------------- | ------------------------------------------------------------------ |
| `router.js`      | routes, layouts, navigation sans rechargement, paramètres et 404   |
| `api-request.js` | requêtes HTTP JSON et erreurs contenant le statut HTTP             |
| `utils.js`       | échappement HTML, rendu de placeholders et conversion en fragment  |
| `format.js`      | formatage des durées et des notes (à compléter : prix en XPF)      |
| `theme.js`       | bascule clair/sombre et sauvegarde dans `localStorage`             |

`utils.js` joue un rôle de sécurité important : les valeurs remplacées dans
`{{placeholders}}` sont échappées avant insertion dans un template. Pour insérer
un composant ou un élément calculé, le code utilise plutôt un `<slot>` et
`replaceWith`.

Les prix de Matira sont en francs pacifiques, sans centimes : `format.js`
devra fournir un formatage du type `14 900 XPF`, avec espaces insécables.

### 4.7 `global.css`

[`global.css`](./front/src/global.css) importe Tailwind CSS 4 et définit :

- la variante sombre activée par `.theme-dark` ;
- les utilitaires visuels utilisés par les cartes ;
- la gestion du contraste et de la couleur des contrôles natifs ;
- un anneau de focus visible au clavier ;
- le curseur des boutons activés.

Le thème sombre est conservé côté navigateur dans `localStorage`. Il ne dépend
pas de la session PHP. La charte Matira (Raleway, turquoise `#4DC5C1` /
`#1C7C78`, jaune `#E5E337`, nacre, gris) sera déclarée en tokens primitifs et
sémantiques dans ce fichier (voir AGENTS.md, section 5).

## 5. Flux principaux du front

### 5.1 Chargement du catalogue

```text
Route /
  -> CataloguePage
  -> FilmData.fetchPage(page, reglages)
  -> lib/api-request.js
  -> GET /api/films?page=…
  -> modèle de la page
  -> barre d'outils + grille + pagination
```

Le serveur renvoie une page de films, les réglages effectivement appliqués
(tri, nombre par page, page, nombre de pages, total). Le tri et le nombre par
page choisis sont mémorisés par le serveur dans des cookies `HttpOnly` ; le
front n'a jamais besoin de les lire.

Flux cible (DEC-b) : `ProduitData.fetchAll()` puis `GET /api/produits`, avec
pour chaque bijou son nom, son prix, sa catégorie et son image principale.

### 5.2 Connexion et statistiques

```text
Route /admin
  -> AdminPage
  -> StatsData.fetch()
  -> GET /api/admin/stats
  -> statistiques ou message 401/403

Formulaire
  -> AuthData.login()
  -> POST /api/login
  -> cookie de session HTTP
  -> nouvelle demande des statistiques
```

Le cookie de session est géré par le serveur. Le front ne doit pas stocker ou
déduire lui-même un rôle d'administration.

## 6. API et données actuellement présentes

Les routes API déclarées dans [`back/src/routes.php`](./back/src/routes.php)
sont :

| Méthode | Route              | Contrôleur            |
| ------- | ------------------ | --------------------- |
| `GET`   | `/api/films`       | `CatalogueController` |
| `POST`  | `/api/login`       | `AuthController`      |
| `POST`  | `/api/logout`      | `AuthController`      |
| `GET`   | `/api/admin/stats` | `StatsController`     |

Le catalogue et les statistiques utilisent `FilmModel` (tables `film` et
`genre`). Les comptes de test (`alice` / `admin`) sont écrits en dur dans
`AuthController` : ils seront remplacés par des comptes en base avec mots de
passe hachés (CMD-c, GOF-b).

Les évolutions vers les bijoux, paniers et commandes devront modifier de façon
coordonnée le SQL, les modèles, les contrôleurs, les routes, les modules
`data/` et les pages concernées. Modèle de données prévu :

| Table           | Rôle                                                              |
| --------------- | ----------------------------------------------------------------- |
| `categorie`     | Plaqué or 18 cts, Acier inoxydable, Homme… (slug pour l'URL)      |
| `produit`       | nom, slug, description, prix en XPF (entier), catégorie            |
| `variante`      | au moins une par produit (« Modèle unique »), porte le stock       |
| `image_produit` | photos du produit, l'image d'ordre 0 est l'image principale        |
| `commande`, `ligne_commande` | commandes et lignes avec prix figé (CMD-a)            |

## 7. Développement et déploiement

### 7.1 Développement du front

Depuis [`front/`](./front/), dans le terminal SSH :

```bash
cd ~/public_html/SAE301-Starter/front
npm install
npm run dev
```

Vite utilise par défaut le port `5173` et le chemin de base configuré dans
[`vite.config.js`](./front/vite.config.js) :

```text
/~segrestan1/SAE301-Starter/
```

L'application s'ouvre sur http://localhost:5173/~segrestan1/SAE301-Starter/
(VS Code Remote-SSH transfère le port automatiquement ; si le port est pris,
Vite en affiche un autre). Le proxy Vite relaie les requêtes `/api/` vers
`https://mmi.unilim.fr` sous le même chemin de base. La valeur `BASE` du front
doit rester identique à `chemin` dans
[`back/config/config.php`](./back/config/config.php).

### 7.2 Compilation

```bash
cd ~/public_html/SAE301-Starter/front
npm run build
```

La compilation produit les fichiers statiques dans `front/dist/`. Ce dossier
est ensuite servi par le serveur web via `.htaccess`. Il n'est pas versionné :
relancer `npm run build` après chaque modification du front pour la voir en
production.

### 7.3 Vérifications

Avant de considérer une modification front terminée :

- [ ] les appels API sont dans `front/src/data/` ou passent par
      `front/src/lib/api-request.js` ;
- [ ] les composants `ui/` ne chargent pas l'API et ne portent pas de logique
      métier ;
- [ ] les données injectées dans un template sont échappées ;
- [ ] les états de chargement, vide, erreur et succès sont traités lorsqu'ils
      sont concernés ;
- [ ] la navigation conserve `data-link`, la base Vite et la page 404 ;
- [ ] le rendu est vérifié à 320/375 px, 768 px et 1440 px ;
- [ ] le HTML et le CSS sont valides au validateur du W3C ;
- [ ] `node .agents/skills/verifier-mvc/scripts/check-mvc.js .` passe ;
- [ ] `npm run build` passe depuis `front/`.

## 8. Diagnostic rapide

| Symptôme | Vérifications à effectuer |
| --- | --- |
| « Not Found » sur `…/SAE301-Starter/` | `front/dist/` absent : lancer `npm run build` depuis `front/` |
| Page blanche ou assets en 404 | vérifier `BASE` dans `vite.config.js` et relancer `npm run build` |
| Route `/admin` inaccessible après rechargement | vérifier que `.htaccess` renvoie les routes front vers `front/dist/index.html` |
| API en 404 en développement | vérifier le proxy Vite et la disponibilité du back sur `mmi.unilim.fr` |
| Catalogue impossible à charger | vérifier `back/config/config.php`, la connexion MySQL et l'import de `sql/import.sql` |
| `npm` ne trouve pas `package.json` | se placer dans `front/` avant `npm run dev` ou `npm run build` |
| Session ou préférences non conservées | vérifier la cohérence entre `BASE` et `chemin` |
| Statistiques refusées | vérifier la session et laisser le serveur décider des droits `401`/`403` |

## 9. Règles d'évolution

Pour ajouter une fonctionnalité front, conserver ce découpage :

1. **Données et règles** : module `data/` ou état privé de la page ;
2. **Affichage et événements DOM** : template et composant `ui/` ;
3. **Orchestration** : contrôleur de la page ;
4. **Navigation** : route déclarée dans `front/src/main.js` ;
5. **Contrat back-end** : route PHP, contrôleur, modèle et SQL si nécessaire.

Ne pas déplacer les fichiers existants sans nécessité. Lorsqu'une évolution
concerne le catalogue de bijoux, vérifier d'abord les dépendances métier
(ordre des US dans le README : DEC-b, DEC-a, DEC-c, CMD-b, CMD-c, CMD-a…) et
conserver la validation côté serveur pour les prix, rôles, quantités,
variantes, stock et commandes. Chaque user story est développée sur sa propre
branche Git (`feature/DEC-b-catalogue`…) puis fusionnée dans `main`.