---
name: realiser-us
description: Méthode pour réaliser une user story du projet SAE301 Matira Création (click & collect) de bout en bout — SQL, API PHP, module data/, page front en M/V/C, tests et compte rendu — en reprenant les patterns déjà en place dans DEC-b, DEC-a, DEC-c, CMD-b, CMD-c, CMD-a, STK-b, STK-c, STK-a, GOF-a, GOF-c, PIL-b, SUI-c et SUI-b. À utiliser pour toute nouvelle US (SUI-a, OPT-…) ou toute fonctionnalité qui touche à la fois le back et le front.
---

# Réaliser une user story — SAE301 Matira Création

Ce skill complète `AGENTS.md` (les règles) par la **méthode** et des **exemples réels** tirés
des US déjà livrées. En cas de conflit, `AGENTS.md` fait foi. Les chemins sont donnés depuis
la racine du dépôt (`~/public_html/SAE301-Starter/`).

## 1. Quand utiliser ce skill

| Situation | Utiliser ? |
| --- | --- |
| Nouvelle US de l'ordre `AGENTS.md` §8 (ex. GOF-a, PIL-b) | oui, en entier |
| Ajout d'une route API et de son écran | oui, sections 4 à 7 |
| Correction locale d'un template ou d'un style | non : appliquer directement `AGENTS.md` §3 à §5 |
| Refonte d'architecture (routeur, layout, `Core/`) | non : s'arrêter et demander |

## 2. Démarrer une US

### 2.1 Check-list de démarrage

- [ ] `MEMOIRE.md` lu en entier (décisions, préférences, points en attente) : `AGENTS.md` §12
- [ ] La personne qui développe a demandé cette US (« on continue », « US 7 »…). La numérotation compte
      les US dans l'ordre de `AGENTS.md` §8, **sans** les fondations : US 1 = DEC-b, US 4 = CMD-b,
      US 7 = STK-b.
- [ ] Les dépendances sont terminées (ordre `AGENTS.md` §8).
- [ ] `git status` est propre et la branche de l'US précédente est poussée. Sinon, le signaler.
- [ ] Nouvelle branche **depuis la branche de l'US précédente** :
      `git switch -c feature/<CODE>-<sujet>` (ex. `feature/STK-c-contraintes-stock`).
- [ ] Fichiers concernés **et leurs appelants** lus avant toute modification.
- [ ] Aucun commit, aucun push : on donne les commandes à la fin (section 9).

### 2.2 Quand s'arrêter pour poser une question

Poser **une seule** série de questions (outil de question, options avec « (Recommandé) »)
dès qu'un choix change fortement le code. Exemples déjà tranchés :

| US | Question posée | Décision retenue |
| --- | --- | --- |
| DEC-a | Filtre en paramètre `?categorie=` ou chemin `/api/categories/{slug}` (routeur PHP sans paramètres) ? | `?categorie=slug` : le routeur `Core/Router.php` n'est pas modifié |
| DEC-a | Menu des catégories en dur ou servi par l'API ? | `GET /api/categories` |
| CMD-b | Panier en session PHP ou en `localStorage` ? | session PHP (le serveur fait foi) |
| CMD-c | Comptes admin en base tout de suite ? Inscription ? Panier à la déconnexion ? | admin en dur jusqu'à GOF-b ; connexion + inscription ; panier vidé |
| STK-a | Comment appliquer une nouvelle table SQL ? | l'agent écrit le SQL, **la personne qui développe l'exécute** dans phpMyAdmin |

