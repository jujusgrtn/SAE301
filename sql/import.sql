-- ---------------------------------------------------------------------------
-- Matira Création — click & collect : tables et jeu de données
--
-- Périmètre : les deux premiers epics.
--   - « Découvrir l'offre » (DEC-a, DEC-b, DEC-c) : categorie, produit,
--     image_produit ;
--   - « Commander en click & collect » (CMD-a, CMD-b, CMD-c) : variante,
--     utilisateur, commande, ligne_commande ;
--   - « Gérer les stocks » (STK-a) : mouvement_stock ;
--   - « Personnaliser » (OPT-c) : option_produit, valeur_option, variante_valeur ;
--   - « Gérer l'offre » (GOF-b) : administrateur.
-- Les options (taille, coloris…) relèvent de l'epic « Personnaliser » et ne
-- sont pas créées ici.
--
-- Ce script ne crée PAS de base : sélectionnez d'abord votre base dans
-- phpMyAdmin, puis importez ce fichier depuis l'onglet « Importer ».
-- Il ne touche pas aux tables film et genre du starter.
--
-- L'import est rejouable : les tables sont supprimées avant d'être recréées.
-- Les prix sont en francs pacifiques (XPF), monnaie sans centimes : entiers.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

-- Suppression dans l'ordre inverse des dépendances (clés étrangères).
DROP TABLE IF EXISTS administrateur;
DROP TABLE IF EXISTS mouvement_stock;
DROP TABLE IF EXISTS ligne_commande;
DROP TABLE IF EXISTS commande;
DROP TABLE IF EXISTS utilisateur;
DROP TABLE IF EXISTS variante_valeur;
DROP TABLE IF EXISTS valeur_option;
DROP TABLE IF EXISTS option_produit;
DROP TABLE IF EXISTS variante;
DROP TABLE IF EXISTS image_produit;
DROP TABLE IF EXISTS produit;
DROP TABLE IF EXISTS categorie;

