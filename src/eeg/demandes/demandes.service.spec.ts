import { Test, TestingModule } from '@nestjs/testing';
import { DemandesService } from './demandes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationExternalService } from '../external/notification-external.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { PrescriptionClientService } from '../external/prescription-client.service';
import { BadRequestException } from '@nestjs/common';

describe('DemandesService', () => {
  let service: DemandesService;
  let prisma: any;
  let prescriptionClient: any;

  const mockPrisma = {
    eegDemande: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    eegNotification: { create: jest.fn() },
    eegRdv: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    eegResultat: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    utilisateur: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((fns: any) => {
      if (typeof fns === 'function') return fns(mockPrisma);
      return Promise.all(fns);
    }),
  };

  const mockPrescriptionClient = {
    listEegDemandes: jest.fn().mockResolvedValue([]),
    findDemandeEegById: jest.fn(),
    updateDemandeStatut: jest.fn(),
  };

  const mockNotificationService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockPatientLookup = {
    attachPatientInfo: jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
    attachPatientInfoToMany: jest.fn().mockImplementation((ds: any) => Promise.resolve(ds)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemandesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationExternalService, useValue: mockNotificationService },
        { provide: PatientLookupService, useValue: mockPatientLookup },
        { provide: PrescriptionClientService, useValue: mockPrescriptionClient },
      ],
    }).compile();

    service = module.get<DemandesService>(DemandesService);
    prisma = mockPrisma;
    prescriptionClient = mockPrescriptionClient;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('prescriber resolution — unknown external prescriber (Option B)', () => {
    it('should set prescripteurId to null and populate snapshot fields when prescriber is unknown', async () => {
      prisma.utilisateur.findFirst.mockResolvedValue(null);
      prisma.eegDemande.findUnique.mockResolvedValue(null);
      prisma.eegDemande.findFirst.mockResolvedValue(null);

      const createdDemande = {
        id: 'local-001',
        numeroEEG: 'EEG-001',
        patientId: 'PAT-001',
        prescripteurId: null,
        prescripteurExterneNom: 'Rabe',
        prescripteurExternePrenom: 'Jean',
        prescripteurExterne: true,
        typeEEG: 'STANDARD',
        statut: 'CREEE',
      };
      prisma.eegDemande.create.mockResolvedValue(createdDemande);
      prisma.eegNotification.create.mockResolvedValue({});

      prescriptionClient.listEegDemandes.mockResolvedValue([
        {
          id: 'dem-ext-001',
          prescriptionParentId: 'rx-ext-001',
          patientId: 'PAT-001',
          prescripteurId: 'ext-doc-999',
          prescripteurNomManuel: 'Rabe',
          prescripteurPrenomManuel: 'Jean',
          prescripteurExterne: true,
          typeEEG: 'STANDARD',
          urgence: 'NORMALE',
          renseignements: 'Bilan épilepsie',
        },
      ]);

      const count = await service.syncPendingPrescriptions();

      expect(count).toBe(1);
      expect(prisma.eegDemande.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prescripteurId: null,
            prescripteurExterneNom: 'Rabe',
            prescripteurExternePrenom: 'Jean',
            prescripteurExterne: true,
            prescriptionParentId: 'rx-ext-001',
            prescriptionSourceId: 'dem-ext-001',
            typeEEG: 'STANDARD',
          }),
        }),
      );
    });

    it('should resolve to CHEF_SERVICE when prescripteurId is null in the API response', async () => {
      prisma.utilisateur.findFirst.mockResolvedValue({
        id: 'chef-local-001',
        nom: 'Chef',
        prenom: 'Service',
        role: 'CHEF_SERVICE',
      });
      prisma.eegDemande.findUnique.mockResolvedValue(null);
      prisma.eegDemande.findFirst.mockResolvedValue(null);
      prisma.eegDemande.create.mockResolvedValue({
        id: 'local-002',
        prescripteurId: 'chef-local-001',
        prescripteurExterneNom: null,
        prescripteurExternePrenom: null,
        prescripteurExterne: false,
      });
      prisma.eegNotification.create.mockResolvedValue({});

      prescriptionClient.listEegDemandes.mockResolvedValue([
        {
          id: 'dem-ext-002',
          prescriptionParentId: 'rx-ext-002',
          patientId: 'PAT-002',
          prescripteurId: null,
          prescripteurNomManuel: null,
          prescripteurPrenomManuel: null,
          prescripteurExterne: false,
          typeEEG: 'SOMMEIL',
          urgence: 'URGENTE',
        },
      ]);

      const count = await service.syncPendingPrescriptions();

      expect(count).toBe(1);
      expect(prisma.eegDemande.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prescripteurId: 'chef-local-001',
            prescripteurExterneNom: null,
            prescripteurExternePrenom: null,
            prescripteurExterne: false,
          }),
        }),
      );
    });

    it('should use local prescripteurId when the external prescriber exists locally', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({
        id: 'ext-doc-001',
        nom: 'Local',
        prenom: 'Doc',
      });
      prisma.eegDemande.findUnique.mockResolvedValue(null);
      prisma.eegDemande.findFirst.mockResolvedValue(null);
      prisma.eegDemande.create.mockResolvedValue({
        id: 'local-003',
        prescripteurId: 'ext-doc-001',
        prescripteurExterneNom: null,
        prescripteurExternePrenom: null,
        prescripteurExterne: false,
      });
      prisma.eegNotification.create.mockResolvedValue({});

      prescriptionClient.listEegDemandes.mockResolvedValue([
        {
          id: 'dem-ext-003',
          prescriptionParentId: 'rx-ext-003',
          patientId: 'PAT-003',
          prescripteurId: 'ext-doc-001',
          prescripteurNomManuel: 'ShouldNot',
          prescripteurPrenomManuel: 'BeUsed',
          prescripteurExterne: false,
          typeEEG: 'VIDEO_EEG',
          urgence: 'STAT',
        },
      ]);

      const count = await service.syncPendingPrescriptions();

      expect(count).toBe(1);
      expect(prisma.eegDemande.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prescripteurId: 'ext-doc-001',
            prescripteurExterneNom: null,
            prescripteurExternePrenom: null,
            prescripteurExterne: false,
          }),
        }),
      );
    });
  });
});
