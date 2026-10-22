# MEMOIRE.md — Mémoire du projet SAE301 Matira Création

Dernière mise à jour : 2026-10-22

Ce fichier est la **mémoire du projet** : ce qu'un agent, ou une personne qui reprend le travail, doit
savoir pour continuer sans tout redécouvrir. Il est versionné avec le code. Il ne remplace ni
[AGENTS.md](AGENTS.md) (les règles) ni [SKILL.md](SKILL.md) (la méthode pour réaliser une US).

## 1. Comment utiliser ce fichier

| Moment | Action |
| --- | --- |
| Début de session, avant toute tâche non triviale | lire ce fichier en entier, puis `AGENTS.md` si besoin |
| Fin de tâche (avec le compte rendu, `AGENTS.md` §11) | y consigner ce qui servira plus tard, et mettre à jour la date en tête |
| Une information devient fausse | la corriger ou la supprimer, jamais la laisser |
| Contradiction avec le code | le code fait foi : corriger ce fichier |

**Ce qui a sa place ici** : décisions et leur raison, préférences de travail confirmées, pièges déjà
rencontrés, points en attente, avancement. **Ce qui n'y a pas sa place** : les règles (`AGENTS.md`), la
méthode détaillée (`SKILL.md`), ce que le code ou Git disent déjà, et **tout secret** (mot de passe,
jeton, identifiant réel) puisque le dépôt est sur GitHub.

## 2. Le projet en un coup d'œil

| Élément | Valeur |
| --- | --- |
| Projet | SAÉ 3.01 : site de click & collect pour Matira Création (perles de Tahiti, centre Vaima, Papeete) |
| Principe | le client réserve en ligne, essaie et règle au retrait en boutique ; aucun paiement en ligne |
| Production | https://mmi.unilim.fr/~segrestan1/SAE301-Starter/ |
| Dépôt | https://github.com/jujusgrtn/SAE301 |
| Maquettes | https://www.figma.com/design/BF6DnP4noqun61O6jHr4MJ |
| Technique | front : Vite + Tailwind 4, JavaScript modulaire, routeur maison ; back : PHP 8.4 sans framework, PDO/MySQL |
| Langue | français partout (échanges, documentation, messages affichés) ; noms de code en anglais |

## 3. Préférences de travail confirmées

| Préférence | Comment l'appliquer |
| --- | --- |
| Les commits et les push sont faits par la personne qui développe (consigne du départ, `AGENTS.md` §1) | ne jamais les exécuter ; terminer par les commandes à lancer (`AGENTS.md` §11.5) |
| Coder à la demande, une US à la fois, dans l'ordre de `AGENTS.md` §8 | « US n » = la n-ième de l'ordre §8 hors fondations : 1 DEC-b, 2 DEC-a, 3 DEC-c, 4 CMD-b, 5 CMD-c, 6 CMD-a, 7 STK-b, 8 STK-c, 9 STK-a, 10 GOF-b, 11 GOF-a, 12 GOF-c, 13 PIL-b |
| Poser les choix structurants avant de coder | une seule série de questions avec l'outil de question ; la personne peut interrompre l'outil et répondre dans le message suivant (« Answering your earlier questions ») : ces réponses valent décision |
| Style de code imposé | pas de `foreach`, pas de `fn` en PHP, pas de fonction fléchée en JavaScript ; JSDoc/PHPDoc sur tout ; M/V/C strict avec les commentaires `. paramètre` / `> retour` |
| Comptes rendus pédagogiques en français | sections numérotées, tableaux, check-lists, diagnostic ; détail des fichiers modifiés ; puis les commandes Git |
| Annoncer ce qui n'a pas pu être vérifié | aucun navigateur n'est disponible dans l'environnement : le dire plutôt que de laisser croire que l'affichage est contrôlé |
| Ne déplacer ni supprimer de fichier sans demande explicite | `AGENTS.md` §0 |
| Isolation entre sites | tous les sites `/~login/…` partagent l'origine `https://mmi.unilim.fr` : voir §4, ligne « Isolation » |
| Jamais de pronom genré pour désigner la personne | écrire « la personne qui développe », « l'équipe » |
| Scripts et dépendances de test hors du dépôt | dans le dossier temporaire de la session ; jsdom n'est jamais ajouté à `package.json` |

## 4. Décisions d'architecture

