import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { ExternalEegPrescriptionDto } from '../demandes/dto/external-prescription.dto';
import { NotificationExternalService } from './notification-external.service';
import { ChuClientService } from '../../common/clients/chu-client.service';

@Injectable()
export class ExternalPrescriptionService {
  private readonly logger = new Logger(ExternalPrescriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
    private readonly notificationExternal: NotificationExternalService,
    private readonly chuClient: ChuClientService,
  ) {}

  /**
   * Receive and process an external EEG prescription from the Prescription API
   * @param dto - External prescription data
   * @returns Acknowledgment with created demand ID
   */
  async receiveExternalPrescription(dto: ExternalEegPrescriptionDto) {
    try {
      // Step 1: Get or create external patient
      const patient = await this.patientLookup.getOrCreateExternalPatient(
        dto.patientId,
        dto.patient,
      );

      this.logger.log(
        `Patient resolved: ${patient.id} (external: ${patient.isExternal}) - ID: ${dto.patientId}`,
      );

      // Step 2: Get or create prescripteur (can be external too)
      const prescripteur = await this.prisma.utilisateur.upsert({
        where: { id: dto.prescripteurId },
        update: {},  // rien à mettre à jour
        create: {
          id: dto.prescripteurId,
          nom: 'Prescripteur',
          prenom: 'Externe',
          email: `prescripteur-${dto.prescripteurId}@chu.local`,
          password: 'EXTERNAL',
          role: 'TECHNICIEN',
          actif: true,
        },
      });

      // Step 3: Create the EEG demand directly using Prisma
      const demande = await this.prisma.eegDemande.create({
        data: {
          patientId: patient.id,
          prescripteurId: prescripteur.id,
          typeEEG: dto.typeEEG,
          urgence: dto.urgence || 'NORMALE',
          motifPrescription: dto.renseignements,
          episodeSoinsId: dto.episodeSoinsId || dto.chuId || `EXTERNAL-${Date.now()}`,
          numeroEEG: `EEG-${Date.now()}`,
        },
        include: { patient: true, prescripteur: true },
      });

      this.logger.log(
        `Created EEG demand: ${demande.id} for patient ${patient.externalPatientId || patient.id}`,
      );

      // Step 3.5 : Créer notification locale (pour l'affichage dans le frontend EEG)
      await this.prisma.eegNotification.create({
        data: {
          type: 'SYSTEME',
          titre: `Nouvelle prescription EEG — ${dto.typeEEG}`,
          message: `Patient ${dto.patientId} — ${dto.renseignements?.substring(0, 100) ?? ''}`,
          niveau: dto.urgence === 'STAT' ? 'STAT' : dto.urgence === 'URGENTE' ? 'URGENTE' : 'NORMALE',
          lu: false,
          patientId: patient.id,
          demandeId: demande.id,
          horodatage: new Date(),
        },
      });

      // Step 4: Send notification (fire-and-forget, non-blocking)
      const serviceInfo = await this.chuClient.getMyServiceInfo();
      const serviceNom = serviceInfo?.name || 'EEG';

      this.notificationExternal.sendNotification({
        type: 'NOUVELLE_DEMANDE',
        motif: `Nouvelle demande EEG (externe) pour patient ${dto.patientId}`,
        urgence: dto.urgence === 'STAT' ? 3 : dto.urgence === 'URGENTE' ? 2 : 1,
        sourceServiceId: process.env.EEG_SERVICE_ID,
        sourceServiceName: serviceNom,
        patientId: patient.id,
        sentAt: new Date().toISOString(),
      }).catch((err) => this.logger.warn(`Notification non envoyée: ${err.message}`));

      // Step 5: Return acknowledgment
      return {
        success: true,
        message: 'Prescription EEG reçue et traitée',
        data: {
          demandeId: demande.id,
          numeroEEG: demande.numeroEEG,
          patientId: patient.id,
          externalPatientId: patient.externalPatientId,
          statut: demande.statut,
          createdAt: demande.dateCreation,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error processing external prescription: ${error.message}`,
        error.stack,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to process prescription: ${error.message}`,
      );
    }
  }

  /**
   * Get ACK status for a prescription
   * @param demandeId - Demand ID
   * @returns Demand status
   */
  async getPrescriptionStatus(demandeId: string) {
    const demande = await this.prisma.eegDemande.findUnique({
      where: { id: demandeId },
      include: { patient: true, resultat: true },
    });

    if (!demande) {
      throw new BadRequestException(`Demand ${demandeId} not found`);
    }

    return {
      demandeId: demande.id,
      numeroEEG: demande.numeroEEG,
      statut: demande.statut,
      patientId: demande.patient.externalPatientId || demande.patient.id,
      dateCreation: demande.dateCreation,
      dateRealisation: demande.dateRealisation,
      dateValidation: demande.dateValidation,
      hasResult: !!demande.resultat,
      resultPreliminary: demande.resultat
        ? {
            conclusion: demande.resultat.conclusionDiagnostique,
            anomalies: demande.resultat.anomaliesDetectees,
          }
        : null,
    };
  }
}
