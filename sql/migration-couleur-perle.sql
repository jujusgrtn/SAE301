-- ---------------------------------------------------------------------------
-- Couleur de la perle (blanche ou noire) pour chaque bijou
--
-- Ajoute à CHAQUE bijou l'option « Couleur de la perle » avec deux valeurs,
-- « Blanche » et « Noire », sans supplément de prix.
--
-- Pour chaque variante existante :
--   - la variante elle-même devient la combinaison « blanche » : elle garde
--     son identifiant, donc les paniers et les réservations qui la citent ne
--     changent pas, et son stock ne bouge pas ;
--   - une variante « noire » est créée à côté, avec le même stock de départ
--     (à ajuster ensuite depuis le back-office, page Modifier du bijou).
-- Un bijou qui avait déjà des options (taille, coloris, perle) les garde : la
-- couleur de la perle s'ajoute à elles, et chaque combinaison est doublée.
--
-- Le stock de départ de la variante noire n'est pas inscrit au journal des
-- mouvements, comme les stocks de départ du jeu de données.
--
-- Rejouable sans effet : chaque étape ignore ce qui existe déjà. Pour
-- l'exécuter sur une base existante, coller ce fichier dans l'onglet « SQL » de
-- phpMyAdmin (sans réimporter la base).
-- ---------------------------------------------------------------------------

-- 1. L'option, en dernière position parmi les options du bijou.
INSERT INTO option_produit (produit_id, nom, ordre)
SELECT produit.id,
       'Couleur de la perle',
       COALESCE((SELECT MAX(existante.ordre) FROM option_produit AS existante WHERE existante.produit_id = produit.id), 0) + 1
  FROM produit
 WHERE NOT EXISTS (
        SELECT 1 FROM option_produit AS deja
         WHERE deja.produit_id = produit.id AND deja.nom = 'Couleur de la perle'
       );

-- 2. Ses deux valeurs.
INSERT INTO valeur_option (option_id, valeur, supplement, ordre)
SELECT option_produit.id, choix.valeur, 0, choix.ordre
  FROM option_produit
  JOIN (SELECT 'Blanche' AS valeur, 1 AS ordre UNION ALL SELECT 'Noire', 2) AS choix
 WHERE option_produit.nom = 'Couleur de la perle'
   AND NOT EXISTS (
        SELECT 1 FROM valeur_option AS deja
         WHERE deja.option_id = option_produit.id AND deja.valeur = choix.valeur
       );

-- 3. Une variante « noire » par variante qui n'a pas encore de couleur.
INSERT INTO variante (produit_id, libelle, stock)
SELECT variante.produit_id,
       CASE WHEN variante.libelle = 'Modèle unique' THEN 'Perle noire' ELSE CONCAT(variante.libelle, ' · Perle noire') END,
       variante.stock
  FROM variante
 WHERE NOT EXISTS (
        SELECT 1
          FROM variante_valeur
          JOIN option_produit ON option_produit.id = variante_valeur.option_id
         WHERE variante_valeur.variante_id = variante.id
           AND option_produit.nom = 'Couleur de la perle'
       );

-- 4. Les variantes qu'on vient de créer prennent la valeur « Noire ».
INSERT INTO variante_valeur (variante_id, option_id, valeur_id)
SELECT variante.id, valeur_option.option_id, valeur_option.id
  FROM variante
  JOIN option_produit ON option_produit.produit_id = variante.produit_id AND option_produit.nom = 'Couleur de la perle'
  JOIN valeur_option ON valeur_option.option_id = option_produit.id AND valeur_option.valeur = 'Noire'
 WHERE (variante.libelle = 'Perle noire' OR variante.libelle LIKE '% · Perle noire')
   AND NOT EXISTS (
        SELECT 1 FROM variante_valeur AS deja
         WHERE deja.variante_id = variante.id AND deja.option_id = option_produit.id
       );

-- 5. Une variante « noire » reprend les autres choix (taille, perle, coloris…)
--    de la variante dont elle est la copie. Sa jumelle est la variante du même
--    bijou dont le libellé, suivi de « · Perle noire », donne le sien (ou, une
--    fois la jumelle renommée à l'étape 7, « … · Perle blanche »).
INSERT INTO variante_valeur (variante_id, option_id, valeur_id)
SELECT noire.id, reprise.option_id, reprise.valeur_id
  FROM variante AS noire
  JOIN variante AS jumelle ON jumelle.produit_id = noire.produit_id AND jumelle.id <> noire.id
  JOIN variante_valeur AS reprise ON reprise.variante_id = jumelle.id
  JOIN option_produit ON option_produit.id = reprise.option_id AND option_produit.nom <> 'Couleur de la perle'
 WHERE noire.libelle LIKE '% · Perle noire'
   AND (CONCAT(jumelle.libelle, ' · Perle noire') = noire.libelle
        OR CONCAT(REPLACE(jumelle.libelle, ' · Perle blanche', ''), ' · Perle noire') = noire.libelle)
   AND NOT EXISTS (
        SELECT 1 FROM variante_valeur AS deja
         WHERE deja.variante_id = noire.id AND deja.option_id = reprise.option_id
       );

-- 6. Toutes les autres variantes (les anciennes) prennent la valeur « Blanche ».
INSERT INTO variante_valeur (variante_id, option_id, valeur_id)
SELECT variante.id, valeur_option.option_id, valeur_option.id
  FROM variante
  JOIN option_produit ON option_produit.produit_id = variante.produit_id AND option_produit.nom = 'Couleur de la perle'
  JOIN valeur_option ON valeur_option.option_id = option_produit.id AND valeur_option.valeur = 'Blanche'
 WHERE NOT EXISTS (
        SELECT 1 FROM variante_valeur AS deja
         WHERE deja.variante_id = variante.id AND deja.option_id = option_produit.id
       );

-- 7. Le libellé des variantes « blanches » le dit.
UPDATE variante
  JOIN variante_valeur ON variante_valeur.variante_id = variante.id
  JOIN valeur_option ON valeur_option.id = variante_valeur.valeur_id AND valeur_option.valeur = 'Blanche'
  JOIN option_produit ON option_produit.id = valeur_option.option_id AND option_produit.nom = 'Couleur de la perle'
   SET variante.libelle = CASE
        WHEN variante.libelle = 'Modèle unique' THEN 'Perle blanche'
        ELSE CONCAT(variante.libelle, ' · Perle blanche')
       END
 WHERE variante.libelle <> 'Perle blanche' AND variante.libelle NOT LIKE '% · Perle blanche';