Ne **pas** demander pour un choix à convention évidente : le décider, puis le justifier
dans le compte rendu (ex. seuil de stock faible à 3, numéro de commande déduit de l'id).

## 3. Découper l'US par couche

Toute US se découpe dans cet ordre. Exemple complet : **DEC-c, fiche produit**.

| # | Couche | Fichier | Exemple DEC-c |
| --- | --- | --- | --- |
| 1 | Données SQL | `sql/import.sql` | tables `produit`, `image_produit`, `variante` (déjà présentes) |
| 2 | Modèle PHP | `back/src/Model/` | `ProductModel::findBySlug()`, `findImages()`, `findVariants()` |
| 3 | Contrôleur PHP | `back/src/Controller/` | `ProductController::show()` : valide le slug, 400 / 404 / 200 |
| 4 | Route | `back/src/routes.php` + `back/index.php` | `'GET  /api/produit' => [ProductController::class, 'show']` |
| 5 | Module data | `front/src/data/` | `ProductData.fetchBySlug(slug)` |
| 6 | Composants UI | `front/src/ui/` | `carte-produit` devient cliquable (`routeUrl("/produit/…")`) |
| 7 | Page M/V/C | `front/src/pages/<page>/` | `pages/produit/page.js` + templates `.html` |
| 8 | Route front | `front/src/main.js` | `router.addRoute("/produit/:slug", ProductPage);` |

Règle : une donnée ou un calcul va dans M, un affichage ou un écouteur dans V, une réaction
dans C (`AGENTS.md` §3). Une règle métier partagée va **côté serveur** (ex. `Model/Stock.php`).

## 4. Back-end : patterns en place

### 4.1 Modèle : requête préparée, ligne SQL → tableau typé

Exemple : `Model/CategoryModel.php`.

```php
public function findBySlug(string $slug): ?array
{
    $statement = $this->pdo->prepare(
        'SELECT id, parent_id, nom, slug, description
           FROM categorie
          WHERE slug = :slug'
    );
    $statement->bindValue(':slug', $slug, PDO::PARAM_STR);
    $statement->execute();

    $row = $statement->fetch();

    return $row === false ? null : self::formatCategory($row);
}
```

| Règle | Où le voir |
| --- | --- |
| MySQL renvoie des chaînes : convertir avec `(int)` dans un `formatX()` privé | `ProductModel::formatProduct()` |
| `array_map(function (array $row): array { … }, $rows)` — jamais `fn`, jamais `foreach` | `ProductModel::findImages()` |
| Boucle indexée `for ($i = 0; $i < count($rows); $i++)` quand il faut un index | `VariantModel::findForCart()` |
| Liste `IN (…)` : un marqueur `?` par valeur, valeurs liées une à une | `VariantModel::findForCart()` |
| `ATTR_EMULATE_PREPARES` est à `false` : **un même marqueur nommé ne peut pas apparaître deux fois** | `ProductModel::findByCategory()` utilise `:sous_categorie_id` et `:categorie_id` |
| Fragment SQL partagé dans une constante privée | `ProductModel::SELECT_PRODUCTS`, `ORDER_PRODUCTS` |
| Ne jamais renvoyer l'empreinte d'un mot de passe, sauf à la vérification | `UserModel::findByEmail()` seul la renvoie |

### 4.2 Contrôleur : valider, orchestrer, répondre en JSON

Exemple : `Controller/ProductController.php`.

```php
public function show(Request $request): void
{
    $slug = $request->parametre('slug');

    if ($slug === null || preg_match(self::PRODUCT_SLUG_PATTERN, $slug) !== 1) {
        Response::erreur('Bijou invalide.', 400);
        return;
    }

    $product = $this->products->findBySlug($slug);

    if ($product === null) {
        Response::erreur('Ce bijou n\'existe pas.', 404);
        return;
    }

    Response::json(['produit' => $product]);
}
```

`Response::erreur()` termine le script par `exit`, mais on écrit quand même `return;` derrière :
le code se lit sans connaître ce détail.

### 4.3 Codes HTTP utilisés

| Code | Sens dans le projet | Exemple |
| --- | --- | --- |
| 200 | lecture ou action réussie | `GET /api/panier` |
| 201 | ressource créée | `POST /api/compte/inscription`, `POST /api/commandes` |
| 400 | requête mal formée, règle de saisie violée (`InvalidArgumentException`) | slug invalide, quantité > 10 |
| 401 | non connecté | `POST /api/commandes` sans session client |
| 403 | connecté mais sans le droit | `GET /api/admin/stats` pour un non-admin |
| 404 | ressource absente **ou appartenant à un autre** (ne rien révéler) | `GET /api/commande?numero=` d'un autre client |
| 409 | conflit avec l'état du serveur (`StockException`, e-mail déjà pris) | ajout au-delà du stock |

### 4.4 Branchement d'un contrôleur

```php
// back/src/routes.php
'GET  /api/commande'            => [OrderController::class, 'show'],

// back/index.php — les dépendances sont créées explicitement
OrderController::class => new OrderController(new OrderModel($pdo, new StockModel($pdo)), new UserModel($pdo)),
```

### 4.5 Session : clés, identité, panier

| Clé `$_SESSION` | Constante | Écrite par |
| --- | --- | --- |
| `panier` → `{ variantId => quantité }` | `CartController::SESSION_KEY` | `CartController::respond()` |
| `clientId` → identifiant du client | `AccountController::SESSION_KEY` | `AccountController::openSession()` |

- Seul un **identifiant** est rangé en session ; l'identité est relue en base à chaque demande.
- Connexion ou inscription : `session_regenerate_id(true)` **puis** écriture de la clé
  (`AccountController::openSession()`). Le panier survit, l'ancien identifiant ne donne plus accès.
- Déconnexion : session détruite, panier compris (`AccountController::logout()`).
- La session relue n'est pas fiable : `new Cart($items)` écarte toute entrée mal formée.
- Le front n'envoie **jamais** de prix ni d'identité : `POST /api/commandes` n'a pas de corps.

### 4.6 Transaction, verrou, exception métier

Exemple : `OrderModel::createFromItems()` (CMD-a, STK-c, STK-a).

```php
$this->pdo->beginTransaction();

try {
    $lines = $this->lockLines($items);       // SELECT … FOR UPDATE : prix et stock verrouillés
    self::checkStock($lines);                 // StockException si une ligne dépasse (STK-c)
    $orderId = $this->insertOrder($userId, $total);
    // numéro définitif déduit de l'id auto-incrémenté : MC-2026-00042
    $this->insertLines($orderId, $lines);     // nom et prix figés
    for ($i = 0; $i < count($lines); $i++) {
        $this->stock->withdraw($lines[$i]['variantId'], $lines[$i]['quantite'], $orderId); // STK-a
    }
    $this->pdo->commit();
} catch (Throwable $e) {
    $this->pdo->rollBack();
    throw $e;
}
```

| Pattern | Pourquoi |
| --- | --- |
| Toutes les écritures liées dans **une** transaction | réservation, lignes, stock et journal ne peuvent pas se contredire |
| `FOR UPDATE` sur les lignes lues | deux validations simultanées ne réservent pas le même exemplaire |
| Garde-fou dans l'`UPDATE` (`AND stock >= :quantite_minimum` + `rowCount()`) | le stock ne devient jamais négatif, même sans verrou |
| Exception métier dédiée → code HTTP dans le contrôleur | `StockException` → 409, `InvalidArgumentException` → 400 |
| Les méthodes appelées dans la transaction ne l'ouvrent pas | `StockModel::withdraw()` partage le PDO de `OrderModel` |

### 4.7 Règle métier unique côté serveur

`Model/Stock.php` fixe le seuil (`LOW_THRESHOLD = 3`) et renvoie `{ stock, disponibilite }`
(`en_stock`, `stock_faible`, `epuise`). Le front **affiche** la disponibilité, il ne la calcule pas.

### 4.8 Envoi de fichiers : les photos du back-office (GOF-a)

| Pattern | Où le voir |
| --- | --- |
| Un envoi avec fichier est du **multipart/form-data** : `Request` expose les champs par `corps()` et le fichier par `fichier('photo')` ; `envoiRefuse()` signale un corps au-delà de `post_max_size` (PHP vide alors `$_POST` et `$_FILES` sans prévenir) | `Core/Request.php` |
| Le fichier reçu **n'est jamais conservé tel quel** : type vérifié sur le contenu (`finfo`, pas l'extension), dimensions lues **avant** de décoder (`getimagesize`), puis réécriture par GD en WebP 800 px et 400 px. Le dossier ne contient que des `.webp` | `Model/ProductImageStorage::store()` |
| Photos des utilisateurs hors de `front/dist/` (le build le vide) : `uploads/produits/` à la racine, règle `RewriteRule ^uploads/ - [END]` dans `.htaccess`, `uploads/.htaccess` qui n'autorise que `.webp`, dossier ignoré par Git | `.htaccess`, `uploads/.htaccess`, `.gitignore` |
| `image_produit.fichier` : un **nom simple** pour les photos du catalogue d'origine, `uploads/produits/nom` pour les photos envoyées. Le front ne construit jamais une adresse à la main | `front/src/lib/image.js` → `productImageUrl(fichier, estPetite)` |
| Ne supprimer du disque que ce qui a été envoyé (`ProductImageStorage::isUploaded()`, expression régulière stricte) : une photo d'origine ou un chemin piégé est ignoré | `ProductImageStorage::delete()` |
| Ordre des opérations : écrire les fichiers, **puis** la transaction SQL ; en cas d'échec de la base, effacer les fichiers ; l'ancienne photo n'est effacée qu'**après** le `commit` | `AdminProductController::create()` et `update()` |
| Un ajustement manuel du stock est journalisé comme les autres mouvements (motif `ajustement`, `commande_id` NULL) | `StockModel::adjust()` |
| Le slug est dérivé du nom (accents retirés par une table, pas par `iconv`) et rendu unique par suffixe `-2`, `-3` ; il **ne change pas** à la modification pour ne pas casser les adresses partagées | `Model/Slug.php`, `AdminProductModel::uniqueSlug()` |

