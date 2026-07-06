import { Test, TestingModule } from '@nestjs/testing';
import { PatientLookupService } from './patient-lookup.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccueilClientService } from './accueil-client.service';

describe('PatientLookupService', () => {
  let service: PatientLookupService;
  let prismaService: PrismaService;
  let accueilClient: AccueilClientService;

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
      ],
    }).compile();

    service = module.get<PatientLookupService>(PatientLookupService);
    prismaService = module.get<PrismaService>(PrismaService);
    accueilClient = module.get<AccueilClientService>(AccueilClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPatientInfo', () => {
    it('should fetch from Accueil and merge the local idDossier', async () => {
      jest.spyOn(prismaService.eegDossier, 'findUnique').mockResolvedValue({
        id: 'd1', patientId: 'CHU-2026-00001', idDossier: 'DOS-001', createdAt: new Date(), updatedAt: new Date(),
      } as any);
      jest.spyOn(accueilClient, 'getPatientByExternalId').mockResolvedValue({
        id: 'CHU-2026-00001', nom: 'Fresh', prenom: 'Data', age: 50, sexe: 'M',
      });

      const result = await service.getPatientInfo('CHU-2026-00001');

      expect(result).toEqual({
        nom: 'Fresh',
        prenom: 'Data',
        age: 50,
        sexe: 'M',
        idDossier: 'DOS-001',
        source: 'ACCUEIL',
      });
      expect(accueilClient.getPatientByExternalId).toHaveBeenCalledWith('CHU-2026-00001');
    });

    it('should use fallback when Accueil is unavailable', async () => {
      jest.spyOn(prismaService.eegDossier, 'findUnique').mockResolvedValue(null);
      jest.spyOn(accueilClient, 'getPatientByExternalId').mockResolvedValue(null);

      const result = await service.getPatientInfo('CHU-2026-00001', {
        nom: 'Fallback', prenom: 'Name', age: 40, sexe: 'F',
      });

      expect(result).toEqual({
        nom: 'Fallback',
        prenom: 'Name',
        age: 40,
        sexe: 'F',
        idDossier: null,
        source: 'FALLBACK',
      });
    });
  });

  describe('assignIdDossier', () => {
    it('should upsert the dossier mapping', async () => {
      jest.spyOn(prismaService.eegDossier, 'upsert').mockResolvedValue({
        id: 'd1', patientId: 'CHU-2026-00001', idDossier: 'DOS-002', createdAt: new Date(), updatedAt: new Date(),
      } as any);

      const result = await service.assignIdDossier('CHU-2026-00001', 'DOS-002');

      expect(result).toBe('DOS-002');
      expect(prismaService.eegDossier.upsert).toHaveBeenCalledWith({
        where: { patientId: 'CHU-2026-00001' },
        update: { idDossier: 'DOS-002' },
        create: { patientId: 'CHU-2026-00001', idDossier: 'DOS-002' },
      });
    });
  });

  describe('attachPatientInfoToMany', () => {
    it('should enrich a list of entities carrying a patientId', async () => {
      jest.spyOn(prismaService.eegDossier, 'findUnique').mockResolvedValue(null);
      jest.spyOn(accueilClient, 'getPatientByExternalId').mockResolvedValue({
        id: 'p1', nom: 'A', prenom: 'B', age: 20, sexe: 'F',
      });

      const result = await service.attachPatientInfoToMany([
        { id: 'e1', patientId: 'p1' },
        { id: 'e2', patientId: 'p1' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].patient.nom).toBe('A');
      expect(result[1].patient.nom).toBe('A');
    });
  });
});
