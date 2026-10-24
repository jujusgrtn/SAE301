# Matira Création — Click & collect (SAÉ 3.01)

Prototype de site de **click & collect** pour Matira Création, bijouterie en perle de Tahiti du centre Vaima, à
Papeete. Le client réserve ses bijoux en ligne, les essaie en boutique et les règle au retrait. Le back-office
permet à l'équipe de gérer les bijoux, les catégories, les stocks, les réservations et les codes promotionnels.

Stack : SPA en JavaScript vanilla (Vite, Tailwind CSS 4, routeur client, découpage Modèle / Vue / Contrôleur) et
API JSON en PHP 8 (PDO, MySQL), sans framework.

## 1. Liens du rendu

| Élément | Lien |
| --- | --- |
| Application hébergée (branche `main`) | <https://mmi.unilim.fr/~segrestan1/SAE301-Starter/> |
| Back-office | <https://mmi.unilim.fr/~segrestan1/SAE301-Starter/admin> |
| Dépôt GitHub | <https://github.com/jujusgrtn/SAE301> |
| Prototypes Figma (maquettes mobile, desktop et back-office) | <https://www.figma.com/design/CLkGxGjmg44XF2VdkiA001/segrestan_justine?node-id=0-1> |
| Rapport d'audit Lighthouse | [docs/rapport_lighthouse.pdf](docs/rapport_lighthouse.pdf) |
| Graphe des dépendances entre user stories et ordre de réalisation (FigJam) | <https://www.figma.com/board/LaA5KK4QRThJ8CV25L3z8F/SA%C3%89-3.01-%E2%80%93-D%C3%A9pendances-entre-user-stories?node-id=0-1> |
| Graphe des dépendances et ordre de réalisation (PDF) | [docs/graphe-dependances-user-stories.pdf](docs/graphe-dependances-user-stories.pdf) |

L'application hébergée est construite depuis la branche `main` du dépôt.

## 2. Accès pour les enseignants

Le back-office n'est pas relié à la boutique : il s'ouvre uniquement en saisissant l'adresse `/admin`.