Côté front, `lib/api-request.js` fournit `postFormRequest(uri, formData)` : **pas d'en-tête
`Content-Type`**, le navigateur fabrique la séparation (`boundary`) lui-même.

## 5. Front-end : patterns en place

### 5.1 Module `data/` : un appel réseau, rien d'autre

```js
// front/src/data/produit.js
/**
 * La fiche d'un bijou : GET /api/produit?slug=… (US DEC-c).
 * Un bijou inconnu lève une ErreurApi de statut 404.
 *
 * @param {string} slug - Slug du bijou, tel qu'il apparaît dans l'URL.
 * @returns {Promise<{produit: Object}>}
 */
ProductData.fetchBySlug = async function (slug) {
  return getRequest(`produit?slug=${encodeURIComponent(slug)}`);
};
```

Les erreurs remontent en `ErreurApi` (`lib/api-request.js`) avec `error.statut` : c'est le
Modèle de la page qui les traduit en message.

### 5.2 Squelette d'une page M/V/C

Modèle : `pages/categorie/page.js`. Toute nouvelle page reprend cette forme.

```js
// M — état et accès aux données (jamais de DOM)
let M = { slug: null, status: "loading", products: [], message: null };

M.reset = function (slug) { /* remet l'état à zéro */ };

/**
 * . slug : slug de la catégorie
 * > Promise<boolean> : vrai si la réponse concerne toujours la catégorie affichée
 */
M.fetchCategory = async function (slug) {
  let response = null;
  let message = null;
  try {
    response = await ProductData.fetchByCategory(slug);
  } catch (error) {
    message = error.statut === 404 ? { titre: "Catégorie introuvable", texte: "…" } : { titre: "…", texte: error.message };
  }
  if (slug !== M.slug) {
    return false; // réponse arrivée après un changement de page : ignorée
  }
  /* … range response ou message dans M … */
  return true;
};

M.getState = function () { return { status: M.status, /* … */ }; };

// C — orchestre M et V, contient les handlers
let C = {};
C.loadCategory = async function (slug) {
  if (await M.fetchCategory(slug)) {
    V.renderPage(M.getState());
  }
};
C.init = function (slug) {
  M.reset(slug);
  let fragment = V.init();
  V.renderPage(M.getState()); // état de chargement visible tout de suite
  C.loadCategory(slug);       // pas d'await : la page s'affiche avant la réponse
  return fragment;
};

// V — DOM uniquement, reçoit l'état en paramètre
let V = {};
V.root = null;
V.init = function () { /* template → fragment, V.root, écouteurs délégués vers C */ };
V.renderPage = function (state) { /* chargement | erreur | vide | succès */ };

export function CategoryPage(params) {
  return C.init(params.slug);
}
```

