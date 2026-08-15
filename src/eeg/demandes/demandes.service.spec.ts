import { Test, TestingModule } from '@nestjs/testing';
import { DemandesService } from './demandes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationExternalService } from '../external/notification-external.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { PrescriptionClientService } from '../external/prescription-client.service';
import { UserLookupService } from '../../common/clients/user-lookup.service';
import { externalServicesConfig } from '../../common/config/external-services.config';
import { AuditService } from '../audit/audit.service';

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
      findMany: jest.fn().mockResolvedValue([]),
    },
    eegRdv: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
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

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
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
        { provide: AuditService, useValue: mockAuditService },
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

    // L'heure d'arrivée est le moment de la synchronisation locale (la
    // prescription entre dans le module EEG), pas l'heure de création chez
    // prescription_back — son fuseau est peu fiable. dateCreation est donc
    // défini à new Date() au moment de la sync (voir promoteToLocal).
    it('should persist dateCreation as the local sync time, not the source prescription createdAt', async () => {
      prisma.eegDemande.create.mockResolvedValue({ id: 'local-004' });
      prisma.eegNotification.create.mockResolvedValue({});

      const avant = Date.now();
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

      const createCall = prisma.eegDemande.create.mock.calls[0][0].data;
      expect(createCall.dateCreation).toBeInstanceOf(Date);
      expect(createCall.dateCreation.getTime()).toBeGreaterThanOrEqual(avant);
      expect(createCall.dateCreation.toISOString()).not.toBe('2026-07-26T16:11:55.258Z');
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

      await service.realiserDemande('dem-500', 'tech-001', 'TECHNICIEN');

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

    // EegRdv restait bloqué à EN_ATTENTE indéfiniment tant que la demande
    // liée était réalisée : seul PATCH .../rdvs/:id/realiser le faisait
    // passer à REALISE, mais aucune action du front ne l'appelait jamais.
    it('should also flip the linked EegRdv to REALISE, in the same transaction', async () => {
      prisma.eegDemande.findFirst.mockResolvedValue({
        id: 'dem-501',
        statut: 'PLANIFIEE',
        urgence: 'NORMALE',
        rdv: { id: 'rdv-501', statut: 'EN_ATTENTE' },
        prescriptionParentId: 'rx-501',
        prescriptionSourceId: 'dem-501',
      });
      prisma.eegDemande.update.mockResolvedValue({
        id: 'dem-501',
        numeroEEG: 'EEG-501',
        patientId: 'PAT-501',
        urgence: 'NORMALE',
      });
      prisma.eegRdv.update.mockResolvedValue({ id: 'rdv-501', statut: 'REALISE' });
      prisma.eegNotification.create.mockResolvedValue({});

      await service.realiserDemande('dem-501', 'tech-001', 'TECHNICIEN');

      expect(prisma.eegRdv.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rdv-501' },
          data: expect.objectContaining({
            statut: 'REALISE',
            technicienRealisateurId: 'tech-001',
          }),
        }),
      );
    });

    it('should not touch EegRdv when the demande has none', async () => {
      prisma.eegDemande.findFirst.mockResolvedValue({
        id: 'dem-502',
        statut: 'PLANIFIEE',
        urgence: 'NORMALE',
        rdv: null,
        prescriptionParentId: 'rx-502',
        prescriptionSourceId: 'dem-502',
      });
      prisma.eegDemande.update.mockResolvedValue({
        id: 'dem-502',
        numeroEEG: 'EEG-502',
        patientId: 'PAT-502',
        urgence: 'NORMALE',
      });
      prisma.eegNotification.create.mockResolvedValue({});

      await service.realiserDemande('dem-502', 'tech-001', 'TECHNICIEN');

      expect(prisma.eegRdv.update).not.toHaveBeenCalled();
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
        'CHEF_SERVICE',
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

    // Rubriques du compte rendu officiel CHUA ajoutées côté back : sans
    // elles, le générateur PDF du front n'avait rien à afficher (« Néant »).
    it('should persist etatEveil, conditions and both notes complémentaires', async () => {
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
        {
          conclusion: 'Tracé normal',
          etatEveil: 'veille',
          conditions: 'Patient calme, quelques artéfacts musculaires',
          noteComplementaireConclusion: 'À recontrôler dans 6 mois',
          noteComplementaireConduite: 'Poursuivre le traitement',
        } as any,
        'chef-001',
        'CHEF_SERVICE',
      );

      expect(prisma.eegResultat.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            etatEveil: 'veille',
            conditions: 'Patient calme, quelques artéfacts musculaires',
            noteComplementaireConclusion: 'À recontrôler dans 6 mois',
            noteComplementaireConduite: 'Poursuivre le traitement',
          }),
        }),
      );
    });

    it('should store null for the compte rendu fields when not provided', async () => {
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
        { conclusion: 'Tracé normal' } as any,
        'chef-001',
        'CHEF_SERVICE',
      );

      expect(prisma.eegResultat.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            etatEveil: null,
            conditions: null,
            noteComplementaireConclusion: null,
            noteComplementaireConduite: null,
          }),
        }),
      );
    });
  });

  // Le compte rendu officiel a besoin, à la RACINE de la demande, de la
  // date/heure d'examen et du renseignement clinique — sans quoi le front
  // affiche « Néant » alors que l'information existe côté RDV.
  describe('getDemandeById — champs du compte rendu', () => {
    it('should expose renseignementClinique, dateExamen and heuresExamen at the root', async () => {
      const dateRealisation = new Date('2026-08-10T08:30:00.000Z');
      prisma.eegDemande.findFirst.mockResolvedValue({
        id: 'dem-cr-001',
        numeroEEG: 'EEG-CR-001',
        patientId: 'PAT-CR-001',
        prescripteurId: 'doc-1',
        statut: 'RESULTAT_DISPONIBLE',
        dateCreation: new Date('2026-08-09T07:00:00.000Z'),
        dateRealisation,
        dateRDV: new Date('2026-08-10T00:00:00.000Z'),
        motifPrescription: 'Bilan épilepsie',
        resultat: { id: 'res-1', etatEveil: 'veille' },
        rdv: {
          heureDebut: '08:30',
          renseignementClinique: 'Crises nocturnes répétées',
        },
      });

      const result: any = await service.getDemandeById('dem-cr-001');

      expect(result.renseignementClinique).toBe('Crises nocturnes répétées');
      expect(result.dateExamen).toEqual(dateRealisation);
      expect(result.heuresExamen).toBe('08:30');
      // Champs existants inchangés
      expect(result.numeroEEG).toBe('EEG-CR-001');
      expect(result.dateRealisation).toEqual(dateRealisation);
    });

    it('should fall back to motifPrescription and dateRDV when no RDV data', async () => {
      const dateRDV = new Date('2026-08-12T00:00:00.000Z');
      prisma.eegDemande.findFirst.mockResolvedValue({
        id: 'dem-cr-002',
        numeroEEG: 'EEG-CR-002',
        patientId: 'PAT-CR-002',
        statut: 'PLANIFIEE',
        dateCreation: new Date('2026-08-11T07:00:00.000Z'),
        dateRealisation: null,
        dateRDV,
        motifPrescription: 'Suspicion épilepsie',
        resultat: null,
        rdv: null,
      });

      const result: any = await service.getDemandeById('dem-cr-002');

      expect(result.renseignementClinique).toBe('Suspicion épilepsie');
      expect(result.dateExamen).toEqual(dateRDV);
      expect(result.heuresExamen).toBeNull();
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

    // La colonne "Heure" affiche l'heure d'arrivée (synchronisation locale),
    // pas un horodatage de notification ni une date liée à un statut.
    it('should set heureArrivee to dateCreation (the local sync time)', async () => {
      const dateCreation = new Date('2026-08-01T08:00:00.000Z');

      prisma.eegDemande.findMany.mockResolvedValue([
        {
          id: 'dem-200',
          numeroEEG: 'EEG-200',
          patientId: 'PAT-200',
          prescripteurId: 'doc-1',
          statut: 'CREEE',
          urgence: 'NORMALE',
          dateCreation,
          dateRealisation: null,
          dateValidation: null,
          resultat: null,
          rdv: null,
        },
      ]);
      prisma.eegNotification.findMany.mockResolvedValue([
        { demandeId: 'dem-200', type: 'NOUVELLE_DEMANDE', horodatage: new Date('2026-08-01T10:30:00.000Z') },
      ]);
      prescriptionClient.listEegDemandes.mockResolvedValue([]);

      const result = await service.getWorklist('TECHNICIEN');

      expect(result.toutes![0].heureArrivee).toEqual(dateCreation);
      expect(result.toutes![0].heureArrivee).not.toEqual(new Date('2026-08-01T10:30:00.000Z'));
    });

    // Quel que soit le statut, la colonne "Heure" reste l'heure d'arrivée :
    // ni la date de réalisation, ni la date de validation.
    it('should keep heureArrivee as dateCreation regardless of statut', async () => {
      const dateCreation = new Date('2026-08-01T08:00:00.000Z');
      const dateRealisation = new Date('2026-08-01T11:00:00.000Z');

      prisma.eegDemande.findMany.mockResolvedValue([
        {
          id: 'dem-201',
          numeroEEG: 'EEG-201',
          patientId: 'PAT-201',
          prescripteurId: 'doc-1',
          statut: 'EN_COURS',
          urgence: 'NORMALE',
          dateCreation,
          dateRealisation,
          dateValidation: null,
          resultat: null,
          rdv: null,
        },
      ]);
      prisma.eegNotification.findMany.mockResolvedValue([]);
      prescriptionClient.listEegDemandes.mockResolvedValue([]);

      const result = await service.getWorklist('CHEF_SERVICE');

      expect(result.toutes![0].heureArrivee).toEqual(dateCreation);
      expect(result.toutes![0].heureArrivee).not.toEqual(dateRealisation);
    });
  });
});
