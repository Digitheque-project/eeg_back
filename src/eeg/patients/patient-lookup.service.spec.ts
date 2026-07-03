import { Test, TestingModule } from '@nestjs/testing';
import { PatientLookupService } from './patient-lookup.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccueilClientService } from './accueil-client.service';
import { Patient, SourceSystem } from '@prisma/client';

describe('PatientLookupService', () => {
  let service: PatientLookupService;
  let prismaService: PrismaService;
  let accueilClient: AccueilClientService;

  const mockPatient: Patient = {
    id: 'local-uuid-123',
    externalPatientId: 'CHU-2026-00001',
    sourceSystem: SourceSystem.PRESCRIPTION,
    isExternal: true,
    nom: null,
    prenom: null,
    age: null,
    sexe: null,
    idDossier: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientLookupService,
        {
          provide: PrismaService,
          useValue: {
            patient: {
              findFirst: jest.fn(),
              create: jest.fn(),
            },
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

  describe('getOrCreateExternalPatient', () => {
    it('should create minimal external patient record without persisting details', async () => {
      jest.spyOn(prismaService.patient, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.patient, 'create').mockResolvedValue(mockPatient);

      const result = await service.getOrCreateExternalPatient('CHU-2026-00001', {
        nom: 'Doe',
        prenom: 'John',
        age: 45,
        sexe: 'M',
      });

      expect(prismaService.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          externalPatientId: 'CHU-2026-00001',
          isExternal: true,
          nom: null,
          prenom: null,
          age: null,
          sexe: null,
        }),
      );
      expect(result).toEqual(mockPatient);
    });

    it('should return existing patient if found', async () => {
      jest.spyOn(prismaService.patient, 'findFirst').mockResolvedValue(mockPatient);

      const result = await service.getOrCreateExternalPatient('CHU-2026-00001');

      expect(prismaService.patient.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockPatient);
    });
  });

  describe('getPatientInfoWithExternalLookup', () => {
    it('should return local data for non-external patients', async () => {
      const localPatient: Patient = {
        ...mockPatient,
        isExternal: false,
        nom: 'Local',
        prenom: 'Patient',
        age: 30,
        sexe: 'F',
      };

      const result = await service.getPatientInfoWithExternalLookup(localPatient);

      expect(result).toEqual({
        nom: 'Local',
        prenom: 'Patient',
        age: 30,
        sexe: 'F',
        source: 'LOCAL',
      });
      expect(accueilClient.getPatientByExternalId).not.toHaveBeenCalled();
    });

    it('should fetch from Accueil for external patients', async () => {
      const accueilData = {
        nom: 'Fresh',
        prenom: 'Data',
        age: 50,
        sexe: 'M',
      };

      jest.spyOn(accueilClient, 'getPatientByExternalId').mockResolvedValue(accueilData as any);

      const result = await service.getPatientInfoWithExternalLookup(mockPatient);

      expect(result).toEqual({
        nom: 'Fresh',
        prenom: 'Data',
        age: 50,
        sexe: 'M',
        source: 'ACCUEIL',
      });
      expect(accueilClient.getPatientByExternalId).toHaveBeenCalledWith('CHU-2026-00001');
    });

    it('should use fallback when Accueil is unavailable', async () => {
      jest.spyOn(accueilClient, 'getPatientByExternalId').mockResolvedValue(null);

      const result = await service.getPatientInfoWithExternalLookup(
        mockPatient,
        { nom: 'Fallback', prenom: 'Name', age: 40, sexe: 'F' },
      );

      expect(result).toEqual({
        nom: 'Fallback',
        prenom: 'Name',
        age: 40,
        sexe: 'F',
        source: 'FALLBACK',
      });
    });
  });
});