| Sujet | Décision | Où |
| --- | --- | --- |
| Panier | session PHP (clé `panier`, `{ variantId => quantité }`) ; nom, prix et stock relus en base à chaque réponse ; 10 exemplaires maximum par bijou | `Model/Cart.php`, `CartController` |
| Comptes | clients en base (`utilisateur`, bcrypt, 8 caractères minimum) ; administrateurs en base (`administrateur`) avec une session distincte (`adminId`) | `AccountController`, `AdminController` |
| Accès admin | décidé par le serveur à chaque requête (session **et** base) | `AdminAreaController::requireAdmin()` |
| Session | cookie nommé `matira_session`, `Path` = chemin du projet, `Secure`, `HttpOnly`, `SameSite=Lax` | `back/index.php` |
| Isolation entre sites | `localStorage` : une seule clé, `matira:<BASE_URL>:theme` ; jamais de panier, compte ni rôle côté navigateur ; le cookie a un nom et un `Path` propres | `lib/theme.js`, `front/index.html` |
| Réservation | une transaction SQL ; numéro `MC-AAAA-NNNNN` tiré de l'id ; statut initial « en cours » ; nom et prix recopiés dans les lignes | `OrderModel` |
| Stock | porté par la variante ; « faible » à 3 exemplaires ou moins ; 409 au-delà du stock ; décrément et journal `mouvement_stock` dans la même transaction que la réservation ; ajustement du back-office journalisé (motif `ajustement`) | `Stock`, `StockModel` |
| Statuts d'une réservation | chaîne stricte validée le 2026-10-22 : « en cours » → « disponible » → « retirée » ; annulation possible tant que la réservation n'est pas retirée ; « retirée » et « annulée » sont définitifs ; passage vérifié sur le statut relu **dans la transaction** (ligne verrouillée), refus en 409 | `OrderStatus`, `AdminOrderModel::changeStatus()` |
| Annulation et stock | le stock rendu est lu dans le **journal** (somme des sorties `reservation` de la réservation), pas dans ses lignes : une réservation antérieure au journal (`MC-2026-00001` et `00002`) rend 0 au lieu de gonfler le stock ; une seule restitution par réservation | `StockModel::refundOrder()` |
| Photos envoyées | `uploads/produits/` à la racine (hors de `front/dist/` que le build vide) ; WebP 800 px et 400 px recadrés au carré ; `image_produit.fichier` = nom simple (catalogue d'origine) ou `uploads/produits/nom` | `ProductImageStorage`, `lib/image.js` |
| Slugs | dérivés du nom, rendus uniques par suffixe, **jamais modifiés** ensuite ; slug d'une sous-catégorie préfixé par celui de sa catégorie principale | `Slug`, `AdminProductModel`, `AdminCategoryModel` |
| Suppression d'un bijou | définitive ; variantes et photos supprimées en cascade ; les lignes de commande gardent nom et prix | `AdminProductModel::delete()` |
| Suppression d'une catégorie | refusée (409) tant qu'elle contient des sous-catégories ou des bijoux ; rien n'est supprimé en cascade | `AdminCategoryModel::delete()` |
| Ordre des catégories | échange avec la voisine du même niveau ; l'ordre est réécrit de 1 à n à chaque déplacement | `AdminCategoryModel::move()` |
| API | pas de paramètre dans le chemin : identifiant et slug passent en paramètre de requête ou dans le corps ; les écritures sont des `POST` avec le verbe dans le chemin (`/creer`, `/modifier`, `/supprimer`) | `routes.php` |
| Annonce après une action | `?notice=cree` etc., traduit par une liste blanche, jamais affiché tel quel | pages `admin-produits`, `admin-categories` |

## 5. Avancement

| US | Contenu | Date des commits |
| --- | --- | --- |
| DEC-b | catalogue de produits | 2026-10-16 (base de données), 2026-10-19 |
| DEC-a | navigation par catégories | 2026-10-19 |
| DEC-c | fiche produit | 2026-10-19 |
| CMD-b | panier | 2026-10-19 |
| CMD-c | comptes clients | 2026-10-20 |
| CMD-a | validation de la réservation | 2026-10-20 |
| STK-b, STK-c, STK-a | affichage, contraintes et journal du stock | 2026-10-20 |
| GOF-b | back-office : accès administrateur | 2026-10-20 |
| GOF-a | gestion des produits, photos comprises | 2026-10-21 |
| GOF-c | gestion des catégories | 2026-10-22 |
| PIL-b | gestion des réservations, avec recrédit du stock à l'annulation | 2026-10-22 (branche `feature/PIL-b-commandes`, à commiter) |

**Prochaines étapes, dans l'ordre** : SUI-b, SUI-c (historique des réservations côté client : les statuts
de PIL-b y seront affichés), SUI-a, OPT-c, OPT-b, OPT-a, PIL-a, et PRO-a/b/c en bonus.

## 6. Environnement et méthode de test

