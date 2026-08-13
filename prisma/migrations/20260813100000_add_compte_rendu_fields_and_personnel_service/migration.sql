-- Migration: add_compte_rendu_fields_and_personnel_service
-- Description:
--   1. Colonnes manquantes du compte rendu EEG officiel CHUA sur
--      eeg_resultat. Le front (eeg_front) génère déjà le PDF A4 et
--      affichait « Néant » pour ces rubriques faute de colonne côté back :
--        - etatEveil                    : "veille" | "sommeil"
--        - conditions                   : comportement, artéfacts, étape
--                                         non réalisable...
--        - noteComplementaireConclusion : texte libre sous CONCLUSION
--        - noteComplementaireConduite   : texte libre sous CONDUITE A TENIR
--      Toutes nullable — aucune donnée existante modifiée.
--
--   2. Table personnel_service_neurologie : singleton métier portant le
--      personnel du service affiché sur le compte rendu (chef de service,
--      médecins, major, techniciens, téléphone RDV). Exposée via
--      GET/PUT /eeg/config/personnel-service. Ce n'est pas un annuaire
--      d'utilisateurs (celui-ci reste user-services), juste les libellés
--      imprimés sur le document.

ALTER TABLE "eeg_resultat"
  ADD COLUMN "etatEveil" TEXT;

ALTER TABLE "eeg_resultat"
  ADD COLUMN "conditions" TEXT;

ALTER TABLE "eeg_resultat"
  ADD COLUMN "noteComplementaireConclusion" TEXT;

ALTER TABLE "eeg_resultat"
  ADD COLUMN "noteComplementaireConduite" TEXT;

CREATE TABLE "personnel_service_neurologie" (
    "id" TEXT NOT NULL,
    "chefDeService" TEXT NOT NULL,
    "medecins" TEXT[],
    "majorDeService" TEXT NOT NULL,
    "techniciens" TEXT[],
    "telephoneRdv" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_service_neurologie_pkey" PRIMARY KEY ("id")
);
