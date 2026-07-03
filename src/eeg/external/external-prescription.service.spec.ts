import { Test, TestingModule } from '@nestjs/testing';
import { ExternalPrescriptionService } from './external-prescription.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { NotificationExternalService } from './notification-external.service';
import { ExternalEegPrescriptionDto } from '../demandes/dto/external-prescription.dto';

describe('ExternalPrescriptionService', () => {
  let service: ExternalPrescriptionService;
  let prismaService: PrismaService;
  let patientLookup: PatientLookupService;
  let notificationService: NotificationExternalService;

  const mockPatient = {
    id: 'local-uuid-123',
    externalPatientId: 'CHU-2026-00001',
    isExternal: true,
    nom: null,
    prenom: null,
    age: null,
    sexe: null,
  };

  const mockPrescripteur = {
    id: 'prescripteur-uuid',
    nom: 'Prescripteur',
    prenom: 'Externe',
  };

  const mockDemande = {
    id: 'demande-uuid',
    numeroEEG: 'EEG-1234567890',
    patientId: 'local-uuid-123',
    prescripteurId: 'prescripteur-uuid',
    statut: 'CREEE',
    dateCreation: new Date(),
    patient: mockPatient,
    prescripteur: mockPrescripteur,
  };

  const mockDto: ExternalEegPrescriptionDto = {
    patientId: 'CHU-2026-00001',
    prescripteurId: 'prescripteur-uuid',
    typeEEG: 'STANDARD',
    urgence: 'NORMALE',
    renseignements: 'Test prescription',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalPrescriptionService,
        {
          provide: PrismaService,
          useValue: {
            utilisateur: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            eegDemande: {
              create: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: PatientLookupService,
          useValue: {
            getOrCreateExternalPatient: jest.fn(),
          },
        },
        {
          provide: NotificationExternalService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExternalPrescriptionService>(ExternalPrescriptionService);
    prismaService = module.get<PrismaService>(PrismaService);
    patientLookup = module.get<PatientLookupService>(PatientLookupService);
    notificationService = module.get<NotificationExternalService>(NotificationExternalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('receiveExternalPrescription', () => {
    it('should create EEG demand and send notification', async () => {
      jest.spyOn(patientLookup, 'getOrCreateExternalPatient').mockResolvedValue(mockPatient as any);
      jest.spyOn(prismaService.utilisateur, 'findUnique').mockResolvedValue(mockPrescripteur as any);
      jest.spyOn(prismaService.eegDemande, 'create').mockResolvedValue(mockDemande as any);
      jest.spyOn(notificationService, 'sendNotification').mockResolvedValue({ id: 'notif-123' });

      const result = await service.receiveExternalPrescription(mockDto);

      expect(result.success).toBe(true);
      expect(result.data.demandeId).toBe(mockDemande.id);
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOUVELLE_DEMANDE',
          sourceServiceName: 'EEG',
        }),
      );
    });

    it('should create external prescripteur if not found', async () => {
      jest.spyOn(patientLookup, 'getOrCreateExternalPatient').mockResolvedValue(mockPatient as any);
      jest.spyOn(prismaService.utilisateur, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prismaService.utilisateur, 'create').mockResolvedValue(mockPrescripteur as any);
      jest.spyOn(prismaService.eegDemande, 'create').mockResolvedValue(mockDemande as any);
      jest.spyOn(notificationService, 'sendNotification').mockResolvedValue({ id: 'notif-123' });

      await service.receiveExternalPrescription(mockDto);

      expect(prismaService.utilisateur.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockDto.prescripteurId,
          role: 'TECHNICIEN',
        }),
      );
    });

    it('should not block on notification failure', async () => {
      jest.spyOn(patientLookup, 'getOrCreateExternalPatient').mockResolvedValue(mockPatient as any);
      jest.spyOn(prismaService.utilisateur, 'findUnique').mockResolvedValue(mockPrescripteur as any);
      jest.spyOn(prismaService.eegDemande, 'create').mockResolvedValue(mockDemande as any);
      jest.spyOn(notificationService, 'sendNotification').mockRejectedValue(new Error('Network error'));

      const result = await service.receiveExternalPrescription(mockDto);

      expect(result.success).toBe(true);
      expect(notificationService.sendNotification).toHaveBeenCalled();
    });
  });
});