### 5.3 Règles front vérifiées dans les US livrées

| Règle | Exemple |
| --- | --- |
| Les quatre états (chargement, erreur, vide, succès) dans `V.renderPage()` ; zone `aria-live="polite"` + `aria-busy` | `pages/panier/page.js` |
| Délégation : un écouteur sur `V.root`, le handler de C filtre avec `ev.target.closest(...)` | `C.handler_clickOnCartAction` |
| Action en cours : `aria-disabled="true"` (pas `disabled`, qui fait perdre le focus) + garde dans M | `M.canSubmit()` de `pages/recapitulatif/page.js` |
| Focus rendu au même bouton après reconstruction, ou au titre si la ligne a disparu | `V.renderPage()` de `pages/panier/page.js` |
| Message d'erreur `role="alert" tabindex="-1"` qui reçoit le focus | `V.focusError()` de `pages/connexion/page.js` |
| Pendant l'envoi d'un formulaire, ne changer que le bouton (`V.renderBusy`) pour garder la saisie | `pages/connexion/page.js` |
| Lien affiché après le passage du routeur : adresse complète avec `routeUrl("/…")` | `ui/carte-produit/index.js` |
| Changer de page depuis le code : `history.pushState` puis `popstate` (dans V) | `V.goToConfirmation()` |
| Valeurs injectées uniquement via `genericRenderer` (échappement) ; composants via `<slot>` | tous les templates |
| Prix : `formatPrice()` → `14 900 XPF` (espaces insécables) ; dates : `formatDate()` ; tailles : `formatFileSize()` | `lib/format.js` |
| Formulaire avec fichier : sur erreur du serveur, **ne pas reconstruire** le formulaire (le champ fichier se viderait) ; ne mettre à jour que la zone d'erreur et le bouton | `V.renderSubmitError()` de `pages/admin-produit/page.js` |
| Contrôle immédiat d'un fichier choisi (type, poids) pour éviter un envoi voué à l'échec ; le serveur reste seul juge | `M.checkPhoto()`, `C.handler_changePhoto` |
| Aperçu d'un fichier choisi : `URL.createObjectURL` dans V, **révoqué** (`revokeObjectURL`) à chaque changement | `V.renderPhotoPreview()`, `V.releasePreview()` |
| Suppression : confirmation **sur la ligne** (pas de `confirm()`), focus sur « Annuler » puis rendu au bouton d'origine ; une seule suppression à la fois | `pages/admin-produits/page.js` |
| Une page à deux modes (création / modification) : un seul module, l'identifiant vient de l'adresse (`/…/nouveau`, `/…/:id/modifier`) | `AdminProductFormPage` |
| Annonce après une action sur une autre page : `?notice=cree`, traduit par une **liste blanche** (`Object.hasOwn`), jamais affiché tel quel | `NOTICES` de `pages/admin-produits/page.js` |
| Réponse arrivée après un changement de page : un compteur de visite (`M.visit`) la fait ignorer | `M.fetchForm()`, `M.submit()` |
| Liste filtrée et paginée : filtres et page **dans l'adresse**, liens construits par `M.buildPath()` (un filtre qui change revient à la page 1), formulaire de période envoyé par `C.handler_submitPeriod` puis navigation `pushState` + `popstate` ; le serveur ramène une page trop loin à la dernière | `pages/mes-commandes/page.js`, `OrderModel::findPageForUser()` |
| Pagination : des **liens** (une adresse par page), le lien sans destination perd `href` et `data-link` et porte `role="link"` + `aria-disabled` | `ui/pagination` |
| Page réservée au client : l'état « anonyme » (compte `null`) déclenche `V.redirect('/connexion')` (`replaceState` puis `popstate`), jamais un écran vide ; une session perdue pendant un envoi (401) fait de même | `C.loadSpace()`, `C.handler_submitForm()` |
| Plusieurs formulaires sur une page : un `data-form` chacun, une seule action à la fois (`M.pending`), un message par formulaire, focus sur son message ; les champs de mot de passe ne sont jamais pré-remplis | `pages/profil/page.js` |
| Un lien `data-link` peut porter une chaîne de requête (`?parent=3`) : le routeur la conserve au clic **et** dans le `href` réécrit par `updateLinks()` (corrigé avec GOF-c : il la supprimait) | `lib/router.js` (`lien.search`) |
| Réordonner : l'action renvoie l'arbre à jour, le focus revient au **même bouton**, le résultat est annoncé par une région `role="status"` masquée plutôt que par un `aria-live` sur toute la liste | `V.announce()` de `pages/admin-categories/page.js` |
| Suppression refusée par le serveur (409) : afficher son message tel quel, ne rien retirer de la liste | `M.deleteCategory()` |
| Page ouverte pendant que la donnée change ailleurs : le serveur annonce les actions possibles (`transitions`), refuse le reste en 409 ; la page affiche ce refus **puis se recharge** pour montrer l'état réel | `M.submitChange()` de `pages/admin-commande/page.js` |
| Filtres d'une liste = liens `data-link` avec `?statut=` ; la page lit le filtre dans l'adresse, ignore une valeur inconnue et marque le lien actif avec `aria-current="page"` | `pages/admin-commandes/page.js` |
| Une règle de statuts (transitions permises) vit dans **une seule classe côté serveur**, relue dans la transaction sous verrou ; le front ne fait qu'afficher ce que le serveur annonce | `Model/OrderStatus.php` |
| Annulation : rendre au stock ce que le **journal** a enregistré, jamais ce que dit la ligne de commande (les réservations d'avant le journal n'ont rien retiré) | `StockModel::refundOrder()` |

