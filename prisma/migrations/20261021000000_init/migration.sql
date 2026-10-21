-- Migration de base unique (21/10/2026), générée depuis schema.prisma :
-- l'ancien historique (10 migrations) ne pouvait plus être rejoué sur une
-- base neuve (init modifiait un type créé par la migration suivante).
-- CreateEnum
CREATE TYPE "StatutDemande" AS ENUM ('CREEE', 'PLANIFIEE', 'EN_COURS', 'RESULTAT_DISPONIBLE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "TypeEEG" AS ENUM ('STANDARD', 'SOMMEIL', 'AMBULATOIRE', 'VIDEO_EEG', 'EEG');

-- CreateEnum
CREATE TYPE "NiveauUrgence" AS ENUM ('STAT', 'URGENTE', 'NORMALE');

-- CreateEnum
CREATE TYPE "StatutRdv" AS ENUM ('EN_ATTENTE', 'REALISE', 'NON_REALISE', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeNotification" AS ENUM ('ALERTE_CRITIQUE', 'ALERTE_URGENTE', 'NOUVELLE_DEMANDE', 'A_INTERPRETER', 'RAPPORT', 'SYSTEME');

-- CreateEnum
CREATE TYPE "TypeActivite" AS ENUM ('VALIDATION', 'NOUVEL_EXAMEN', 'SYSTEME', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "ActionAudit" AS ENUM ('CREATION', 'CONSULTATION', 'MODIFICATION', 'VALIDATION', 'ANNULATION', 'IMPRESSION', 'ACK');

-- CreateTable
CREATE TABLE "eeg_dossier" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "idDossier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eeg_dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_demande" (
    "id" TEXT NOT NULL,
    "numeroEEG" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescripteurId" TEXT,
    "technicienId" TEXT,
    "typeEEG" "TypeEEG" NOT NULL,
    "urgence" "NiveauUrgence" NOT NULL,
    "motifPrescription" TEXT NOT NULL,
    "statut" "StatutDemande" NOT NULL DEFAULT 'CREEE',
    "episodeSoinsId" TEXT NOT NULL,
    "prescriptionSourceId" TEXT,
    "prescriptionParentId" TEXT,
    "prescripteurExterneNom" TEXT,
    "prescripteurExternePrenom" TEXT,
    "prescripteurExterne" BOOLEAN NOT NULL DEFAULT false,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRDV" TIMESTAMP(3),
    "dateRealisation" TIMESTAMP(3),
    "dateValidation" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "aeActuel" TEXT,
    "agePremiereCrise" TEXT,
    "dpm" TEXT,
    "typeCrise" TEXT,
    "dateDerniereCrise" TEXT,
    "alertes" TEXT,
    "remarques" TEXT,

    CONSTRAINT "eeg_demande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_rdv" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescripteurId" TEXT,
    "demandeId" TEXT,
    "typeEEG" TEXT NOT NULL,
    "salle" TEXT NOT NULL DEFAULT 'Salle EEG 1',
    "priorite" "NiveauUrgence" NOT NULL,
    "statut" "StatutRdv" NOT NULL DEFAULT 'EN_ATTENTE',
    "dateRdv" TIMESTAMP(3) NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "dureeMinutes" INTEGER NOT NULL,
    "renseignementClinique" TEXT,
    "dateRealisation" TIMESTAMP(3),
    "technicienRealisateurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eeg_rdv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_resultat" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "fichierImagePath" TEXT,
    "nomFichierImage" TEXT,
    "dureeEnregistrement" INTEGER,
    "aeActuel" TEXT,
    "age1ereCrise" TEXT,
    "dpm" TEXT,
    "typeCrises" TEXT,
    "autresRc" TEXT,
    "dateDerniereCrise" TEXT,
    "activiteDeFond" TEXT,
    "anomaliesAuRepos" TEXT,
    "testActivationHpn" TEXT,
    "testActivationSli" TEXT,
    "conclusion" TEXT,
    "conduiteATenir" TEXT,
    "etatEveil" TEXT,
    "conditions" TEXT,
    "noteComplementaireConclusion" TEXT,
    "noteComplementaireConduite" TEXT,
    "medecinValidateurId" TEXT,
    "dateValidation" TIMESTAMP(3),
    "estImmutable" BOOLEAN NOT NULL DEFAULT false,
    "estCritique" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eeg_resultat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_rectification" (
    "id" TEXT NOT NULL,
    "resultatId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "ancienneVersion" JSONB NOT NULL,
    "nouvelleVersion" JSONB NOT NULL,
    "dateRectification" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eeg_rectification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_notification" (
    "id" TEXT NOT NULL,
    "niveau" "NiveauUrgence" NOT NULL,
    "type" "TypeNotification" NOT NULL,
    "titre" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "patientId" TEXT,
    "patientTexte" TEXT,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "assigneeUserId" TEXT,
    "rdvId" TEXT,
    "demandeId" TEXT,
    "dateLecture" TIMESTAMP(3),
    "roleCible" TEXT,

    CONSTRAINT "eeg_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_notification_action" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "eeg_notification_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_activite" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "TypeActivite" NOT NULL,
    "description" TEXT NOT NULL,
    "userId" TEXT,
    "patientId" TEXT,

    CONSTRAINT "eeg_activite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_audit" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" "ActionAudit" NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "detail" JSONB,
    "dateAction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "demandeId" TEXT,

    CONSTRAINT "eeg_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "eeg_dossier_patientId_key" ON "eeg_dossier"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_dossier_idDossier_key" ON "eeg_dossier"("idDossier");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_demande_numeroEEG_key" ON "eeg_demande"("numeroEEG");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_demande_prescriptionSourceId_key" ON "eeg_demande"("prescriptionSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_rdv_demandeId_key" ON "eeg_rdv"("demandeId");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_resultat_demandeId_key" ON "eeg_resultat"("demandeId");

-- AddForeignKey
ALTER TABLE "eeg_rdv" ADD CONSTRAINT "eeg_rdv_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "eeg_demande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_resultat" ADD CONSTRAINT "eeg_resultat_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "eeg_demande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_rectification" ADD CONSTRAINT "eeg_rectification_resultatId_fkey" FOREIGN KEY ("resultatId") REFERENCES "eeg_resultat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_notification" ADD CONSTRAINT "eeg_notification_rdvId_fkey" FOREIGN KEY ("rdvId") REFERENCES "eeg_rdv"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_notification" ADD CONSTRAINT "eeg_notification_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "eeg_demande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_notification_action" ADD CONSTRAINT "eeg_notification_action_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "eeg_notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_audit" ADD CONSTRAINT "eeg_audit_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "eeg_demande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

