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

    // Sans ce champ explicite, Prisma retombe sur son défaut (now()) — la
    // date enregistrée serait le moment de la synchronisation, pas le vrai
    // moment de création chez prescription_back. C'est ce qui rendait les
    // heures d'arrivée affichées fausses (voir prescription-client tests
    // pour le champ `createdAt` amont).
    it('should persist dateCreation from the source prescription createdAt, not the sync time', async () => {
      prisma.eegDemande.create.mockResolvedValue({ id: 'local-004' });
      prisma.eegNotification.create.mockResolvedValue({});

      prescriptionClient.listEegDemandes.mockResolvedValue([
        {
          id: 'dem-ext-004',
          prescriptionParentId: 'rx-ext-004',
          patientId: 'PAT-004',
          prescripteurId: 'ext-doc-004',
          typeEEG: 'EEG',
          urgence: 'NORMALE',
          createdAt: '2026-07-26T16:11:55.258Z',
        },
      ]);

      await service.syncPendingPrescriptions();

      expect(prisma.eegDemande.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dateCreation: new Date('2026-07-26T16:11:55.258Z'),
          }),
        }),
      );
    });

    // Sans roleCible, un TECHNICIEN et un CHEF_SERVICE voyaient exactement
    // les mêmes notifications — aucune "logique métier" par rôle.
    it('should target NOUVELLE_DEMANDE notifications at TECHNICIEN', async () => {
      prisma.eegDemande.create.mockResolvedValue({
        id: 'local-005',
        numeroEEG: 'EEG-005',
        patientId: 'PAT-005',
        urgence: 'NORMALE',
        typeEEG: 'EEG',
      });
      prisma.eegNotification.create.mockResolvedValue({});

      prescriptionClient.listEegDemandes.mockResolvedValue([
        {
          id: 'dem-ext-005',
          prescriptionParentId: 'rx-ext-005',
          patientId: 'PAT-005',
          prescripteurId: 'ext-doc-005',
        },
      ]);

      await service.syncPendingPrescriptions();

      expect(prisma.eegNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'NOUVELLE_DEMANDE',
            roleCible: 'TECHNICIEN',
          }),
        }),
      );
    });
  });

  // Transfert TECHNICIEN -> CHEF_SERVICE : jusqu'ici aucune notification
  // n'existait pour ça (seule l'alerte "non interprété depuis 24h", bien
  // trop tardive). Voir demandes.service.ts:realiserDemande.
  describe('realiserDemande', () => {
    it('should create an A_INTERPRETER notification targeted at CHEF_SERVICE', async () => {
      prisma.eegDemande.findFirst.mockResolvedValue({
        id: 'dem-500',
        statut: 'PLANIFIEE',
        urgence: 'URGENTE',
        rdv: null,
        prescriptionParentId: 'rx-500',
        prescriptionSourceId: 'dem-500',
      });
      prisma.eegDemande.update.mockResolvedValue({
        id: 'dem-500',
        numeroEEG: 'EEG-500',
        patientId: 'PAT-500',
        urgence: 'URGENTE',
      });
      prisma.eegNotification.create.mockResolvedValue({});

      await service.realiserDemande('dem-500', 'tech-001');

      expect(prisma.eegNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'A_INTERPRETER',
            roleCible: 'CHEF_SERVICE',
            demandeId: 'dem-500',
          }),
        }),
      );
    });
  });

  // Le CHEF_SERVICE ne doit plus ressaisir les champs CLINIQUE : ils sont
  // recopiés depuis le snapshot pris à la prescription (EegDemande), pas
  // depuis le formulaire d'archivage — avec le mapping de noms
  // agePremiereCrise→age1ereCrise et typeCrise→typeCrises.
  describe('archiverResultat', () => {
    const demandeEnCours = {
      id: 'dem-clin-001',
      statut: 'EN_COURS',
      prescriptionParentId: 'rx-clin-001',
      prescriptionSourceId: 'dem-clin-001',
      patientId: 'PAT-CLIN-001',
      aeActuel: 'Valproate 500mg x2/j',
      agePremiereCrise: '3 ans',
      dpm: 'Normal',
      typeCrise: 'Généralisée tonico-clonique',
      dateDerniereCrise: '2026-07-10',
    };

    it('should source CLINIQUE fields from the demande snapshot, not from the form', async () => {
      prisma.eegDemande.findFirst.mockResolvedValue(demandeEnCours);
      prisma.eegResultat.findUnique.mockResolvedValue(null);
      prisma.eegResultat.create.mockResolvedValue({});
      prisma.eegDemande.update.mockResolvedValue({
        id: 'dem-clin-001',
        patientId: 'PAT-CLIN-001',
        numeroEEG: 'EEG-CLIN-001',
      });

      await service.archiverResultat(
        'dem-clin-001',
        { autresRc: 'Antécédent familial', conclusion: 'Tracé normal' } as any,
        'chef-001',
      );

      expect(prisma.eegResultat.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aeActuel: 'Valproate 500mg x2/j',
            age1ereCrise: '3 ans',
            dpm: 'Normal',
            typeCrises: 'Généralisée tonico-clonique',
            dateDerniereCrise: '2026-07-10',
            autresRc: 'Antécédent familial',
            conclusion: 'Tracé normal',
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
