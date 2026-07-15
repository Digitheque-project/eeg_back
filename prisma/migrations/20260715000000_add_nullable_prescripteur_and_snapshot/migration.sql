-- Migration: add_nullable_prescripteur_and_snapshot
-- Description:
--   1. Make EegDemande.prescripteurId nullable (external prescribers
--      may not exist in the local Utilisateur table)
--   2. Make EegRdv.prescripteurId nullable (same reason)
--   3. Add prescriptionParentId to EegDemande (links to parent
--      prescription in prescription_back)
--   4. Add prescripteurExterneNom / prescripteurExternePrenom to
--      EegDemande (snapshot for display when prescripteurId is null)
--   5. Add prescripteurExterne boolean flag
--
-- Aucune donnée existante n'est modifiée — les colonnes ajoutées
-- sont toutes nullable ou avec DEFAULT.

-- 1. EegDemande.prescripteurId → nullable
ALTER TABLE "eeg_demande"
  ALTER COLUMN "prescripteurId" DROP NOT NULL;

-- 2. EegRdv.prescripteurId → nullable
ALTER TABLE "eeg_rdv"
  ALTER COLUMN "prescripteurId" DROP NOT NULL;

-- 3. Ajout prescriptionParentId
ALTER TABLE "eeg_demande"
  ADD COLUMN "prescriptionParentId" TEXT;

-- 4. Ajout snapshot prescripteur externe
ALTER TABLE "eeg_demande"
  ADD COLUMN "prescripteurExterneNom" TEXT;

ALTER TABLE "eeg_demande"
  ADD COLUMN "prescripteurExternePrenom" TEXT;

-- 5. Ajout indicateur prescripteur externe
ALTER TABLE "eeg_demande"
  ADD COLUMN "prescripteurExterne" BOOLEAN NOT NULL DEFAULT false;