### 5.4 Communication page → layout

Le routeur reconstruit le layout à chaque navigation **sans l'attendre**. Le layout
(`layouts/root/layout.js`) charge donc menu, compte et compteur **une fois**, les garde dans
son M, et se met à jour par événements :

| Événement (constante) | Émis par (V de la page) | `detail` |
| --- | --- | --- |
| `panier:modifie` (`CART_CHANGED_EVENT`, `data/panier.js`) | produit, panier, récapitulatif, connexion | `{ nombreArticles }` |
| `compte:modifie` (`ACCOUNT_CHANGED_EVENT`, `data/compte.js`) | connexion | `{ utilisateur }` |

L'écouteur sur `document` est posé une seule fois (`V.isListening` dans le layout).

### 5.5 Composants `ui/`

Un composant reçoit ses données, produit un `DocumentFragment`, et ne charge jamais l'API.
Exemple : `ui/badge-stock/index.js` reçoit `{ disponibilite, stock }`, choisit un texte
(« Plus que 2 en stock ») et une couleur écrite **en entier** (`text-danger`) pour Tailwind.

### 5.6 Tokens Tailwind déjà déclarés (`global.css`)

| Classe | Usage |
| --- | --- |
| `text-primary-text`, `border-primary`, `bg-primary-soft` | turquoise texte (700), accents (500), fond doux (100) |
| `bg-button` | fond des boutons, texte blanc (turquoise 700, AA dans les deux thèmes) |
| `bg-surface-soft`, `text-muted`, `border-line` | fond nacre, texte secondaire, bordures |
| `text-success`, `text-danger`, `bg-cart-badge` | vert 700, rouge 700, jaune 400 |