| Sujet | À savoir |
| --- | --- |
| Dossier de travail | c'est aussi le dossier **déployé** : une modification de `back/` est en production dès qu'elle est enregistrée ; le front n'est à jour qu'après `npm run build` |
| Serveur de l'IUT | protégé par une authentification HTTP : un `curl` vers `mmi.unilim.fr` répond 401 |
| Tester l'API | `php -S` sur un **port libre** (le 8099 est déjà pris) avec un routeur qui imite le `.htaccess` ; le cookie est `Secure`, donc l'envoyer à la main avec `-H "Cookie: matira_session=…"` |
| Tester le front | pas de navigateur : jsdom installé hors du dépôt, Vite en `ssrLoadModule`, `fetch` redirigé vers le serveur PHP local |
| Base réelle | les tests écrivent dans la vraie base : relever l'état avant (empreinte), nommer les données `Test GOF-x…`, tout supprimer, restaurer, puis comparer l'empreinte |
| À ne jamais faire en test | modifier ou supprimer les réservations réelles (`MC-2026-00001`, `00002`, `00004`) ; remettre un compteur auto-incrémenté à `1` ou à `MAX(id)+1` : le numéro de réservation vient de l'id, il faut le restaurer à la valeur **relevée avant le test** ; laisser des lignes orphelines dans `mouvement_stock` ; laisser des fichiers dans `uploads/produits/` |
| Tester avec des réservations | créer des réservations de test avec le compte client des seeds, puis tout restaurer à partir d'un instantané pris avant (compteurs, stocks, réservations, lignes, journal) et vérifier que l'état est identique |
| PHP | 8.4 ; GD avec JPEG, PNG et WebP ; `exif` et `finfo` présents ; `upload_max_filesize` 2 Mo, `post_max_size` 8 Mo |
| Comptes de test | voir `AGENTS.md` §2.2 |
| Git, création de branche | ne pas faire `git switch -c x origin/main` : la branche suivrait `origin/main` et un `git push` partirait **vers `main`** ; faire `git switch -c x` depuis la branche locale, puis `git push -u origin x` |
| Git, `ECONNREFUSED …vscode-git-….sock` | le terminal date d'une ancienne session VS Code : en ouvrir un nouveau |
| Git, identité | `user.name` et `user.email` ne sont pas configurés (avertissement à chaque commit) |

Le détail des pièges de code déjà rencontrés est dans `SKILL.md`, section 8.

## 7. Points en attente

- [ ] **Definition of Done du sujet** : le texte n'a pas été fourni. Dès qu'il l'est, l'intégrer (`AGENTS.md` §9 et §11, `SKILL.md` §10) et vérifier chaque US livrée.
- [ ] **Mot de passe MySQL à changer** : `back/config/config.php` a été versionné ; l'ancien mot de passe reste dans l'historique GitHub. Le fichier est maintenant ignoré par Git.
- [ ] **Script de vérification MVC** : `AGENTS.md` §9 cite `.agents/skills/verifier-mvc/scripts/check-mvc.js`, qui n'existe pas dans le dépôt.
- [ ] **Affichage jamais contrôlé dans un navigateur** : vérifier à 320, 768 et 1440 px, et au validateur W3C.
- [ ] **Photos envoyées** : au premier envoi réel, vérifier que l'image s'affiche (règle `uploads/` du `.htaccess`, droits d'écriture de PHP).
- [ ] **README.md** : c'est celui du starter (films, comptes `alice`/`admin`), obsolète.
- [ ] **Code hérité du starter** : `AuthController`, `StatsController` (ni routés, ni enregistrés), `CatalogueController`, `FilmModel` et `GET /api/films` ; à supprimer sur demande.
- [ ] **Tableau « Liens du projet » d'`AGENTS.md`** : absent d'un commit sans que sa suppression ait été confirmée ; conservé lors de la restauration du 2026-10-22 ; à confirmer.
- [ ] **Hors périmètre pour l'instant** : galerie de plusieurs photos, options d'un bijou (plusieurs variantes), changement de catégorie principale d'une sous-catégorie.

## 8. Journal

| Date | Événement |
| --- | --- |
| 2026-10-19 | DEC-b (route et front), DEC-a, DEC-c, CMD-b |
| 2026-10-20 | CMD-c, CMD-a, STK-b, STK-c, STK-a, GOF-b ; création de `SKILL.md` ; sortie du dossier `Base/` ; fusion de GOF-b dans `main` |
| 2026-10-21 | GOF-a ; `ARCHITECTURE.md` supprimé ; isolation entre sites (clé de thème préfixée, cookie `matira_session`) |
| 2026-10-22 | GOF-c ; correction du routeur (la chaîne de requête des liens `data-link` était perdue) ; restauration dans `AGENTS.md` de l'architecture du back, qui n'était jamais arrivée sur `main` ; création de `MEMOIRE.md` ; PIL-b (suivi des réservations et annulation avec recrédit du stock) |

## 9. Diagnostic

| Symptôme | Cause probable et vérification |
| --- | --- |
| Ce fichier contredit le code | le code fait foi ; corriger l'entrée et la date |
| Une décision de §4 semble mal adaptée | vérifier dans le code qu'elle est bien appliquée avant de la remettre en cause, puis demander |
| Une préférence de §3 n'est plus d'actualité | la personne qui développe le dit : mettre à jour la ligne, ne pas la deviner |
| Ce fichier grossit trop | regrouper les entrées du journal, supprimer les points résolus, renvoyer vers `AGENTS.md` ou `SKILL.md` plutôt que de dupliquer |
