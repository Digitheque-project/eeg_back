import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { PrescriptionClientService } from './prescription-client.service';

describe('PrescriptionClientService', () => {
  let service: PrescriptionClientService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionClientService,
        {
          provide: HttpService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PrescriptionClientService>(PrescriptionClientService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listEegDemandes — flattenPrescriptions', () => {
    it('should flatten a prescription with 2 demandes of different typeEEGs', async () => {
      const rawResponse = {
        data: [
          {
            id: 'rx-001',
            patientId: 'PAT-001',
            prescripteurId: 'ext-doc-001',
            prescripteurNomManuel: 'Rabe',
            prescripteurPrenomManuel: 'Jean',
            prescripteurExterne: true,
            urgence: 'URGENTE',
            renseignements: 'Épilepsie réfractaire',
            alertes: 'Allergie aspirine',
            chuId: 'CHU-001',
            serviceIdSource: 'srv-001',
            serviceIdDest: 'srv-002',
            createdAt: '2026-07-15T08:00:00Z',
            demandes: [
              { id: 'dem-001', prescriptionId: 'rx-001', typeEEG: 'STANDARD', statut: 'EN_ATTENTE' },
              { id: 'dem-002', prescriptionId: 'rx-001', typeEEG: 'SOMMEIL', statut: 'EN_ATTENTE', motifRefus: null },
            ],
          },
        ],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.listEegDemandes();

      expect(result).toHaveLength(2);

      expect(result[0]).toMatchObject({
        id: 'dem-001',
        prescriptionParentId: 'rx-001',
        patientId: 'PAT-001',
        prescripteurId: 'ext-doc-001',
        prescripteurNomManuel: 'Rabe',
        prescripteurPrenomManuel: 'Jean',
        prescripteurExterne: true,
        typeEEG: 'STANDARD',
        urgence: 'URGENTE',
        renseignements: 'Épilepsie réfractaire',
      });

      expect(result[1]).toMatchObject({
        id: 'dem-002',
        prescriptionParentId: 'rx-001',
        typeEEG: 'SOMMEIL',
      });
    });

    it('should return empty array when API returns empty', async () => {
      jest.spyOn(httpService, 'get').mockReturnValue(of({ data: [] } as any));

      const result = await service.listEegDemandes();

      expect(result).toEqual([]);
    });

    it('should return empty array on API error', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => new Error('timeout')));

      const result = await service.listEegDemandes();

      expect(result).toEqual([]);
    });

    it('should handle a prescription with no demandes gracefully', async () => {
      const rawResponse = {
        data: [
          {
            id: 'rx-002',
            patientId: 'PAT-002',
            prescripteurId: 'ext-doc-002',
            demandes: [],
          },
        ],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.listEegDemandes();

      expect(result).toEqual([]);
    });

    it('should use d.prescriptionId over rx.id when present', async () => {
      const rawResponse = {
        data: [
          {
            id: 'rx-parent-001',
            patientId: 'PAT-003',
            prescripteurId: 'doc-003',
            demandes: [
              { id: 'dem-010', prescriptionId: 'rx-override-001', typeEEG: 'AMBULATOIRE' },
              { id: 'dem-011', typeEEG: 'STANDARD' },
            ],
          },
        ],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.listEegDemandes();

      expect(result[0].prescriptionParentId).toBe('rx-override-001');
      expect(result[1].prescriptionParentId).toBe('rx-parent-001');
    });
  });

  describe('findDemandeEegById', () => {
    it('should return the matching flat demand by id', async () => {
      const rawResponse = {
        data: [
          {
            id: 'rx-001',
            patientId: 'PAT-001',
            prescripteurId: 'ext-001',
            demandes: [
              { id: 'dem-001', typeEEG: 'STANDARD' },
              { id: 'dem-002', typeEEG: 'VIDEO_EEG' },
            ],
          },
        ],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.findDemandeEegById('dem-002');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('dem-002');
      expect(result!.typeEEG).toBe('VIDEO_EEG');
    });

    it('should return null for unknown id', async () => {
      const rawResponse = {
        data: [
          {
            id: 'rx-001',
            patientId: 'PAT-001',
            prescripteurId: 'ext-001',
            demandes: [{ id: 'dem-001', typeEEG: 'STANDARD' }],
          },
        ],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.findDemandeEegById('dem-999');

      expect(result).toBeNull();
    });
  });
});