Un nouveau besoin de couleur ajoute un token primitif **et** un token sémantique
(`@theme inline` + `:root`), avec sa valeur en thème sombre dans `.theme-dark`.

## 6. Données SQL

| Cas | Méthode |
| --- | --- |
| Lecture de tables existantes | rien à faire dans `sql/` |
| Nouvelle table ou colonne | l'ajouter à `sql/import.sql` (+ `DROP TABLE IF EXISTS` dans l'ordre des dépendances) |
| Appliquer à la base du serveur | donner la requête à la personne qui développe, pour qu'elle l'exécute dans phpMyAdmin (onglet SQL, base sélectionnée) ; vérifier ensuite en lecture seule via `information_schema` |

Exemple STK-a : table `mouvement_stock` ajoutée à `import.sql`, requête fournie, exécutée
par la personne qui développe, structure vérifiée (7 colonnes, 2 clés étrangères).

⚠️ `back/` tourne directement depuis `~/public_html` : une route qui dépend d'une table
absente répond **500 en production** tant que la migration n'est pas appliquée. Le dire en
premier dans le compte rendu.

## 7. Tester et valider

### 7.1 Vérifications systématiques

```bash
cd ~/public_html/SAE301-Starter
for f in back/index.php back/src/routes.php back/src/Model/*.php back/src/Controller/*.php; do php -l "$f" | grep -v "No syntax"; done
grep -rn "foreach\| fn" back/src/Model/<Nouveau>.php back/src/Controller/<Nouveau>.php
grep -n "=>\|forEach" front/src/pages/<page>/page.js      # aucun résultat attendu
(cd front && npm run build)                                # « ✓ built in … »
node .agents/skills/verifier-mvc/scripts/check-mvc.js .    # AGENTS.md §9 ; signaler s'il est absent
```

### 7.2 Tester l'API avec une vraie session

`curl` vers mmi.unilim.fr répond 401 (authentification HTTP) : tester en local avec le
serveur PHP intégré, un **port libre** (le 8099 est déjà pris sur la machine) et un routeur
qui imite `.htaccess` :

```php
<?php // router.php, dans le dossier temporaire de session, jamais dans le dépôt
if (str_contains($_SERVER['REQUEST_URI'], '/api/')) {
    require '/home/etudiants/segrestan1/public_html/SAE301-Starter/back/index.php';
    return true;
}
return false;
```

```bash
P=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1])")
php -S 127.0.0.1:$P router.php &
# Le cookie de session est « Secure » : le renvoyer à la main avec -H "Cookie: PHPSESSID=…"
```

Couvrir au minimum : succès, chaque code d'erreur de la section 4.3 concerné, double envoi,
et l'accès avec l'ancien identifiant de session après connexion.

### 7.3 Tester le front sans navigateur

jsdom installé **dans le dossier temporaire** (jamais dans `package.json`), Vite en mode
`ssrLoadModule("/src/main.js")`, `fetch` redirigé vers le serveur PHP local. Simuler les
clics (`MouseEvent("click", { bubbles: true, button: 0 })`) et la navigation
(`pushState` + `popstate`).

Pièges connus : jsdom ne gère pas `form.email` → utiliser `form.querySelector("[name=email]")` ;
envoyer un formulaire avec `dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))`.

### 7.4 Données de test : règles de propreté

