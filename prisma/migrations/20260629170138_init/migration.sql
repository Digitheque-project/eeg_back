-- CreateEnum
CREATE TYPE "StatutDemande" AS ENUM ('CREEE', 'VALIDEE', 'PLANIFIEE', 'EN_COURS', 'EN_INTERPRETATION', 'ACK_RECU', 'ANNULEE');

-- CreateEnum
CREATE TYPE "TypeEEG" AS ENUM ('STANDARD', 'SOMMEIL', 'AMBULATOIRE', 'VIDEO_EEG');

-- CreateEnum
CREATE TYPE "NiveauUrgence" AS ENUM ('STAT', 'URGENTE', 'NORMALE');

-- CreateEnum
CREATE TYPE "StatutRdv" AS ENUM ('EN_ATTENTE', 'REALISE', 'NON_REALISE', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeNotification" AS ENUM ('ALERTE_CRITIQUE', 'ALERTE_URGENTE', 'RAPPORT', 'SYSTEME');

-- CreateEnum
CREATE TYPE "TypeActivite" AS ENUM ('VALIDATION', 'NOUVEL_EXAMEN', 'SYSTEME', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "ActionAudit" AS ENUM ('CREATION', 'CONSULTATION', 'MODIFICATION', 'VALIDATION', 'ANNULATION', 'IMPRESSION', 'ACK');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('TECHNICIEN', 'CHEF_SERVICE', 'MAJOR_SERVICE');

-- CreateEnum
CREATE TYPE "OrdreProfessionnel" AS ENUM ('ONM', 'ONIM', 'ONSFM', 'ONPM', 'AUTRE', 'AUCUN');

-- CreateEnum
CREATE TYPE "SourceSystem" AS ENUM ('LOCAL', 'PRESCRIPTION', 'ACCUEIL', 'AUTRE');

-- CreateTable
CREATE TABLE "patient" (
    "id" TEXT NOT NULL,
    "externalPatientId" TEXT,
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'LOCAL',
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "nom" TEXT,
    "prenom" TEXT,
    "age" INTEGER,
    "sexe" TEXT,
    "idDossier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "telephone" TEXT,
    "matricule" TEXT,
    "role" "RoleUtilisateur" NOT NULL,
    "ordresProfessionnel" "OrdreProfessionnel" NOT NULL DEFAULT 'AUCUN',
    "numeroOrdre" TEXT,
    "signatureNumerique" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_demande" (
    "id" TEXT NOT NULL,
    "numeroEEG" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescripteurId" TEXT NOT NULL,
    "technicienId" TEXT,
    "typeEEG" "TypeEEG" NOT NULL,
    "urgence" "NiveauUrgence" NOT NULL,
    "motifPrescription" TEXT NOT NULL,
    "statut" "StatutDemande" NOT NULL DEFAULT 'CREEE',
    "episodeSoinsId" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRDV" TIMESTAMP(3),
    "dateRealisation" TIMESTAMP(3),
    "dateValidation" TIMESTAMP(3),
    "dateAck" TIMESTAMP(3),
    "motifAnnulation" TEXT,

    CONSTRAINT "eeg_demande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eeg_rdv" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescripteurId" TEXT NOT NULL,
    "demandeId" TEXT,
    "typeEEG" TEXT NOT NULL,
    "salle" TEXT NOT NULL,
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
    "rythmesDeFond" TEXT,
    "anomaliesDetectees" TEXT,
    "conclusionDiagnostique" TEXT,
    "compteRendu" TEXT,
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
    "ancienCompteRendu" TEXT,
    "nouveauCompteRendu" TEXT,
    "ancienRythmesDeFond" TEXT,
    "nouveauRythmesDeFond" TEXT,
    "ancienAnomalies" TEXT,
    "nouveauAnomalies" TEXT,
    "ancienneConclusion" TEXT,
    "nouvelleConclusion" TEXT,
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

-- CreateIndex
CREATE UNIQUE INDEX "patient_externalPatientId_key" ON "patient"("externalPatientId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_idDossier_key" ON "patient"("idDossier");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_demande_numeroEEG_key" ON "eeg_demande"("numeroEEG");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_rdv_demandeId_key" ON "eeg_rdv"("demandeId");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_resultat_demandeId_key" ON "eeg_resultat"("demandeId");

-- AddForeignKey
ALTER TABLE "eeg_demande" ADD CONSTRAINT "eeg_demande_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_demande" ADD CONSTRAINT "eeg_demande_prescripteurId_fkey" FOREIGN KEY ("prescripteurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_rdv" ADD CONSTRAINT "eeg_rdv_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_rdv" ADD CONSTRAINT "eeg_rdv_prescripteurId_fkey" FOREIGN KEY ("prescripteurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_rdv" ADD CONSTRAINT "eeg_rdv_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "eeg_demande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_resultat" ADD CONSTRAINT "eeg_resultat_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "eeg_demande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_resultat" ADD CONSTRAINT "eeg_resultat_medecinValidateurId_fkey" FOREIGN KEY ("medecinValidateurId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_rectification" ADD CONSTRAINT "eeg_rectification_resultatId_fkey" FOREIGN KEY ("resultatId") REFERENCES "eeg_resultat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_rectification" ADD CONSTRAINT "eeg_rectification_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_notification" ADD CONSTRAINT "eeg_notification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_notification" ADD CONSTRAINT "eeg_notification_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_notification" ADD CONSTRAINT "eeg_notification_rdvId_fkey" FOREIGN KEY ("rdvId") REFERENCES "eeg_rdv"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_notification" ADD CONSTRAINT "eeg_notification_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "eeg_demande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_notification_action" ADD CONSTRAINT "eeg_notification_action_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "eeg_notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_activite" ADD CONSTRAINT "eeg_activite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_activite" ADD CONSTRAINT "eeg_activite_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_audit" ADD CONSTRAINT "eeg_audit_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eeg_audit" ADD CONSTRAINT "eeg_audit_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "eeg_demande"("id") ON DELETE SET NULL ON UPDATE CASCADE;