-- ---------------------------------------------------------------------------
-- Catégories et sous-catégories (DEC-a)
--
-- Une catégorie sans parent est une entrée du menu principal (Colliers,
-- Bagues…). Une catégorie avec parent_id est une entrée de son sous-menu
-- (Colliers > Plaqué or 18 cts). Les produits sont rattachés aux
-- sous-catégories ; une catégorie principale affiche les produits de toutes
-- ses sous-catégories.
--
-- slug : identifiant lisible utilisé dans l'URL (/categorie/colliers-plaque-or),
-- unique sur toutes les catégories.
-- ordre : position dans le menu ou le sous-menu.
-- ---------------------------------------------------------------------------
CREATE TABLE categorie (
    id          TINYINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    parent_id   TINYINT UNSIGNED  NULL DEFAULT NULL,
    nom         VARCHAR(60)       NOT NULL,
    slug        VARCHAR(60)       NOT NULL,
    description VARCHAR(255)      NOT NULL DEFAULT '',
    ordre       TINYINT UNSIGNED  NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    UNIQUE KEY uq_categorie_slug (slug),
    KEY idx_categorie_parent (parent_id),

    -- RESTRICT : impossible de supprimer une catégorie qui a des
    -- sous-catégories (la règle de suppression complète viendra avec GOF-c).
    CONSTRAINT fk_categorie_parent
        FOREIGN KEY (parent_id) REFERENCES categorie (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Produits (DEC-b, DEC-c)
-- ---------------------------------------------------------------------------
CREATE TABLE produit (
    id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    categorie_id TINYINT UNSIGNED  NOT NULL,
    nom          VARCHAR(120)      NOT NULL,
    slug         VARCHAR(120)      NOT NULL,
    description  TEXT              NOT NULL,
    prix         INT UNSIGNED      NOT NULL,
    date_ajout   DATE              NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_produit_slug (slug),
    KEY idx_produit_categorie (categorie_id),

    CONSTRAINT fk_produit_categorie
        FOREIGN KEY (categorie_id) REFERENCES categorie (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT ck_produit_prix CHECK (prix > 0)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Images des produits (DEC-b : image principale, DEC-c : galerie)
--
-- fichier : nom de base dans front/public/images/produits/. Deux tailles
-- existent : <fichier>.webp (800 px) et <fichier>-400.webp (400 px).
-- L'image d'ordre 0 est l'image principale.
-- ---------------------------------------------------------------------------
CREATE TABLE image_produit (
    id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    produit_id SMALLINT UNSIGNED NOT NULL,
    fichier    VARCHAR(120)      NOT NULL,
    alt        VARCHAR(255)      NOT NULL,
    ordre      TINYINT UNSIGNED  NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    UNIQUE KEY uq_image_produit_ordre (produit_id, ordre),

    CONSTRAINT fk_image_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Variantes (CMD-b, CMD-a)
--
-- Chaque produit a une seule variante « Modèle unique » pour l'instant : c'est
-- elle que le panier et les lignes de commande référencent, et elle porte le
-- stock. Quand les options arriveront (epic « Personnaliser »), un produit
-- aura plusieurs variantes sans que le panier ni les commandes ne changent.
-- ---------------------------------------------------------------------------
CREATE TABLE variante (
    id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    produit_id SMALLINT UNSIGNED NOT NULL,
    libelle    VARCHAR(80)       NOT NULL DEFAULT 'Modèle unique',
    stock      SMALLINT UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    KEY idx_variante_produit (produit_id),

    CONSTRAINT fk_variante_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Options des bijoux (OPT-c)
--
-- Les options sont définies PAR PRODUIT : une bague a une « Taille », un
-- bracelet des « Coloris ». Chaque valeur peut ajouter un supplément au prix
-- du bijou (en XPF, 0 le plus souvent).
--
--   option_produit   une option d'un bijou (« Taille »)
--   valeur_option    ses valeurs (« 52 », « 54 »…) et leur supplément
--   variante_valeur  la valeur choisie, par option, pour chaque variante
--
-- Une variante est une combinaison complète (« Taille 54 · Perle de Tahiti ») :
-- elle porte le stock, le panier et les commandes la désignent. Son prix est
-- celui du bijou plus les suppléments de ses valeurs. Le couple
-- (variante_id, option_id) est la clé : une variante a exactement une valeur
-- par option, et la clé étrangère composite garantit que cette valeur
-- appartient bien à cette option.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS option_produit (
    id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    produit_id SMALLINT UNSIGNED NOT NULL,
    nom        VARCHAR(40)       NOT NULL,
    ordre      TINYINT UNSIGNED  NOT NULL DEFAULT 1,

    PRIMARY KEY (id),
    UNIQUE KEY uq_option_produit_nom (produit_id, nom),
    UNIQUE KEY uq_option_produit_ordre (produit_id, ordre),

    CONSTRAINT fk_option_produit
        FOREIGN KEY (produit_id) REFERENCES produit (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS valeur_option (
    id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    option_id  SMALLINT UNSIGNED NOT NULL,
    valeur     VARCHAR(60)       NOT NULL,
    supplement INT UNSIGNED      NOT NULL DEFAULT 0,
    ordre      TINYINT UNSIGNED  NOT NULL DEFAULT 1,

    PRIMARY KEY (id),
    UNIQUE KEY uq_valeur_option_valeur (option_id, valeur),
    UNIQUE KEY uq_valeur_option_cle (id, option_id),

    CONSTRAINT fk_valeur_option
        FOREIGN KEY (option_id) REFERENCES option_produit (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS variante_valeur (
    variante_id SMALLINT UNSIGNED NOT NULL,
    option_id   SMALLINT UNSIGNED NOT NULL,
    valeur_id   SMALLINT UNSIGNED NOT NULL,

    PRIMARY KEY (variante_id, option_id),
    KEY idx_variante_valeur_valeur (valeur_id),

    CONSTRAINT fk_variante_valeur_variante
        FOREIGN KEY (variante_id) REFERENCES variante (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_variante_valeur_valeur
        FOREIGN KEY (valeur_id, option_id) REFERENCES valeur_option (id, option_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Clients (CMD-c)
--
-- mot_de_passe : empreinte bcrypt produite par password_hash(), jamais le mot
-- de passe en clair (60 caractères, 255 prévus pour les algorithmes futurs).
-- ---------------------------------------------------------------------------
CREATE TABLE utilisateur (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    prenom        VARCHAR(60)   NOT NULL,
    nom           VARCHAR(60)   NOT NULL,
    email         VARCHAR(190)  NOT NULL,
    mot_de_passe  VARCHAR(255)  NOT NULL,
    date_creation DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_utilisateur_email (email)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Administrateurs du back-office (GOF-b)
--
-- Table distincte de utilisateur : un compte client ne peut jamais devenir
-- administrateur, et la connexion au back-office a son propre formulaire.
-- identifiant : nom de connexion (pas d'e-mail pour l'équipe).
-- mot_de_passe : empreinte bcrypt produite par password_hash().
-- ---------------------------------------------------------------------------
CREATE TABLE administrateur (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    identifiant   VARCHAR(60)   NOT NULL,
    mot_de_passe  VARCHAR(255)  NOT NULL,
    date_creation DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_administrateur_identifiant (identifiant)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Commandes (CMD-a)
--
-- numero : identifiant unique montré au client, par exemple MC-2026-00042.
-- statut : « en cours » à la validation ; les autres valeurs serviront au
-- suivi (SUI-c) et au back-office (PIL-b).
-- total : somme des lignes au moment de la validation, en XPF.
-- ---------------------------------------------------------------------------
CREATE TABLE commande (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    numero         VARCHAR(20)   NOT NULL,
    utilisateur_id INT UNSIGNED  NOT NULL,
    statut         ENUM('en cours', 'disponible', 'retirée', 'annulée')
                                 NOT NULL DEFAULT 'en cours',
    total          INT UNSIGNED  NOT NULL,
    date_commande  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_commande_numero (numero),
    KEY idx_commande_utilisateur (utilisateur_id),

    CONSTRAINT fk_commande_utilisateur
        FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Lignes de commande (CMD-a)
--
-- nom_produit et prix_unitaire sont recopiés au moment de la commande : la
-- commande reste exacte même si le produit est renommé, change de prix ou
-- est supprimé ensuite (DoD de CMD-a : « prix au moment de la commande »).
-- ---------------------------------------------------------------------------
CREATE TABLE ligne_commande (
    id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    commande_id   INT UNSIGNED      NOT NULL,
    variante_id   SMALLINT UNSIGNED NULL,
    nom_produit   VARCHAR(120)      NOT NULL,
    prix_unitaire INT UNSIGNED      NOT NULL,
    quantite      SMALLINT UNSIGNED NOT NULL,

    PRIMARY KEY (id),
    KEY idx_ligne_commande (commande_id),
    KEY idx_ligne_variante (variante_id),

    CONSTRAINT fk_ligne_commande
        FOREIGN KEY (commande_id) REFERENCES commande (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- SET NULL : supprimer un produit ne fait pas disparaître les commandes
    -- passées, qui gardent leur nom et leur prix recopiés.
    CONSTRAINT fk_ligne_variante
        FOREIGN KEY (variante_id) REFERENCES variante (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT ck_ligne_quantite CHECK (quantite > 0)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Journal des mouvements de stock (STK-a)
--
-- Une ligne par variation du stock d'une variante : sortie à la validation
-- d'une réservation, entrée à son annulation (PIL-b), ajustement manuel
-- (back-office). Le journal permet de retrouver l'origine de chaque stock.
--
-- quantite : variation signée (-2 = deux exemplaires sortis, +1 = un rentré).
-- stock_apres : stock de la variante juste après le mouvement.
-- variante_id et commande_id passent à NULL si la variante ou la réservation
-- est supprimée : le journal reste complet.
-- ---------------------------------------------------------------------------
CREATE TABLE mouvement_stock (
    id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    variante_id    SMALLINT UNSIGNED NULL,
    commande_id    INT UNSIGNED      NULL,
    quantite       SMALLINT          NOT NULL,
    stock_apres    SMALLINT UNSIGNED NOT NULL,
    motif          ENUM('reservation', 'annulation', 'ajustement') NOT NULL,
    date_mouvement DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_mouvement_variante (variante_id),
    KEY idx_mouvement_commande (commande_id),

    CONSTRAINT fk_mouvement_variante
        FOREIGN KEY (variante_id) REFERENCES variante (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_mouvement_commande
        FOREIGN KEY (commande_id) REFERENCES commande (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT ck_mouvement_quantite CHECK (quantite <> 0)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Jeu de données : menus de la maquette Figma et bijoux de matiracreation.com
-- ---------------------------------------------------------------------------

-- Menu principal (parent_id NULL), dans l'ordre de l'en-tête de la maquette.
INSERT INTO categorie (id, parent_id, nom, slug, description, ordre) VALUES
    (1, NULL, 'Colliers', 'colliers',
        'Colliers et sautoirs autour de la perle de Tahiti.', 1),
    (2, NULL, 'Bagues', 'bagues',
        'Bagues ouvertes et toi et moi, sublimées par la perle de Tahiti et les keishis.', 2),
    (3, NULL, 'Bracelets', 'bracelets',
        'Bracelets fins à porter seuls ou à accumuler.', 3),
    (4, NULL, 'Boucles d''oreilles', 'boucles-oreilles',
        'Boucles d''oreilles pendantes et anneaux ornés de perles de Tahiti.', 4),
    (5, NULL, 'Homme', 'homme',
        'Cuir, argent et pierres naturelles : des bijoux masculins autour de la perle de Tahiti.', 5);

-- Sous-menus.
INSERT INTO categorie (id, parent_id, nom, slug, description, ordre) VALUES
    (6,  1, 'Plaqué or 18 cts', 'colliers-plaque-or',
        'Colliers en plaqué or 18 carats, légers et lumineux.', 1),
    (7,  1, 'Acier inoxydable', 'colliers-acier',
        'Colliers et sautoirs en acier inoxydable, qui ne craignent ni le sel ni le soleil.', 2),
    (8,  2, 'Plaqué or 18 cts', 'bagues-plaque-or',
        'Bagues ouvertes en plaqué or 18 carats, ajustables.', 1),
    (9,  2, 'Acier inoxydable', 'bagues-acier',
        'Bagues en acier inoxydable, pour les porter tous les jours.', 2),
    (10, 3, 'Plaqué or 18 cts', 'bracelets-plaque-or',
        'Bracelets en plaqué or 18 carats, chaînes fines et keishis.', 1),
    (11, 3, 'Acier inoxydable', 'bracelets-acier',
        'Bracelets en acier inoxydable, résistants à l''eau de mer.', 2),
    (12, 4, 'Plaqué or 18 cts', 'boucles-oreilles-plaque-or',
        'Boucles d''oreilles en plaqué or 18 carats.', 1),
    (13, 4, 'Acier inoxydable', 'boucles-oreilles-acier',
        'Boucles d''oreilles en acier inoxydable, inspirées du lagon et du tiare.', 2),
    (14, 5, 'Bracelets', 'homme-bracelets',
        'Bracelets homme en cuir et pierres naturelles.', 1),
    (15, 5, 'Pendentifs', 'homme-pendentifs',
        'Pendentifs homme en argent, symboles polynésiens et perle de Tahiti.', 2);

-- 4 bijoux par catégorie principale, rattachés à leur sous-catégorie.
INSERT INTO produit (id, categorie_id, nom, slug, description, prix, date_ajout) VALUES
    -- Colliers
    (1,  6,  'Collier chaîne boulette et perle', 'collier-chaine-boulette-perle',
        'Fine chaîne boulette en plaqué or 18 carats, ponctuée d''une perle de Tahiti en pendentif.', 14900, '2026-09-28'),
    (2,  6,  'Collier double Palms et perle', 'collier-double-palms-perle',
        'Double rang en plaqué or 18 carats, médaille feuille de palmier et perle de Tahiti.', 14500, '2026-08-30'),
    (3,  7,  'Sautoir Tiare minimaliste', 'sautoir-tiare-minimaliste',
        'Long sautoir en acier inoxydable rythmé de fleurs de tiare et de perles.', 12500, '2026-09-24'),
    (4,  7,  'Sautoir Oursin gris', 'sautoir-oursin-gris',
        'Sautoir en acier inoxydable aux perles grises, inspiré des oursins du lagon.', 14000, '2026-09-10'),

    -- Bagues
    (5,  8,  'Bague Toi et Moi 2 perles', 'bague-toi-et-moi-2-perles',
        'Bague ouverte en plaqué or 18 carats, deux perles de Tahiti face à face.', 16000, '2026-10-02'),
    (6,  8,  'Bague Ginkgo et keishi', 'bague-ginkgo-keishi',
        'Bague ouverte en plaqué or 18 carats, feuille de ginkgo et keishi.', 5900, '2026-09-20'),
    (7,  8,  'Bague martelée Toi et Moi keishis', 'bague-martelee-toi-et-moi-keishis',
        'Anneau martelé en plaqué or 18 carats, terminé par deux keishis.', 7900, '2026-09-14'),
    (8,  9,  'Bague Rangiroa acier doré et perle', 'bague-rangiroa-acier-dore-perle',
        'Bague ouverte en acier doré, deux anneaux entrelacés autour d''une perle de Tahiti.', 14900, '2026-08-20'),

    -- Bracelets
    (9,  10, 'Bracelet pastilles et keishi blanc', 'bracelet-pastilles-keishi-blanc',
        'Bracelet en plaqué or 18 carats bordé de pastilles rondes, avec un keishi blanc en breloque.', 5900, '2026-09-26'),
    (10, 10, 'Bracelet chaîne serpent et perle de Tahiti', 'bracelet-chaine-serpent-perle-tahiti',
        'Chaîne serpent en plaqué or 18 carats, centrée sur une perle de Tahiti.', 9900, '2026-09-12'),
    (11, 11, 'Bracelet Ape minimaliste', 'bracelet-ape-minimaliste-acier',
        'Chaîne fine en acier inoxydable, feuille de ape ciselée et perle de Tahiti.', 4500, '2026-09-08'),
    (12, 11, 'Bracelet chaîne et keishis', 'bracelet-keishis-chaine-acier',
        'Chaîne en acier inoxydable ponctuée de keishis aux reflets argentés.', 6900, '2026-08-28'),

    -- Boucles d'oreilles
    (13, 12, 'Boucles d''oreilles chaîne serpent et perle', 'boucles-oreilles-chaine-serpent-perle',
        'Pendantes en chaîne serpent plaquée or 18 carats, terminées par une perle de Tahiti.', 9500, '2026-09-12'),
    (14, 13, 'Boucles d''oreilles Tiare et perle de Tahiti', 'boucles-oreilles-tiare-perle-tahiti',
        'Fleur de tiare en acier inoxydable et perle de Tahiti, sur crochet.', 7000, '2026-09-24'),
    (15, 13, 'Boucles d''oreilles serpent acier et perle', 'boucles-oreilles-serpent-acier-perle',
        'Chaîne serpent en acier inoxydable terminée par une perle de Tahiti.', 7000, '2026-09-05'),
    (16, 13, 'Boucles d''oreilles Rangiroa acier et perle', 'boucles-oreilles-rangiroa-acier-perle',
        'Anneau en acier inoxydable habité d''une perle de Tahiti, comme un atoll.', 19900, '2026-08-20'),

    -- Homme
    (17, 14, 'Bracelet cuir tressé et perle de Tahiti', 'bracelet-cuir-tresse-perle-tahiti',
        'Cuir fin tressé, fermoir aimanté en acier et perle de Tahiti.', 9000, '2026-09-18'),
    (18, 14, 'Bracelet 3 tours noir et vert', 'bracelet-homme-3-tours-noir-vert',
        'Trois tours de pierres naturelles noires et vertes autour d''une perle de Tahiti.', 10500, '2026-09-02'),
    (19, 15, 'Pendentif hameçon argent et perle', 'pendentif-hamecon-argent-perle',
        'Hameçon polynésien en argent, porte-bonheur des pêcheurs, avec sa perle de Tahiti.', 11900, '2026-08-25'),
    (20, 15, 'Pendentif rame spirale argent et perle', 'pendentif-rame-spirale-argent-perle',
        'Rame de pirogue en argent gravée d''une spirale, perle de Tahiti sertie.', 13900, '2026-08-25');

-- Image principale de chaque bijou (ordre 0).
INSERT INTO image_produit (produit_id, fichier, alt, ordre) VALUES
    (1,  'collier-chaine-boulette-perle',         'Collier chaîne boulette plaqué or avec une perle de Tahiti', 0),
    (2,  'collier-double-palms-perle',            'Collier double rang plaqué or, médaille Palms et perle', 0),
    (3,  'sautoir-tiare-minimaliste',             'Sautoir en acier à fleurs de tiare et perles', 0),
    (4,  'sautoir-oursin-gris',                   'Sautoir Oursin en acier à perles grises', 0),
    (5,  'bague-toi-et-moi-2-perles',             'Bagues Toi et Moi plaqué or à deux perles de Tahiti', 0),
    (6,  'bague-ginkgo-keishi',                   'Bagues plaqué or feuille de ginkgo et keishi', 0),
    (7,  'bague-martelee-toi-et-moi-keishis',     'Bagues martelées plaqué or à deux keishis', 0),
    (8,  'bague-rangiroa-acier-dore-perle',       'Bagues Rangiroa en acier doré et perles de Tahiti', 0),
    (9,  'bracelet-pastilles-keishi-blanc',       'Bracelet plaqué or à pastilles rondes et keishi blanc', 0),
    (10, 'bracelet-chaine-serpent-perle-tahiti',  'Bracelet chaîne serpent plaqué or et perle de Tahiti', 0),
    (11, 'bracelet-ape-minimaliste-acier',        'Bracelet fin en acier, feuille de ape et perle de Tahiti', 0),
    (12, 'bracelet-keishis-chaine-acier',         'Bracelet chaîne en acier ponctuée de keishis', 0),
    (13, 'boucles-oreilles-chaine-serpent-perle', 'Boucles d''oreilles chaîne serpent plaqué or et perles', 0),
    (14, 'boucles-oreilles-tiare-perle-tahiti',   'Boucles d''oreilles fleur de tiare en acier et perle', 0),
    (15, 'boucles-oreilles-serpent-acier-perle',  'Boucles d''oreilles chaîne serpent en acier et perles', 0),
    (16, 'boucles-oreilles-rangiroa-acier-perle', 'Boucles d''oreilles anneau Rangiroa en acier et perle', 0),
    (17, 'bracelet-cuir-tresse-perle-tahiti',     'Bracelets homme en cuir tressé et perle de Tahiti', 0),
    (18, 'bracelet-homme-3-tours-noir-vert',      'Bracelet homme trois tours en pierres noires et vertes', 0),
    (19, 'pendentif-hamecon-argent-perle',        'Pendentifs hameçon en argent et perle de Tahiti', 0),
    (20, 'pendentif-rame-spirale-argent-perle',   'Pendentif rame spirale en argent et perle', 0);

-- Une variante « Modèle unique » par bijou. Stocks variés (dont un épuisé et
-- quelques stocks faibles) pour pouvoir tester le panier et les commandes.
INSERT INTO variante (produit_id, libelle, stock) VALUES
    (1,  'Modèle unique', 6),  (2,  'Modèle unique', 5),
    (3,  'Modèle unique', 3),  (4,  'Modèle unique', 0),
    (5,  'Modèle unique', 2),  (6,  'Modèle unique', 10),
    (7,  'Modèle unique', 7),  (8,  'Modèle unique', 1),
    (9,  'Modèle unique', 12), (10, 'Modèle unique', 4),
    (11, 'Modèle unique', 9),  (12, 'Modèle unique', 6),
    (13, 'Modèle unique', 2),  (14, 'Modèle unique', 10),
    (15, 'Modèle unique', 8),  (16, 'Modèle unique', 4),
    (17, 'Modèle unique', 7),  (18, 'Modèle unique', 5),
    (19, 'Modèle unique', 2),  (20, 'Modèle unique', 6);

-- ---------------------------------------------------------------------------
-- Options d'exemple (OPT-c) : trois bijoux avec des choix
--
--   Bague Ginkgo et keishi      Taille 52 / 54 / 56
--   Bague Rangiroa acier doré   Taille 52 / 54 / 56  ×  Perle (keishi blanc,
--                               ou perle de Tahiti à +3 000 XPF) ; la taille 56
--                               en perle de Tahiti est épuisée, pour l'exemple
--   Bracelet cuir tressé        Coloris noir / marron / vert
--
-- La variante « Modèle unique » existante devient la première combinaison
-- (son identifiant, donc les paniers et les commandes qui la citent, ne change
-- pas) ; les autres combinaisons sont ajoutées. Le stock du bijou est réparti
-- entre ses combinaisons.
-- À exécuter UNE SEULE FOIS : la deuxième exécution s'arrête sur la première
-- option, déjà présente, sans rien modifier.
-- ---------------------------------------------------------------------------

-- Bague Ginkgo et keishi : Taille
SET @p = (SELECT id FROM produit WHERE slug = 'bague-ginkgo-keishi');
INSERT INTO option_produit (produit_id, nom, ordre) VALUES (@p, 'Taille', 1);
SET @taille = LAST_INSERT_ID();
INSERT INTO valeur_option (option_id, valeur, supplement, ordre) VALUES
    (@taille, '52', 0, 1), (@taille, '54', 0, 2), (@taille, '56', 0, 3);
UPDATE variante SET libelle = 'Taille 52', stock = 4 WHERE produit_id = @p AND libelle = 'Modèle unique';
INSERT INTO variante (produit_id, libelle, stock) VALUES (@p, 'Taille 54', 4), (@p, 'Taille 56', 2);
INSERT INTO variante_valeur (variante_id, option_id, valeur_id)
    SELECT variante.id, valeur_option.option_id, valeur_option.id
      FROM variante
      JOIN valeur_option ON valeur_option.option_id = @taille
                        AND variante.libelle = CONCAT('Taille ', valeur_option.valeur)
     WHERE variante.produit_id = @p;

-- Bracelet cuir tressé et perle de Tahiti : Coloris
SET @p = (SELECT id FROM produit WHERE slug = 'bracelet-cuir-tresse-perle-tahiti');
INSERT INTO option_produit (produit_id, nom, ordre) VALUES (@p, 'Coloris', 1);
SET @coloris = LAST_INSERT_ID();
INSERT INTO valeur_option (option_id, valeur, supplement, ordre) VALUES
    (@coloris, 'Noir', 0, 1), (@coloris, 'Marron', 0, 2), (@coloris, 'Vert', 0, 3);
UPDATE variante SET libelle = 'Coloris Noir', stock = 3 WHERE produit_id = @p AND libelle = 'Modèle unique';
INSERT INTO variante (produit_id, libelle, stock) VALUES (@p, 'Coloris Marron', 2), (@p, 'Coloris Vert', 2);
INSERT INTO variante_valeur (variante_id, option_id, valeur_id)
    SELECT variante.id, valeur_option.option_id, valeur_option.id
      FROM variante
      JOIN valeur_option ON valeur_option.option_id = @coloris
                        AND variante.libelle = CONCAT('Coloris ', valeur_option.valeur)
     WHERE variante.produit_id = @p;

-- Bague Rangiroa acier doré et perle : Taille × Perle
SET @p = (SELECT id FROM produit WHERE slug = 'bague-rangiroa-acier-dore-perle');
INSERT INTO option_produit (produit_id, nom, ordre) VALUES (@p, 'Taille', 1);
SET @taille = LAST_INSERT_ID();
INSERT INTO option_produit (produit_id, nom, ordre) VALUES (@p, 'Perle', 2);
SET @perle = LAST_INSERT_ID();
INSERT INTO valeur_option (option_id, valeur, supplement, ordre) VALUES
    (@taille, '52', 0, 1), (@taille, '54', 0, 2), (@taille, '56', 0, 3),
    (@perle, 'Keishi blanc', 0, 1), (@perle, 'Perle de Tahiti', 3000, 2);
UPDATE variante SET libelle = 'Taille 52 · Keishi blanc', stock = 1 WHERE produit_id = @p AND libelle = 'Modèle unique';
INSERT INTO variante (produit_id, libelle, stock) VALUES
    (@p, 'Taille 54 · Keishi blanc', 2),     (@p, 'Taille 56 · Keishi blanc', 2),
    (@p, 'Taille 52 · Perle de Tahiti', 1),  (@p, 'Taille 54 · Perle de Tahiti', 2),
    (@p, 'Taille 56 · Perle de Tahiti', 0);
INSERT INTO variante_valeur (variante_id, option_id, valeur_id)
    SELECT variante.id, valeur_option.option_id, valeur_option.id
      FROM variante
      JOIN valeur_option ON valeur_option.option_id = @taille
                        AND variante.libelle LIKE CONCAT('Taille ', valeur_option.valeur, ' · %')
     WHERE variante.produit_id = @p;
INSERT INTO variante_valeur (variante_id, option_id, valeur_id)
    SELECT variante.id, valeur_option.option_id, valeur_option.id
      FROM variante
      JOIN valeur_option ON valeur_option.option_id = @perle
                        AND variante.libelle LIKE CONCAT('% · ', valeur_option.valeur)
     WHERE variante.produit_id = @p;

-- Compte client de test (CMD-c) : client@matira.test / Matira2026!
-- L'empreinte a été produite par password_hash('Matira2026!', PASSWORD_BCRYPT).
INSERT INTO utilisateur (prenom, nom, email, mot_de_passe) VALUES
    ('Marie', 'Teriitahi', 'client@matira.test',
        '$2y$10$G608CcdOXR16quwM1zlCIexDlh/MgzctwjKUwjqoVeiq.KRkRwxW6');

-- Compte administrateur de test (GOF-b) : admin / MatiraAdmin2026!
-- L'empreinte a été produite par password_hash('MatiraAdmin2026!', PASSWORD_BCRYPT).
INSERT INTO administrateur (identifiant, mot_de_passe) VALUES
    ('admin',
        '$2y$12$jP6BwWf.MbRIGa9Qjtz77.ERPaZzEb6c1cUQ8QaFrIj6Az51pWwRK');