| Règle | Exemple |
| --- | --- |
| Faire un état des lieux avant d'écrire | compter `commande` / `ligne_commande` avant le test |
| Comptes jetables reconnaissables, supprimés à la fin | `test-cmdc-<nombre>@matira.test` |
| Ne supprimer que ce que le test a créé (filtre explicite) | réservations du seul compte `client@matira.test` |
| Restaurer toute valeur modifiée | stock de la variante 5 remis à 2 |
| Remettre le compteur auto-incrémenté à `MAX(id) + 1` **seulement pour les tables que le test a remplies** | `produit`, `variante`, `image_produit`, `mouvement_stock` |
| **Jamais** `commande` ni `ligne_commande` : le numéro `MC-AAAA-NNNNN` vient de l'id, un compteur abaissé réutiliserait un numéro de réservation déjà donné | les réservations déjà faites sont réelles |
| Supprimer aussi les traces laissées dans le journal (`mouvement_stock` à `variante_id` NULL) | `db-state.php cleanup` |
| Vider puis retirer le dossier `uploads/produits/` après un test d'envoi | aucun fichier de test laissé |
| Ne jamais toucher aux données réelles du projet | les réservations déjà faites (`MC-2026-00001`, `00002`…) conservées |
| Tester un changement de schéma sans l'appliquer | `CREATE TEMPORARY TABLE` dans le script de test (sans clés étrangères) |

Compte de test des seeds : `client@matira.test` / `Matira2026!`.

## 8. Diagnostic

| Symptôme | Cause | Solution |
| --- | --- | --- |
| `SQLSTATE[HY093] Invalid parameter number` | même marqueur nommé utilisé deux fois | deux marqueurs distincts (section 4.1) |
| Route PHP en 404 « Route inconnue » | route absente de `routes.php` ou contrôleur absent de `index.php` | ajouter les deux (section 4.4) |
| Erreur 500 juste après une US touchant le SQL | migration pas encore appliquée | section 6 |
| `Failed to listen … Address already in use` | port déjà pris | port libre calculé (section 7.2) |
| Lien ajouté après chargement qui ouvre une mauvaise adresse dans un nouvel onglet | `href="/…"` sans le chemin du projet | `routeUrl("/…")` |
| Classe Tailwind absente du CSS | classe assemblée par concaténation | l'écrire en entier dans le code |
| `grep` ne trouve pas `size-1.5` dans le CSS | le point est échappé (`size-1\.5`) | chercher la version échappée |
| `git push` : `ECONNREFUSED …vscode-git-….sock` | terminal ouvert dans une ancienne session VS Code | nouveau terminal VS Code, ou jeton GitHub |
| Ancien compteur ou menu affiché dans l'en-tête | page qui n'émet pas l'événement attendu | `V.notifyCartChanged()` / `V.notifyAccountChanged()` (section 5.4) |

## 9. Compte rendu de fin d'US

Suivre `AGENTS.md` §11, dans cet ordre :

1. **Résultat en une phrase** et ce qui a été testé (tableau cas → résultat).
2. **Fichiers** : tableau état (créé / modifié / supprimé) → chemin cliquable → rôle.
3. **Choix faits** et leur raison, ou décisions de la personne qui développe appliquées.
4. **Points d'attention** : migrations à appliquer (en premier), limites, US suivante dans
   l'ordre `AGENTS.md` §8.
5. **Impacts** sur le reste de l'application (champs d'API ajoutés, nouveaux codes d'erreur).
6. **Commandes Git**, jamais exécutées par l'agent :

```bash
cd ~/public_html/SAE301-Starter
git add back front/src                    # + sql si le schéma a changé
git commit -m "<CODE> : <résumé>"
git push -u origin feature/<CODE>-<sujet>
```

## 10. Check-list finale

- [ ] Branche `feature/<CODE>-…` créée depuis l'US précédente, rien commité par l'agent
- [ ] Choix structurants demandés avant de coder (section 2.2)
- [ ] Back : requêtes préparées, validation serveur, codes HTTP de la section 4.3, PHPDoc partout
- [ ] Écritures liées dans une transaction ; stock protégé contre la survente
- [ ] Front : M/V/C strict, quatre états visibles, `aria-disabled`, focus géré, `routeUrl` pour les liens tardifs
- [ ] Aucun `foreach`, aucun `fn`, aucune fonction fléchée ; JSDoc / PHPDoc sur chaque fonction
- [ ] `php -l`, `npm run build`, `check-mvc.js` passés (ou absence signalée)
- [ ] API testée en session réelle ; front testé (jsdom ou navigateur) ; données de test nettoyées
- [ ] À vérifier par la personne qui développe : 320 / 768 / 1440 px et validateur W3C
- [ ] `MEMOIRE.md` mis à jour : avancement, décisions, pièges, points en attente, date (`AGENTS.md` §12)
- [ ] Compte rendu complet avec les commandes Git

