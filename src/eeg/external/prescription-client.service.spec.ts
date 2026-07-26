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
          useValue: { get: jest.fn(), patch: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PrescriptionClientService>(PrescriptionClientService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listEegDemandes — flattenPrescriptions (modèle plat, sans demandes[])', () => {
    it('should map each raw prescription to one flat demande', async () => {
      const rawResponse = {
        data: [
          {
            id: 'rx-001',
            patientId: 'PAT-001',
            prescripteurId: '',
            nomMedecinPrescripteur: 'Rabe',
            urgence: 'URGENTE',
            renseignements: 'Épilepsie réfractaire',
            alertes: 'Allergie aspirine',
            numeroONM: 'ONM-12345',
            chuId: 'CHU-001',
            serviceIdSource: 'srv-001',
            serviceIdDest: 'srv-002',
            createdAt: '2026-07-15T08:00:00Z',
          },
        ],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.listEegDemandes();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'rx-001',
        prescriptionParentId: 'rx-001',
        patientId: 'PAT-001',
        prescripteurId: '',
        prescripteurNomManuel: 'Rabe',
        prescripteurPrenomManuel: undefined,
        prescripteurExterne: true,
        numeroONM: 'ONM-12345',
        typeEEG: 'EEG',
        urgence: 'URGENTE',
        renseignements: 'Épilepsie réfractaire',
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

    it('should map several prescriptions to several flat demandes, one each', async () => {
      const rawResponse = {
        data: [
          { id: 'rx-002', patientId: 'PAT-002', prescripteurId: 'ext-doc-002' },
          { id: 'rx-003', patientId: 'PAT-003', prescripteurId: 'ext-doc-003' },
        ],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.listEegDemandes();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rx-002');
      expect(result[0].prescriptionParentId).toBe('rx-002');
      expect(result[1].id).toBe('rx-003');
      expect(result[1].prescriptionParentId).toBe('rx-003');
    });
  });

  describe('findDemandeEegById', () => {
    it('should return the matching flat demande by id', async () => {
      const rawResponse = {
        data: [
          { id: 'rx-001', patientId: 'PAT-001', prescripteurId: 'ext-001' },
          { id: 'rx-002', patientId: 'PAT-002', prescripteurId: 'ext-002' },
        ],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.findDemandeEegById('rx-002');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('rx-002');
      expect(result!.prescriptionParentId).toBe('rx-002');
    });

    it('should return null for unknown id', async () => {
      const rawResponse = {
        data: [{ id: 'rx-001', patientId: 'PAT-001', prescripteurId: 'ext-001' }],
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(rawResponse as any));

      const result = await service.findDemandeEegById('rx-999');

      expect(result).toBeNull();
    });
  });

  describe('updateDemandeStatut', () => {
    it('should PATCH /eeg/{id}/statut (route plate, pas de sous-ressource demandes)', async () => {
      const patchSpy = jest
        .spyOn(httpService, 'patch')
        .mockReturnValue(of({ data: {} } as any));

      await service.updateDemandeStatut('rx-001', 'rx-001', 'EN_COURS', 'motif');

      expect(patchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/eeg\/rx-001\/statut$/),
        { statut: 'EN_COURS', motif: 'motif' },
        expect.any(Object),
      );
    });

    it('should not throw on API error', async () => {
      jest
        .spyOn(httpService, 'patch')
        .mockReturnValue(throwError(() => new Error('down')));

      await expect(
        service.updateDemandeStatut('rx-001', 'rx-001', 'EN_COURS'),
      ).resolves.toBeUndefined();
    });
  });
});
