-- Migration: add_clinique_snapshot_to_eeg_demande
-- Description:
--   Snapshot des champs cliniques fournis à la prescription (chez
--   prescription_back : CreateEEGDto.aeActuel/agePremiereCrise/dpm/
--   typeCrise/dateDerniereCrise). Jusqu'ici ces valeurs n'étaient jamais
--   récupérées côté eeg_back : le CHEF_SERVICE devait les ressaisir de
--   zéro à l'interprétation. Elles sont désormais promues avec le reste
--   de la demande et affichées en lecture seule (voir TabC_CompteRendu).
--
-- Toutes les colonnes sont nullable — aucune donnée existante modifiée.

ALTER TABLE "eeg_demande"
  ADD COLUMN "aeActuel" TEXT;

ALTER TABLE "eeg_demande"
  ADD COLUMN "agePremiereCrise" TEXT;

ALTER TABLE "eeg_demande"
  ADD COLUMN "dpm" TEXT;

ALTER TABLE "eeg_demande"
  ADD COLUMN "typeCrise" TEXT;

ALTER TABLE "eeg_demande"
  ADD COLUMN "dateDerniereCrise" TEXT;
