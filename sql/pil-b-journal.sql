-- ---------------------------------------------------------------------------
-- Matira Création — PIL-b : journal des administrateurs (script d'ajout)
--
-- À importer dans phpMyAdmin (base sélectionnée, onglet « Importer »), sur une
-- base qui contient déjà les tables du projet : il ajoute une seule table, vide,
-- sans toucher aux données existantes. Il peut être rejoué sans effet.
-- Pour repartir d'une base vide, importer sql/import.sql.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Journal des modifications des administrateurs (PIL-b)
--
-- Une ligne par modification faite depuis le back-office : ici, chaque changement
-- de statut d'une réservation (seul ou dans une action en lot). Elle est écrite
-- dans la même transaction que la modification : l'une n'existe pas sans l'autre.
--
--   identifiant   nom de l'administrateur au moment de l'action, recopié : le
--                 journal reste lisible si le compte est supprimé ensuite
--   cible         numéro de la réservation (MC-2026-00042)
--   statut_avant  statut avant la modification, statut_apres après : on retrouve
--                 ainsi la date réelle d'un retrait
--   detail        phrase lisible, par exemple « stock rendu : 2 exemplaires »
--   lot           repère commun aux réservations traitées par une même action en lot
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_admin (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    administrateur_id INT UNSIGNED NULL,
    identifiant      VARCHAR(60)   NOT NULL,
    action           VARCHAR(40)   NOT NULL,
    cible            VARCHAR(60)   NOT NULL,
    statut_avant     VARCHAR(20)   NULL,
    statut_apres     VARCHAR(20)   NULL,
    detail           VARCHAR(255)  NOT NULL DEFAULT '',
    lot              CHAR(16)      NULL,
    date_action      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_journal_date (date_action),
    KEY idx_journal_cible (cible),

    CONSTRAINT fk_journal_administrateur
        FOREIGN KEY (administrateur_id) REFERENCES administrateur (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