## Annexe — US déjà réalisées

| US | Route front | API | Fichiers clés |
| --- | --- | --- | --- |
| DEC-b catalogue | `/` | `GET /api/produits` | `ProductModel`, `pages/catalogue`, `ui/carte-produit`, `ui/grille-produits` |
| DEC-a catégories | `/categorie/:slug` | `GET /api/categories`, `GET /api/produits?categorie=` | `CategoryModel`, `ui/menu-categories`, `ui/sous-categories`, `pages/categorie` |
| DEC-c fiche produit | `/produit/:slug` | `GET /api/produit?slug=` | `ProductModel::findBySlug`, `pages/produit` |
| CMD-b panier | `/panier` | `GET /api/panier`, `POST /api/panier/{ajouter,modifier,retirer}` | `Model/Cart`, `VariantModel`, `CartController`, `ui/compteur-panier`, `pages/panier` |
| CMD-c authentification | `/connexion` | `GET /api/compte`, `POST /api/compte/{connexion,inscription,deconnexion}` | `UserModel`, `AccountController`, `pages/connexion` |
| CMD-a réservation | `/commande/recapitulatif`, `/commande/confirmation?numero=` | `POST /api/commandes`, `GET /api/commande?numero=` | `OrderModel`, `OrderController`, `pages/recapitulatif`, `pages/confirmation` |
| STK-b affichage du stock | — | champs `stock`, `disponibilite` | `Model/Stock`, `ui/badge-stock` |
| STK-c contraintes de stock | — | 409 sur panier et réservation | `StockException`, `Cart::setQuantity`, `OrderModel::checkStock` |
| STK-a journal du stock | — | — | `StockModel::withdraw`, table `mouvement_stock` |
| GOF-b back-office | `/admin` | `GET /api/admin/compte`, `POST /api/admin/{connexion,deconnexion}` | `AdminModel`, `AdminController`, `AdminAreaController` (héritage : `requireAdmin()`), `pages/admin` |
| PIL-b gestion des réservations | `/admin/commandes` (`?statut=`), `/admin/commandes/:numero` | `GET /api/admin/commandes`, `GET /api/admin/commande?numero=`, `POST /api/admin/commandes/statut` | `OrderStatus` (transitions), `AdminOrderModel`, `StockModel::refundOrder`, `AdminOrderController`, `ui/badge-statut`, `pages/admin-commandes`, `pages/admin-commande` |
<<<<<<< Updated upstream
=======
| SUI-c historique des réservations (livrée sous le nom SUI-b) | `/compte/commandes` (`?statut=&du=&au=&page=`), `/compte/commandes/:numero` | `GET /api/commandes` (filtres + pagination), `GET /api/commande?numero=` | `OrderModel::findPageForUser` (filtre SQL commun au `COUNT` et à la page), `OrderController::index` (dates validées strictement), `ui/pagination` (liens, `aria-disabled`), `ui/badge-statut`, `pages/mes-commandes`, `pages/ma-commande` |
| SUI-b espace personnel | `/compte`, `/compte/profil` (`/connexion` y renvoie un client connecté) | `GET /api/compte`, `POST /api/compte/{modifier,mot-de-passe}` | `UserModel::updateProfile/updatePassword`, `AccountController::update/changePassword` (mot de passe actuel exigé), `ui/navigation-compte`, `pages/espace-client`, `pages/profil` |
>>>>>>> Stashed changes
| GOF-c gestion des catégories | `/admin/categories`, `/admin/categories/nouveau?parent=`, `/admin/categories/:id/modifier` | `GET /api/admin/categories`, `POST /api/admin/categories/{creer,modifier,deplacer,supprimer}` | `AdminCategoryModel` (transactions, ordre réécrit de 1 à n), `CategoryInUseException`, `AdminCategoryController`, `pages/admin-categories`, `pages/admin-categorie` |
| GOF-a gestion des produits | `/admin/produits`, `/admin/produits/nouveau`, `/admin/produits/:id/modifier` | `GET /api/admin/produits`, `GET /api/admin/produit?id=`, `POST /api/admin/produits/{creer,modifier,supprimer}` | `AdminProductModel`, `ProductImageStorage`, `Slug`, `StockModel::adjust`, `AdminProductController`, `lib/image.js`, `pages/admin-produits`, `pages/admin-produit` |
