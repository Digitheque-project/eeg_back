-- AlterEnum
BEGIN;
CREATE TYPE "StatutDemande_new" AS ENUM ('CREEE', 'PLANIFIEE', 'EN_COURS', 'RESULTAT_DISPONIBLE', 'ANNULEE');
ALTER TABLE "eeg_demande" ALTER COLUMN "statut" DROP DEFAULT;
ALTER TABLE "eeg_demande" ALTER COLUMN "statut" TYPE "StatutDemande_new" USING ("statut"::text::"StatutDemande_new");
ALTER TYPE "StatutDemande" RENAME TO "StatutDemande_old";
ALTER TYPE "StatutDemande_new" RENAME TO "StatutDemande";
DROP TYPE "StatutDemande_old";
ALTER TABLE "eeg_demande" ALTER COLUMN "statut" SET DEFAULT 'CREEE';
COMMIT;

-- AlterEnum
ALTER TYPE "TypeNotification" ADD VALUE 'NOUVELLE_DEMANDE';

-- DropForeignKey
ALTER TABLE "eeg_activite" DROP CONSTRAINT "eeg_activite_patientId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_activite" DROP CONSTRAINT "eeg_activite_userId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_audit" DROP CONSTRAINT "eeg_audit_utilisateurId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_demande" DROP CONSTRAINT "eeg_demande_patientId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_demande" DROP CONSTRAINT "eeg_demande_prescripteurId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_notification" DROP CONSTRAINT "eeg_notification_assigneeUserId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_notification" DROP CONSTRAINT "eeg_notification_patientId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_rdv" DROP CONSTRAINT "eeg_rdv_patientId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_rdv" DROP CONSTRAINT "eeg_rdv_prescripteurId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_rectification" DROP CONSTRAINT "eeg_rectification_auteurId_fkey";

-- DropForeignKey
ALTER TABLE "eeg_resultat" DROP CONSTRAINT "eeg_resultat_medecinValidateurId_fkey";

-- AlterTable
ALTER TABLE "eeg_demande" DROP COLUMN "dateAck",
ADD COLUMN     "prescriptionSourceId" TEXT;

-- AlterTable
ALTER TABLE "eeg_rdv" ALTER COLUMN "salle" SET DEFAULT 'Salle EEG 1';

-- AlterTable
ALTER TABLE "eeg_rectification" DROP COLUMN "ancienAnomalies",
DROP COLUMN "ancienCompteRendu",
DROP COLUMN "ancienRythmesDeFond",
DROP COLUMN "ancienneConclusion",
DROP COLUMN "nouveauAnomalies",
DROP COLUMN "nouveauCompteRendu",
DROP COLUMN "nouveauRythmesDeFond",
DROP COLUMN "nouvelleConclusion",
ADD COLUMN     "ancienneVersion" JSONB NOT NULL,
ADD COLUMN     "nouvelleVersion" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "eeg_resultat" DROP COLUMN "anomaliesDetectees",
DROP COLUMN "compteRendu",
DROP COLUMN "conclusionDiagnostique",
DROP COLUMN "rythmesDeFond",
ADD COLUMN     "activiteDeFond" TEXT,
ADD COLUMN     "aeActuel" TEXT,
ADD COLUMN     "age1ereCrise" TEXT,
ADD COLUMN     "anomaliesAuRepos" TEXT,
ADD COLUMN     "autresRc" TEXT,
ADD COLUMN     "conclusion" TEXT,
ADD COLUMN     "conduiteATenir" TEXT,
ADD COLUMN     "dateDerniereCrise" TEXT,
ADD COLUMN     "dpm" TEXT,
ADD COLUMN     "testActivationHpn" TEXT,
ADD COLUMN     "testActivationSli" TEXT,
ADD COLUMN     "typeCrises" TEXT;

-- DropTable
DROP TABLE "patient";

-- DropTable
DROP TABLE "utilisateur";

-- DropEnum
DROP TYPE "OrdreProfessionnel";

-- DropEnum
DROP TYPE "RoleUtilisateur";

-- DropEnum
DROP TYPE "SourceSystem";

-- CreateTable
CREATE TABLE "eeg_dossier" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "idDossier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eeg_dossier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eeg_dossier_patientId_key" ON "eeg_dossier"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_dossier_idDossier_key" ON "eeg_dossier"("idDossier");

-- CreateIndex
CREATE UNIQUE INDEX "eeg_demande_prescriptionSourceId_key" ON "eeg_demande"("prescriptionSourceId");

