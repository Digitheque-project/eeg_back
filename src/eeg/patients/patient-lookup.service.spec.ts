import { Test, TestingModule } from '@nestjs/testing';
import { PatientLookupService } from './patient-lookup.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccueilClientService } from './accueil-client.service';
import { PriseEnChargeClientService } from '../../common/clients/prise-en-charge-client.service';

describe('PatientLookupService', () => {
  let service: PatientLookupService;
  let prismaService: PrismaService;
  let accueilClient: AccueilClientService;
  let priseEnChargeClient: PriseEnChargeClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientLookupService,
        {
          provide: PrismaService,
          useValue: {
            eegDossier: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
            },
            eegDemande: { count: jest.fn() },
            eegRdv: { count: jest.fn() },
          },
        },
        {
          provide: AccueilClientService,
          useValue: {
            getPatientByExternalId: jest.fn(),
          },
        },
        {
          provide: PriseEnChargeClientService,
          useValue: {
            getPriseEnCharge: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<PatientLookupService>(PatientLookupService);
    prismaService = module.get<PrismaService>(PrismaService);
    accueilClient = module.get<AccueilClientService>(AccueilClientService);
    priseEnChargeClient = module.get<PriseEnChargeClientService>(PriseEnChargeClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPatientInfo', () => {
    it('should fetch from Accueil and merge the local idDossier', async () => {
      jest.spyOn(prismaService.eegDossier, 'findUnique').mockResolvedValue({
        id: 'd1',
        patientId: 'CHU-2026-00001',
        idDossier: 'DOS-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const getPatientSpy = jest
        .spyOn(accueilClient, 'getPatientByExternalId')
        .mockResolvedValue({
          id: 'CHU-2026-00001',
          nom: 'Fresh',
          prenom: 'Data',
          age: 50,
          sexe: 'M',
          priseEnChargeId: null,
          adresse: 'Lot II M 12 Fianarantsoa',
          contact: '+261 34 12 345 67',
        });

      const result = await service.getPatientInfo('CHU-2026-00001');

      // adresse/contact viennent d'Accueil : ils alimentent l'en-tête du
      // compte rendu officiel (auparavant perdus à la normalisation).
      expect(result).toEqual({
        nom: 'Fresh',
        prenom: 'Data',
        age: 50,
        sexe: 'M',
        adresse: 'Lot II M 12 Fianarantsoa',
        contact: '+261 34 12 345 67',
        idDossier: 'DOS-001',
        priseEnCharge: null,
        source: 'ACCUEIL',
      });
      expect(getPatientSpy).toHaveBeenCalledWith('CHU-2026-00001');
    });

    it('should use fallback when Accueil is unavailable', async () => {
      jest
        .spyOn(prismaService.eegDossier, 'findUnique')
        .mockResolvedValue(null);
      jest
        .spyOn(accueilClient, 'getPatientByExternalId')
        .mockResolvedValue(null);

      const result = await service.getPatientInfo('CHU-2026-00001', {
        nom: 'Fallback',
        prenom: 'Name',
        age: 40,
        sexe: 'F',
      });

      expect(result).toEqual({
        nom: 'Fallback',
        prenom: 'Name',
        age: 40,
        sexe: 'F',
        adresse: null,
        contact: null,
        idDossier: null,
        priseEnCharge: null,
        source: 'FALLBACK',
      });
    });
  });

  describe('assignIdDossier', () => {
    it('should upsert the dossier mapping', async () => {
      const upsertSpy = jest
        .spyOn(prismaService.eegDossier, 'upsert')
        .mockResolvedValue({
          id: 'd1',
          patientId: 'CHU-2026-00001',
          idDossier: 'DOS-002',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      const result = await service.assignIdDossier('CHU-2026-00001', 'DOS-002');

      expect(result).toBe('DOS-002');
      expect(upsertSpy).toHaveBeenCalledWith({
        where: { patientId: 'CHU-2026-00001' },
        update: { idDossier: 'DOS-002' },
        create: { patientId: 'CHU-2026-00001', idDossier: 'DOS-002' },
      });
    });
  });

  describe('attachPatientInfoToMany', () => {
    it('should enrich a list of entities carrying a patientId', async () => {
      jest
        .spyOn(prismaService.eegDossier, 'findUnique')
        .mockResolvedValue(null);
      jest.spyOn(accueilClient, 'getPatientByExternalId').mockResolvedValue({
        id: 'p1',
        nom: 'A',
        prenom: 'B',
        age: 20,
        sexe: 'F',
        priseEnChargeId: null,
        adresse: 'Ambozontany',
        contact: '032 00 000 00',
      });

      const result = await service.attachPatientInfoToMany([
        { id: 'e1', patientId: 'p1' },
        { id: 'e2', patientId: 'p1' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].patient.nom).toBe('A');
      expect(result[1].patient.nom).toBe('A');
    });

    // Le générateur de compte rendu (eeg_front) lit `adresse` / `contact` à
    // la RACINE de l'entité, pas seulement sous `patient` — les deux
    // emplacements doivent être servis.
    it('should also expose adresse/contact at the root of each entity', async () => {
      jest
        .spyOn(prismaService.eegDossier, 'findUnique')
        .mockResolvedValue(null);
      jest.spyOn(accueilClient, 'getPatientByExternalId').mockResolvedValue({
        id: 'p1',
        nom: 'A',
        prenom: 'B',
        age: 20,
        sexe: 'F',
        priseEnChargeId: null,
        adresse: 'Ambozontany',
        contact: '032 00 000 00',
      });

      const [entite] = await service.attachPatientInfoToMany([
        { id: 'e1', patientId: 'p1' },
      ]);

      expect(entite.adresse).toBe('Ambozontany');
      expect(entite.contact).toBe('032 00 000 00');
      expect(entite.patient.adresse).toBe('Ambozontany');
      expect(entite.patient.contact).toBe('032 00 000 00');
    });

    // Une valeur déjà portée par l'entité (ex. adresse saisie sur la
    // demande) ne doit pas être écrasée par celle d'Accueil.
    it('should not overwrite an adresse already carried by the entity', async () => {
      jest
        .spyOn(prismaService.eegDossier, 'findUnique')
        .mockResolvedValue(null);
      jest.spyOn(accueilClient, 'getPatientByExternalId').mockResolvedValue({
        id: 'p1',
        nom: 'A',
        prenom: 'B',
        age: 20,
        sexe: 'F',
        priseEnChargeId: null,
        adresse: 'Accueil',
        contact: null,
      });

      const entite = await service.attachPatientInfo({
        id: 'e1',
        patientId: 'p1',
        adresse: 'Adresse locale',
      });

      expect(entite.adresse).toBe('Adresse locale');
      expect(entite.patient.adresse).toBe('Accueil');
    });
  });
});
