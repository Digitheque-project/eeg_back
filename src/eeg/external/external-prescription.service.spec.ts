import { Test, TestingModule } from '@nestjs/testing';
import { ExternalPrescriptionService } from './external-prescription.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { NotificationExternalService } from './notification-external.service';
import { ChuClientService } from '../../common/clients/chu-client.service';
import { ExternalEegPrescriptionDto } from '../demandes/dto/external-prescription.dto';

describe('ExternalPrescriptionService', () => {
  let service: ExternalPrescriptionService;
  let prismaService: PrismaService;
  let notificationService: NotificationExternalService;
  let chuClient: ChuClientService;

  const mockPrescripteur = {
    id: 'prescripteur-uuid',
    nom: 'Prescripteur',
    prenom: 'Externe',
  };

  const mockDemande = {
    id: 'demande-uuid',
    numeroEEG: 'EEG-1234567890',
    patientId: 'CHU-2026-00001',
    prescripteurId: 'prescripteur-uuid',
    statut: 'CREEE',
    dateCreation: new Date(),
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
              upsert: jest.fn(),
            },
            eegDemande: {
              create: jest.fn(),
              findUnique: jest.fn(),
            },
            eegNotification: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: PatientLookupService,
          useValue: {},
        },
        {
          provide: NotificationExternalService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
        {
          provide: ChuClientService,
          useValue: {
            getMyServiceInfo: jest.fn().mockResolvedValue({ name: 'EEG' }),
          },
        },
      ],
    }).compile();

    service = module.get<ExternalPrescriptionService>(ExternalPrescriptionService);
    prismaService = module.get<PrismaService>(PrismaService);
    notificationService = module.get<NotificationExternalService>(NotificationExternalService);
    chuClient = module.get<ChuClientService>(ChuClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('receiveExternalPrescription', () => {
    it('should create EEG demand directly with the external patientId and send notification', async () => {
      jest.spyOn(prismaService.utilisateur, 'upsert').mockResolvedValue(mockPrescripteur as any);
      jest.spyOn(prismaService.eegDemande, 'create').mockResolvedValue(mockDemande as any);
      jest.spyOn(prismaService.eegNotification, 'create').mockResolvedValue({} as any);
      jest.spyOn(notificationService, 'sendNotification').mockResolvedValue({ id: 'notif-123' });

      const result = await service.receiveExternalPrescription(mockDto);

      expect(prismaService.eegDemande.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ patientId: mockDto.patientId }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data.demandeId).toBe(mockDemande.id);
      expect(result.data.patientId).toBe(mockDto.patientId);
      expect(chuClient.getMyServiceInfo).toHaveBeenCalled();
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOUVELLE_DEMANDE',
          sourceServiceName: 'EEG',
          patientId: mockDto.patientId,
        }),
      );
    });

    it('should upsert the prescripteur', async () => {
      jest.spyOn(prismaService.utilisateur, 'upsert').mockResolvedValue(mockPrescripteur as any);
      jest.spyOn(prismaService.eegDemande, 'create').mockResolvedValue(mockDemande as any);
      jest.spyOn(prismaService.eegNotification, 'create').mockResolvedValue({} as any);
      jest.spyOn(notificationService, 'sendNotification').mockResolvedValue({ id: 'notif-123' });

      await service.receiveExternalPrescription(mockDto);

      expect(prismaService.utilisateur.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDto.prescripteurId },
          create: expect.objectContaining({
            id: mockDto.prescripteurId,
            role: 'TECHNICIEN',
          }),
        }),
      );
    });

    it('should not block on notification failure', async () => {
      jest.spyOn(prismaService.utilisateur, 'upsert').mockResolvedValue(mockPrescripteur as any);
      jest.spyOn(prismaService.eegDemande, 'create').mockResolvedValue(mockDemande as any);
      jest.spyOn(prismaService.eegNotification, 'create').mockResolvedValue({} as any);
      jest.spyOn(notificationService, 'sendNotification').mockRejectedValue(new Error('Network error'));

      const result = await service.receiveExternalPrescription(mockDto);

      expect(result.success).toBe(true);
      expect(notificationService.sendNotification).toHaveBeenCalled();
    });

    it('should fall back to "EEG" as service name when ChuClientService is unavailable', async () => {
      jest.spyOn(prismaService.utilisateur, 'upsert').mockResolvedValue(mockPrescripteur as any);
      jest.spyOn(prismaService.eegDemande, 'create').mockResolvedValue(mockDemande as any);
      jest.spyOn(prismaService.eegNotification, 'create').mockResolvedValue({} as any);
      jest.spyOn(chuClient, 'getMyServiceInfo').mockResolvedValue(null);
      jest.spyOn(notificationService, 'sendNotification').mockResolvedValue({ id: 'notif-123' });

      await service.receiveExternalPrescription(mockDto);

      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ sourceServiceName: 'EEG' }),
      );
    });
  });

  describe('getPrescriptionStatus', () => {
    it('should return the demand status keyed by the external patientId', async () => {
      jest.spyOn(prismaService.eegDemande, 'findUnique').mockResolvedValue({
        ...mockDemande,
        resultat: null,
      } as any);

      const result = await service.getPrescriptionStatus('demande-uuid');

      expect(result.patientId).toBe(mockDemande.patientId);
      expect(result.hasResult).toBe(false);
    });
  });
});
