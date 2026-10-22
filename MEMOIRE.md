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
| Coder à la demande, une US à la fois, dans l'ordre de `AGENTS.md` §8 | « US n » = la n-ième de l'ordre §8 hors fondations : 1 DEC-b, 2 DEC-a, 3 DEC-c, 4 CMD-b, 5 CMD-c, 6 CMD-a, 7 STK-b, 8 STK-c, 9 STK-a, 10 GOF-b, 11 GOF-a, 12 GOF-c, 13 PIL-b, 14 SUI-b, 15 SUI-c, 16 SUI-a, 17 OPT-c, 18 OPT-b, 19 OPT-a, 20 PIL-a, puis les bonus 21 PRO-a, 22 PRO-b, 23 PRO-c |
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
| Historique du client (SUI-c) | énoncé reçu le 2026-10-22 (liste par date décroissante, statut, total, détail, filtres statut et période, options visibles, pagination) ; filtres et page **dans l'adresse** (`?statut=&du=&au=&page=`), pagination serveur à 10 par page, page trop loin ramenée à la dernière ; l'option choisie est déjà dans `ligne_commande.nom_produit` (« Bague Rangiroa — Taille 54 ») ; pages `/compte/commandes` et `/compte/commandes/:numero`, accessibles depuis « Mon compte » et la confirmation | `OrderModel::findPageForUser()`, `pages/mes-commandes`, `pages/ma-commande`, `ui/pagination` |
| Espace personnel (SUI-b) | `/compte` (accueil : informations, 3 réservations récentes, déconnexion) et `/compte/profil` (deux formulaires indépendants) ; `/connexion` redirige vers `/compte` dès que le client est connecté (la déconnexion a quitté cette page : `?deconnecte=1` y affiche l'annonce) ; une page de l'espace sans session renvoie vers `/connexion` (`replaceState` + `popstate`) ; changer le mot de passe exige l'actuel (400 s'il est faux), renouvelle l'identifiant de session et refuse un nouveau identique à l'ancien ; changer l'e-mail n'exige pas le mot de passe | `AccountController::update()`, `changePassword()`, `ui/navigation-compte`, `pages/espace-client`, `pages/profil` |
| Commander à nouveau (SUI-a) | `POST /api/commandes/reutiliser { numero }` ; on transfère **ce qui est disponible**, sans tout refuser (`ajoutee`, `partielle` si le stock ou la limite de 10 ne suffit pas, `limite` si le panier a déjà le maximum, `epuisee`, `retiree` si la variante a été supprimée) ; le panier existant est conservé, les quantités s'y ajoutent ; l'option d'origine est conservée (la ligne désigne sa variante) ; le prix est celui d'aujourd'hui, le changement est signalé ; bouton proposé sur toutes les réservations, même annulées ; le stock n'est pas réservé, la vraie vérification reste celle de la validation | `Reorder`, `OrderModel::findLinesForReorder()`, `OrderController::reorder()`, `ui/resultat-reutilisation` |
| Options des bijoux (OPT-c) | options **définies par bijou** (`option_produit`, `valeur_option`, `variante_valeur`) ; une variante = une combinaison complète, elle porte le stock ; **supplément de prix par valeur d'option** (choix validé) : prix = prix du bijou + suppléments ; fiche avec un groupe de boutons radio par option, prix et disponibilité recalculés à chaque choix ; les variantes « Modèle unique » existantes sont devenues la première combinaison (leur identifiant ne change pas) ; trois bijoux d'exemple (Ginkgo : taille ; Rangiroa : taille × perle ; bracelet cuir : coloris) | `VariantModel::priceSql()`, `ProductModel`, `lib/options.js`, `pages/produit` |
| Variantes et stock (OPT-b) | les valeurs épuisées ou sans combinaison sont **grisées et signalées dans leur libellé mais restent sélectionnables** (on peut changer les options dans n'importe quel ordre) ; le formulaire admin d'un bijou à options a **un champ de stock par combinaison**, refusé en 409 si une combinaison manque ou est inconnue, chaque changement journalisé en « ajustement » | `lib/options.js` (`getValueStatuses`), `AdminProductModel::resolveStocks()` |
| Options dans le panier (OPT-a) | les options restent **dans le nom figé** de la ligne de réservation (« Bague … — Taille 54 · Perle de Tahiti ») ; l'affichage les sépare au dernier « — » (`splitLineName`), à revoir si un nom de bijou contient « — » ; changer les options d'une ligne conserve la quantité, fusionne avec une ligne identique, garde la place de la ligne ; refus 409 si le stock de la nouvelle combinaison ne suffit pas | `Cart::replace()`, `CartController::changeOptions()`, `pages/panier` |
| Statistiques (PIL-a) | jamais mises en cache ; **revenus = réservations retirées seulement** (demande du 2026-10-22), rangées au **jour du retrait** inscrit au journal des administrateurs, repli sur le jour de réservation pour un retrait d'avant le journal ; export en CSV pour Excel (UTF-8 avec BOM, `;`) ; graphique décoratif doublé d'une liste de valeurs | `AdminStatsModel`, `StatsExport`, `pages/admin-statistiques` |
| Compléments de PIL-b | tri en liste blanche (`?tri=date\|statut\|montant`, `?ordre=asc\|desc`) ; action en lot **réservation par réservation** avec compte rendu des refus (pas de « tout ou rien »), confirmation avant une annulation en lot ; journal des administrateurs (`journal_admin`) écrit dans la même transaction que le changement de statut, nom de l'administrateur recopié ; il ne couvre que les statuts de réservation | `AdminOrderModel::changeStatusBatch()`, `writeJournal()`, `AdminJournalModel` |
| Codes promo (PRO-a) | le client saisit le code sur le récapitulatif ; le code est **revérifié à la validation** (409 et code retiré s'il n'est plus valable) ; la réservation enregistre le code, le pourcentage et la réduction ; `total` est après réduction ; réduction arrondie au franc ; un seul code à la fois ; insensible à la casse | `Promo`, `PromoModel`, `CartController::applyCode()`, `OrderModel::createFromItems()` |
| Gestion des codes (PRO-b) | une page : créer, modifier (pourcentage, actif), supprimer avec confirmation ; **le texte d'un code ne se modifie pas** ; supprimer un code ne change pas les réservations passées, leur utilisation est comptée sous « codes supprimés » ; statistiques hors réservations annulées | `AdminPromoModel`, `pages/admin-codes-promo` |
| Promotion automatique (PRO-c) | −20 % sur le bijou dont le **stock total** est le plus élevé (aucun stock : pas de promotion ; égalité : identifiant le plus petit), **calculée à chaque lecture** donc elle change de bijou avec le stock ; cumulable avec un code (le code s'applique sur le total déjà réduit, choix validé) ; prix barré, prix promotionnel et pastille affichés ; prix de la réservation figé au prix du moment | `Promotion`, `VariantModel::priceSql()`, `ui/prix` |
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
| PIL-b | gestion des réservations, avec recrédit du stock à l'annulation ; complété le 2026-10-22 : tri, actions en lot, journal des administrateurs | 2026-10-22 (branches `feature/PIL-b-commandes` puis `feature/PIL-b-complement`) |
| SUI-c | historique des réservations du client : liste paginée, filtres statut et période, détail avec options | 2026-10-22 (commit « SUI-b : historique… » sur la branche `feature/SUI-b-historique` : **mal nommés**, c'est SUI-c ; énoncé d'abord mal transmis) |
| SUI-b | espace personnel : accueil, profil, mot de passe (actuel exigé), aperçu d'activité, navigation | 2026-10-22 (branche `feature/SUI-b-espace-personnel`, poussée) |
| SUI-a | « Commander à nouveau » : transfert d'une ancienne réservation dans le panier, avec contrôle du stock | 2026-10-22 (branche `feature/SUI-a-recommander`) |
| OPT-c | options des bijoux : tables, prix selon les choix, fiche dynamique | 2026-10-22 (branche `feature/OPT-c-options`) |
| OPT-b | stock par variante : valeurs épuisées signalées, stock par combinaison au back-office | 2026-10-22 (commité avec OPT-a, branche `feature/OPT-a-options-panier`) |
| OPT-a | options dans le panier (affichage, modification) et dans les réservations | 2026-10-22 (branche `feature/OPT-a-options-panier`) |
| PIL-a | tableau de bord statistiques, revenus des réservations retirées, export CSV | 2026-10-22 (branche `feature/PIL-a-statistiques`) |
| PRO-a, PRO-b, PRO-c | codes promotionnels, leur gestion et leurs statistiques, promotion automatique | 2026-10-22 (branche `feature/PRO-a-codes-promo`) |

**Toutes les US de l'ordre de `AGENTS.md` §8 sont livrées** (bonus PRO-a/b/c compris). Reste à la personne qui développe : fusionner
les branches dans `main` **dans l'ordre de dépendance** (PIL-b, SUI-c, SUI-b, SUI-a, OPT-c, OPT-b/a, PIL-a/PIL-b complément,
PRO) et traiter les points en attente (§7). Énoncés reçus le 2026-10-22 : SUI-b = espace personnel (DoD : le mot de passe
actuel est exigé) ; SUI-c = historique (voir §4) ; SUI-a = réutiliser une commande (DoD : produits supprimés ou modifiés
depuis la commande) ; OPT-c = choix des options (DoD : options définies par produit en base, interface dynamique) ; OPT-b =
variantes et stock par variante (DoD : modélisation en base, migration) ; OPT-a = options dans le panier et les commandes
(DoD : les lignes de commande conservent options et prix) ; PIL-a = statistiques (DoD : données à jour, export) ; PIL-b
(DoD : confirmation avant annulation, journal des administrateurs) ; PRO-a = code promo en pourcentage ; PRO-b = CRUD des codes
et statistiques d'utilisation ; PRO-c = −20 % sur le produit au stock le plus élevé, prix barrés.

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
| Tables à sauvegarder avant un test | `commande`, `ligne_commande`, `mouvement_stock`, `variante.stock` (instantané), **mais aussi** `produit` (un test d'écriture admin a abîmé deux noms de bijoux le 2026-10-22), `code_promo` (compteur auto-incrémenté) et `journal_admin` (à vider et remettre à 1 après chaque test qui change un statut) |
| Envoyer un formulaire de test à l'API | ne jamais passer du texte accentué échappé (`\u00e9`) en `curl -F` : il est enregistré tel quel ; relire les valeurs avec un script PHP ou utiliser le formulaire jsdom |
| Tester sans navigateur | jsdom ne garde pas un `<slot>` placé dans un `<select>` (le navigateur le supprime) : créer les `<option>` en JavaScript |
| Données dépendant de la date | les revenus utilisent `CURDATE()` de la base : insérer des réservations de test datées de `NOW()` moins N jours, puis les supprimer |
| PHP | 8.4 ; GD avec JPEG, PNG et WebP ; `exif` et `finfo` présents ; `upload_max_filesize` 2 Mo, `post_max_size` 8 Mo |
| Comptes de test | voir `AGENTS.md` §2.2 |
| Énoncés des US | l'énoncé fait foi : un nom d'US dit de mémoire peut se tromper (SUI-b et SUI-c ont été confondues le 2026-10-22) ; vérifier le titre et les critères avant de coder | `MEMOIRE.md` §5 |
| Git, création de branche | ne pas faire `git switch -c x origin/main` : la branche suivrait `origin/main` et un `git push` partirait **vers `main`** ; faire `git switch -c x` depuis la branche locale, puis `git push -u origin x` |
| Git, `ECONNREFUSED …vscode-git-….sock` | le terminal date d'une ancienne session VS Code : en ouvrir un nouveau |
| Ne pas modifier les `.md` pendant une US (demande du 2026-10-22) | `AGENTS.md`, `SKILL.md` et `MEMOIRE.md` vivent sur `main` : les modifier sur une branche d'US bloque `git switch main` et crée des conflits ; le compte rendu liste ce qu'il faudrait y ajouter, la mise à jour se fait à la demande, sur `main` |
| Git, branches des US | `main` ne reçoit une US qu'à la demande de la personne qui développe : une US qui dépend d'une autre non fusionnée (SUI-b sur PIL-b) part de la **branche de l'US précédente** ; vérifier `git branch --show-current` avant de coder, la personne peut avoir changé de branche entre deux demandes |
| Git, `stash pop` en conflit | ne jamais commiter un fichier qui contient `<<<<<<<` : le 2026-10-22, des marqueurs de conflit ont été commités dans `MEMOIRE.md` et `SKILL.md` ; vérifier avec `grep -n "^<<<<<<<\|^>>>>>>>" *.md` avant `git add` |
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
- [ ] **Hors périmètre pour l'instant** : galerie de plusieurs photos, changement de catégorie principale d'une sous-catégorie, **création et renommage des options depuis le back-office** (les options des trois bijoux d'exemple viennent de `sql/opt-c-options.sql` ; le back-office règle seulement le stock par combinaison).
- [ ] **Promotion changeant entre le panier et la validation** : la réservation est enregistrée au prix du moment de la validation, sans avertissement ; possible amélioration : refuser (409) quand le total a changé.
- [ ] **Journal des administrateurs limité aux statuts de réservation** : les modifications de produits, de catégories et de codes promo n'y sont pas inscrites (la table est prête : `action`, `cible`).
- [ ] **Retraits d'avant le journal** : leur revenu reste rangé au jour de la réservation (pas de date de retrait connue).
- [ ] **Stocks des trois bijoux d'exemple** : répartis entre leurs combinaisons par le script `opt-c-options.sql`, sans ligne au journal de stock.
- [ ] **Fusion des branches** : une branche par US dépend de la précédente ; `main` ne les contient pas encore (voir §5).

## 8. Journal

| Date | Événement |
| --- | --- |
| 2026-10-19 | DEC-b (route et front), DEC-a, DEC-c, CMD-b |
| 2026-10-20 | CMD-c, CMD-a, STK-b, STK-c, STK-a, GOF-b ; création de `SKILL.md` ; sortie du dossier `Base/` ; fusion de GOF-b dans `main` |
| 2026-10-21 | GOF-a ; `ARCHITECTURE.md` supprimé ; isolation entre sites (clé de thème préfixée, cookie `matira_session`) |
| 2026-10-22 | SUI-a (commander à nouveau) ; SUI-c (historique du client, livré sous le nom SUI-b) ; SUI-b (espace personnel) ; GOF-c ; correction du routeur (la chaîne de requête des liens `data-link` était perdue) ; restauration dans `AGENTS.md` de l'architecture du back, qui n'était jamais arrivée sur `main` ; création de `MEMOIRE.md` ; PIL-b (suivi des réservations et annulation avec recrédit du stock) |
| 2026-10-22 | OPT-c, OPT-b, OPT-a (options des bijoux, stock par combinaison, options dans le panier) ; PIL-a (statistiques) puis complément de PIL-b (tri, lot, journal) ; revenus rangés au jour du retrait ; PRO-a, PRO-b, PRO-c (codes promo, gestion, promotion automatique) ; incident : deux noms de bijoux abîmés par un test, rétablis depuis `sql/import.sql` |

## 9. Diagnostic

| Symptôme | Cause probable et vérification |
| --- | --- |
| Ce fichier contredit le code | le code fait foi ; corriger l'entrée et la date |
| Une décision de §4 semble mal adaptée | vérifier dans le code qu'elle est bien appliquée avant de la remettre en cause, puis demander |
| Une préférence de §3 n'est plus d'actualité | la personne qui développe le dit : mettre à jour la ligne, ne pas la deviner |
| Ce fichier grossit trop | regrouper les entrées du journal, supprimer les points résolus, renvoyer vers `AGENTS.md` ou `SKILL.md` plutôt que de dupliquer |