| Espace | Adresse | Identifiant | Mot de passe |
| --- | --- | --- | --- |
| **Back-office (administrateur)** | [`/admin`](https://mmi.unilim.fr/~segrestan1/SAE301-Starter/admin) | `admin` | `MatiraAdmin2026!` |
| Compte client de test | [`/connexion`](https://mmi.unilim.fr/~segrestan1/SAE301-Starter/connexion) | `client@matira.test` | `Matira2026!` |

Ces comptes sont ceux du jeu de données de démonstration (`sql/import.sql`) : ils ne donnent accès à aucune
donnée réelle.

## 3. Documents d'analyse

| Document | Contenu |
| --- | --- |
| Graphe des dépendances et ordre de réalisation : [PDF](docs/graphe-dependances-user-stories.pdf) · [FigJam](https://www.figma.com/board/LaA5KK4QRThJ8CV25L3z8F/SA%C3%89-3.01-%E2%80%93-D%C3%A9pendances-entre-user-stories?node-id=0-1) | dépendances entre les user stories, regroupées par epic ; le numéro de chaque US est son rang dans l'ordre de réalisation |
| [Rapport d'audit Lighthouse](docs/rapport_lighthouse.pdf) | performance, accessibilité, bonnes pratiques et SEO de l'application hébergée |

La justification de l'ordre retenu est détaillée ci-dessous (section 4).

## 4. Ordre de réalisation retenu et justification

### 4.1 Principes

1. **Une US ne commence que lorsque celles dont elle dépend sont terminées** : chaque étape s'appuie sur des
   données, des écrans et des API déjà en place et testés.
2. **Livrer tôt un parcours d'achat complet** (jalon 1) : c'est la raison d'être du click & collect. Tant qu'un
   client ne peut pas aller du catalogue à la réservation, le reste n'a pas de valeur.
3. **Sécuriser le stock avant d'ouvrir la gestion** : le stock, son contrôle et son journal existent avant que
   le back-office ne puisse modifier des bijoux ou annuler des réservations.
4. **Les fonctions qui enrichissent l'existant viennent ensuite** (suivi client, options, statistiques), puis
   les **bonus** (promotions), une fois le reste stabilisé.

### 4.2 Ordre et dépendances

Le numéro est le rang de réalisation, identique à celui du graphe. « Partielle » : seule une partie de l'US
précédente est nécessaire (DEC-c a besoin des liens de catégorie de DEC-a, pas de toute la navigation).


| # | User story | Dépend de | Pourquoi à ce moment |
| --- | --- | --- | --- |
| 0 | Fondations : schéma (catégories, bijoux, variantes, photos), jeu de données, charte | — | tout le reste lit ces tables ; les données de démonstration débloquent les écrans de lecture |
| 1 | **DEC-b** Catalogue des bijoux | — | premier écran de la boutique, base de toutes les listes |
| 2 | **DEC-a** Navigation par catégories | DEC-b | filtre la liste du catalogue par catégorie |
| 3 | **DEC-c** Fiche d'un bijou | DEC-b, DEC-a (partielle) | ouverte depuis une carte du catalogue — fin de l'epic « Découvrir l'offre » |
| 4 | **CMD-b** Panier | DEC-b, DEC-c | on ajoute au panier depuis la fiche ; le panier référence la variante, qui porte le prix et le stock |
| 5 | **CMD-c** Comptes clients | — | indépendante, mais indispensable avant de réserver |
| 6 | **CMD-a** Validation de la réservation | CMD-b, CMD-c | transforme le panier d'un client connecté en réservation (transaction SQL, numéro unique) — **jalon 1 : parcours d'achat complet** |
| 7 | **STK-b** Affichage des stocks | DEC-b | le client voit la disponibilité avant d'ajouter au panier |
| 8 | **STK-c** Contraintes de stock | STK-b, CMD-b | le panier et la réservation refusent une quantité supérieure au stock |
| 9 | **STK-a** Décrément et journal du stock | STK-c, CMD-a | le stock baisse à la réservation, chaque mouvement est tracé ; prérequis du recrédit à l'annulation |
| 10 | **GOF-b** Accès au back-office | CMD-c (partielle) | porte d'entrée de toutes les US de gestion |
| 11 | **GOF-a** Gestion des bijoux | GOF-b | première fonction de gestion ; venant après STK-a, un stock modifié au back-office est aussitôt tracé au journal |
| 12 | **GOF-c** Gestion des catégories | GOF-b, DEC-a | la boutique et les bijoux reposent sur l'arbre des catégories — **jalon 2 : boutique administrable** |
| 13 | **PIL-b** Gestion des réservations | CMD-a, GOF-b, STK-a | changer le statut d'une réservation ; annuler rend le stock (recrédit tracé au journal) |
| 14 | **SUI-c** Historique des réservations du client | CMD-a, CMD-c | le client retrouve ses réservations et leur statut (mis à jour par PIL-b) |
| 15 | **SUI-b** Espace personnel | CMD-c, SUI-c (partielle) | profil, mot de passe et aperçu de l'activité, qui réutilise l'historique |
| 16 | **SUI-a** Commander à nouveau | SUI-c, STK-c | renvoie une ancienne réservation dans le panier en revérifiant le stock |
| 17 | **OPT-c** Options des bijoux | DEC-c | choix de la taille ou de la perle sur la fiche, prix selon les choix |
| 18 | **OPT-b** Stock par variante | OPT-c, STK-a | chaque combinaison d'options a son propre stock, réglé au back-office |
| 19 | **OPT-a** Options dans le panier et les réservations | OPT-c, CMD-a | les lignes conservent les options et le prix choisis — **jalon 3 : personnalisation** |
| 20 | **PIL-a** Statistiques | GOF-b, CMD-a, STK-b, PIL-b | revenus, stocks et bijoux les plus réservés : il faut des réservations et des stocks fiables |
| 21 | **PRO-a** Codes promotionnels | CMD-a | réduction appliquée au panier puis figée dans la réservation (bonus) |
| 22 | **PRO-b** Gestion des codes | PRO-a, GOF-b | création, modification et statistiques d'utilisation au back-office (bonus) |
| 23 | **PRO-c** Promotion automatique | STK-b | −20 % sur le bijou au stock le plus élevé, prix barrés (bonus) |

### 4.3 Points de l'ordre à justifier

| Choix | Justification |
| --- | --- |
| Le panier (CMD-b) avant les comptes (CMD-c) | le panier vit dans la session : on peut remplir son panier sans compte, la connexion n'est exigée qu'au moment de réserver |
| Les trois US de stock juste après le jalon 1 | dès que de vraies réservations existent, il faut empêcher la survente ; le back-office et les annulations ont ensuite besoin du journal |
| Le back-office avant le suivi client | les statuts que le client consulte (SUI) sont changés par l'équipe (PIL-b) : sans gestion, l'historique resterait figé sur « en cours » |
| SUI-c avant SUI-b | l'espace personnel affiche un aperçu de l'historique : l'historique doit exister d'abord |
| Les options (OPT) après le suivi | elles modifient le panier, les réservations et le stock déjà en place : elles s'ajoutent à un socle stable plutôt que de le bousculer |
| Les statistiques (PIL-a) presque à la fin | elles lisent les données produites par toutes les autres US ; plus tôt, elles n'auraient rien eu à mesurer |
| Les promotions (PRO) en dernier | bonus de l'énoncé : réalisées une fois toutes les US obligatoires livrées et stabilisées |

### 4.4 Après les user stories

Une fois toutes les US livrées, l'application a été mise en conformité avec les maquettes Figma et améliorée :
refonte graphique (accueil, catalogue filtrable avec tri et pagination, menu des catégories avec un panneau
« Prix / Matière », page de connexion du back-office), choix de la monnaie d'affichage (XPF, euro, dollar —
règlement toujours en XPF), couleur de la perle (blanche ou noire) pour chaque bijou, filtre « Pour qui »
(femme, homme, unisexe), galerie de trois photos par bijou.

## 5. Installer le projet

1. Importer `sql/import.sql` dans une base MySQL ou MariaDB (phpMyAdmin, onglet « Importer ») : il crée toutes les
   tables et le jeu de données de démonstration. ⚠️ Il **supprime et recrée** les tables du projet.
2. Copier `back/config/config.example.php` en `back/config/config.php` et y renseigner les identifiants de la
   base et le chemin du projet (`/~votre_login/SAE301-Starter/`).
3. Dans `front/vite.config.js`, donner à `BASE` exactement le même chemin.
4. Dans `front/` : `npm install`, puis `npm run dev` (développement) ou `npm run build` (production, dans
   `front/dist/`).

Le dossier déployé contient `.htaccess`, `back/`, `uploads/.htaccess` et `front/dist/`. La documentation
technique complète (architecture, routes de l'API, règles de code, diagnostic) est dans [`AGENTS.md`](AGENTS.md),
et la méthode de réalisation d'une user story dans [`SKILL.md`](SKILL.md).
