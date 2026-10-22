-- ---------------------------------------------------------------------------
-- Matira Création — OPT-c : options des bijoux (script d'ajout)
--
-- À importer dans phpMyAdmin (base sélectionnée, onglet « Importer »), UNE FOIS,
-- sur une base qui contient déjà les tables du projet : il ajoute les trois
-- tables d'options et trois bijoux d'exemple, SANS toucher aux comptes, aux
-- réservations ni aux stocks des autres bijoux.
-- Pour repartir d'une base vide, importer sql/import.sql (qui contient la
-- même chose, mais supprime et recrée toutes les tables).
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

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
