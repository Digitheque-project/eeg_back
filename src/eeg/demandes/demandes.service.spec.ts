import { Test, TestingModule } from '@nestjs/testing';
import { DemandesService } from './demandes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationExternalService } from '../external/notification-external.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { PrescriptionClientService } from '../external/prescription-client.service';
import { UserLookupService } from '../../common/clients/user-lookup.service';
import { externalServicesConfig } from '../../common/config/external-services.config';

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
    eegNotification: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    eegRdv: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    eegResultat: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
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

  const mockUserLookup = {
    getUserInfo: jest.fn().mockResolvedValue(null),
    attachPrescripteurInfo: jest.fn().mockImplementation((d: any) => Promise.resolve({ ...d, prescripteur: null })),
    attachPrescripteurInfoToMany: jest.fn().mockImplementation((ds: any[]) =>
      Promise.resolve(ds.map((d) => ({ ...d, prescripteur: null }))),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemandesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationExternalService, useValue: mockNotificationService },
        { provide: PatientLookupService, useValue: mockPatientLookup },
        { provide: PrescriptionClientService, useValue: mockPrescriptionClient },
        { provide: UserLookupService, useValue: mockUserLookup },
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

  // Il n'y a plus de table Utilisateur locale : un prescripteurId externe
  // est utilisé tel quel (pas de cache/upsert local), et le seul repli
  // configurable est DEFAULT_CHEF_SERVICE_USER_ID. Voir
  // DemandesService.resolvePrescripteurId.
  describe('prescriber resolution', () => {
    it('should set prescripteurId to null and populate snapshot fields for an external prescriber', async () => {
      prisma.eegDemande.create.mockResolvedValue({
        id: 'local-001',
        numeroEEG: 'EEG-001',
        patientId: 'PAT-001',
        prescripteurId: null,
        prescripteurExterneNom: 'Rabe',
        prescripteurExternePrenom: 'Jean',
        prescripteurExterne: true,
        typeEEG: 'STANDARD',
        statut: 'CREEE',
      });
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
            // CHUA ne classe pas les examens par sous-type : la valeur
            // externe ('STANDARD' ici) est ignorée, toujours 'EEG' en local.
            typeEEG: 'EEG',
          }),
        }),
      );
    });

    it('should fall back to DEFAULT_CHEF_SERVICE_USER_ID when prescripteurId is null in the API response', async () => {
      externalServicesConfig.defaultChefServiceUserId = 'chef-default-001';
      try {
        prisma.eegDemande.create.mockResolvedValue({
          id: 'local-002',
          prescripteurId: 'chef-default-001',
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
              prescripteurId: 'chef-default-001',
              prescripteurExterneNom: null,
              prescripteurExternePrenom: null,
              prescripteurExterne: false,
            }),
          }),
        );
      } finally {
        externalServicesConfig.defaultChefServiceUserId = '';
      }
    });

    it('should trust an externally-provided prescripteurId as-is (no local lookup or cache)', async () => {
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

  // getWorklist doit désormais promouvoir + notifier immédiatement toute
  // nouvelle prescription (avec le token de l'utilisateur connecté),
  // au lieu de se contenter de l'afficher de façon éphémère sans jamais
  // créer de notification — c'était le bug remonté par l'utilisateur
  // ("la prescription apparaît dans la worklist mais pas de notification").
  describe('getWorklist', () => {
    const localApresPromotion = {
      id: 'local-100',
      numeroEEG: 'EEG-100',
      patientId: 'PAT-100',
      prescripteurId: 'doc-1',
      statut: 'CREEE',
      urgence: 'NORMALE',
      dateCreation: new Date(),
      resultat: null,
      rdv: null,
    };

    it('should promote and notify a new prescription seen for the first time', async () => {
      prisma.eegDemande.findMany
        .mockResolvedValueOnce([]) // aucune demande locale connue
        .mockResolvedValueOnce([localApresPromotion]); // après promotion

      prisma.eegDemande.create.mockResolvedValue(localApresPromotion);
      prisma.eegNotification.findFirst.mockResolvedValue(null);
      prisma.eegNotification.create.mockResolvedValue({});

      prescriptionClient.listEegDemandes.mockResolvedValue([
        {
          id: 'dem-100',
          prescriptionParentId: 'rx-100',
          patientId: 'PAT-100',
          prescripteurId: 'doc-1',
          typeEEG: 'EEG',
          urgence: 'NORMALE',
        },
      ]);

      const result = await service.getWorklist('TECHNICIEN');

      expect(prisma.eegDemande.create).toHaveBeenCalled();
      expect(prisma.eegNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'NOUVELLE_DEMANDE',
            demandeId: 'local-100',
          }),
        }),
      );
      expect(result.toutes).toHaveLength(1);
    });

    it('should not create a duplicate notification if one already exists for this demande', async () => {
      prisma.eegDemande.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([localApresPromotion]);

      prisma.eegDemande.create.mockResolvedValue(localApresPromotion);
      prisma.eegNotification.findFirst.mockResolvedValue({ id: 'notif-existante' });

      prescriptionClient.listEegDemandes.mockResolvedValue([
        {
          id: 'dem-100',
          prescriptionParentId: 'rx-100',
          patientId: 'PAT-100',
          prescripteurId: 'doc-1',
          typeEEG: 'EEG',
          urgence: 'NORMALE',
        },
      ]);

      await service.getWorklist('TECHNICIEN');

      expect(prisma.eegNotification.create).not.toHaveBeenCalled();
    });

    it('should pass the connected user token through to listEegDemandes', async () => {
      prisma.eegDemande.findMany.mockResolvedValue([]);
      prescriptionClient.listEegDemandes.mockResolvedValue([]);

      await service.getWorklist('TECHNICIEN', 'fresh-user-token');

      expect(prescriptionClient.listEegDemandes).toHaveBeenCalledWith(
        undefined,
        undefined,
        'fresh-user-token',
      );
    });
  });
});
