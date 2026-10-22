-- ---------------------------------------------------------------------------
-- Matira Création — PRO-a, PRO-b : codes promotionnels (script d'ajout)
--
-- À importer dans phpMyAdmin (base sélectionnée, onglet « Importer »), UNE FOIS,
-- sur une base qui contient déjà les tables du projet : il ajoute la table des
-- codes, quatre colonnes à la table commande (les réservations existantes passent
-- à « aucun code, réduction 0 ») et trois codes d'exemple, sans rien supprimer.
-- Il suppose MariaDB (« IF NOT EXISTS » sur les colonnes), comme le serveur de l'IUT.
-- Pour repartir d'une base vide, importer sql/import.sql.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Codes promotionnels (PRO-a, PRO-b)
--
-- code : saisi par le client, comparé sans tenir compte des majuscules (stocké en
--        majuscules). pourcentage : réduction sur le total de la réservation, de 1 à 100.
-- actif : un code désactivé reste dans la base (et dans les statistiques) mais
--        n'est plus accepté.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS code_promo (
    id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code          VARCHAR(30)       NOT NULL,
    pourcentage   TINYINT UNSIGNED  NOT NULL,
    actif         TINYINT(1)        NOT NULL DEFAULT 1,
    date_creation DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_code_promo_code (code),

    CONSTRAINT ck_code_promo_pourcentage CHECK (pourcentage BETWEEN 1 AND 100)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

ALTER TABLE commande
    ADD COLUMN IF NOT EXISTS code_promo_id SMALLINT UNSIGNED NULL AFTER total,
    ADD COLUMN IF NOT EXISTS code_promo VARCHAR(30) NULL AFTER code_promo_id,
    ADD COLUMN IF NOT EXISTS pourcentage_promo TINYINT UNSIGNED NULL AFTER code_promo,
    ADD COLUMN IF NOT EXISTS reduction INT UNSIGNED NOT NULL DEFAULT 0 AFTER pourcentage_promo,
    ADD KEY IF NOT EXISTS idx_commande_code_promo (code_promo_id),
    ADD CONSTRAINT fk_commande_code_promo
        FOREIGN KEY (code_promo_id) REFERENCES code_promo (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;

-- Codes d'exemple (PRO-a) : un code actif à 10 %, un à 15 %, un désactivé.
INSERT INTO code_promo (code, pourcentage, actif) VALUES
    ('BIENVENUE10', 10, 1),
    ('TAHITI15', 15, 1),
    ('ARCHIVE5', 5, 0);
