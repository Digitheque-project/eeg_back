import { PrismaService } from '../../prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';
import { Patient, SourceSystem } from '@prisma/client';
import { AccueilClientService, AccueilPatientDto } from './accueil-client.service';

@Injectable()
export class PatientLookupService {
  private readonly logger = new Logger(PatientLookupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accueilClient: AccueilClientService,
  ) {}

  /**
   * Find a patient by local UUID or external patient ID
   * @param patientId - Can be a local UUID or external ID (e.g., CHU-2026-00001)
   * @returns Patient or null if not found
   */
  async findPatientByIdOrExternal(patientId: string): Promise<Patient | null> {
    return this.prisma.patient.findFirst({
      where: {
        OR: [{ id: patientId }, { externalPatientId: patientId }],
      },
    });
  }

  /**
   * Get or create a patient for external prescriptions
   * For external patients, only creates a minimal local record for FK relations.
   * Patient details (nom, prenom, age, sexe) are NOT persisted locally for external patients.
   * These columns remain as cache best-effort only - the source of truth is Accueil service.
   * @param patientId - External patient ID
   * @param patientInfo - Optional patient information (used only as fallback if Accueil unavailable)
   * @returns Created or found Patient (minimal record for external patients)
   */
  async getOrCreateExternalPatient(
    patientId: string,
    patientInfo?: {
      nom?: string;
      prenom?: string;
      age?: number;
      sexe?: string;
    },
  ): Promise<Patient> {
    let patient = await this.findPatientByIdOrExternal(patientId);

    if (!patient) {
      patient = await this.prisma.patient.create({
        data: {
          externalPatientId: patientId,
          sourceSystem: 'PRESCRIPTION' as SourceSystem,
          isExternal: true,
          // For external patients, do NOT persist nom/prenom/age/sexe
          // These columns are cache best-effort only, source of truth is Accueil
          nom: null,
          prenom: null,
          age: null,
          sexe: null,
        },
      });
      this.logger.log(`Created minimal external patient record: ${patient.id} (external ID: ${patientId})`);
    }

    return patient;
  }

  /**
   * Get patient information with external lookup from Accueil
   * For external patients, fetches fresh data from Accueil service.
   * Falls back to local cache or provided patientInfo if Accueil is unavailable.
   * @param patient - Patient record from local database
   * @param fallbackPatientInfo - Optional fallback patient info from prescription DTO
   * @returns Patient information with fresh data from Accueil if available
   */
  async getPatientInfoWithExternalLookup(
    patient: Patient,
    fallbackPatientInfo?: {
      nom?: string;
      prenom?: string;
      age?: number;
      sexe?: string;
    },
  ): Promise<{
    nom: string | null;
    prenom: string | null;
    age: number | null;
    sexe: string | null;
    source: 'LOCAL' | 'ACCUEIL' | 'FALLBACK';
  }> {
    // For local patients, return local data
    if (!patient.isExternal) {
      return {
        nom: patient.nom,
        prenom: patient.prenom,
        age: patient.age,
        sexe: patient.sexe,
        source: 'LOCAL',
      };
    }

    // For external patients, try to fetch from Accueil
    if (patient.externalPatientId) {
      const accueilPatient = await this.accueilClient.getPatientByExternalId(
        patient.externalPatientId,
      );

      if (accueilPatient) {
        this.logger.log(`Fetched fresh patient data from Accueil for ${patient.externalPatientId}`);
        return {
          nom: accueilPatient.nom || null,
          prenom: accueilPatient.prenom || null,
          age: accueilPatient.age || null,
          sexe: accueilPatient.sexe || null,
          source: 'ACCUEIL',
        };
      }
    }

    // Fallback to provided patientInfo from DTO or local cache
    this.logger.warn(`Accueil unavailable for patient ${patient.externalPatientId}, using fallback`);
    return {
      nom: fallbackPatientInfo?.nom ?? patient.nom,
      prenom: fallbackPatientInfo?.prenom ?? patient.prenom,
      age: fallbackPatientInfo?.age ?? patient.age,
      sexe: fallbackPatientInfo?.sexe ?? patient.sexe,
      source: 'FALLBACK',
    };
  }

  /**
   * Create or update an external patient with upsert
   * @param externalPatientId - External patient ID
   * @param patientInfo - Patient information to create/update
   * @returns Patient record
   */
  async upsertExternalPatient(
    externalPatientId: string,
    patientInfo?: {
      nom?: string;
      prenom?: string;
      age?: number;
      sexe?: string;
    },
  ): Promise<Patient> {
    return this.prisma.patient.upsert({
      where: { externalPatientId },
      update: {
        nom: patientInfo?.nom,
        prenom: patientInfo?.prenom,
        age: patientInfo?.age,
        sexe: patientInfo?.sexe,
      },
      create: {
        externalPatientId,
        sourceSystem: 'PRESCRIPTION' as SourceSystem,
        isExternal: true,
        nom: patientInfo?.nom,
        prenom: patientInfo?.prenom,
        age: patientInfo?.age,
        sexe: patientInfo?.sexe,
      },
    });
  }
}
