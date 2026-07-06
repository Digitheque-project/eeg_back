import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { AccueilClientService } from './accueil-client.service';

describe('AccueilClientService', () => {
  let service: AccueilClientService;
  let httpService: HttpService;

  const mockRawPatient = {
    id: 'CHU-2026-00001',
    nom: 'Doe',
    prenom: 'John',
    sexe: 'MALE' as const,
    dateNaissance: '1980-01-01',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccueilClientService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            patch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AccueilClientService>(AccueilClientService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPatientByExternalId', () => {
    it('should return normalized patient data on successful fetch', async () => {
      const mockResponse: AxiosResponse = {
        data: mockRawPatient,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.getPatientByExternalId('CHU-2026-00001');

      expect(result).toMatchObject({
        id: 'CHU-2026-00001',
        nom: 'Doe',
        prenom: 'John',
        sexe: 'M',
      });
      expect(typeof result?.age).toBe('number');
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/patients/CHU-2026-00001'),
        expect.objectContaining({
          params: { chuId: expect.any(String) },
          timeout: 5000,
        }),
      );
    });

    it('should return null on 404 (patient not found)', async () => {
      const error = {
        response: { status: 404 },
        message: 'Not Found',
      };

      jest.spyOn(httpService, 'get').mockReturnValue(
        throwError(() => error),
      );

      const result = await service.getPatientByExternalId('CHU-2026-00001');

      expect(result).toBeNull();
    });

    it('should return null on network error (service unavailable)', async () => {
      const error = {
        message: 'Network Error',
      };

      jest.spyOn(httpService, 'get').mockReturnValue(
        throwError(() => error),
      );

      const result = await service.getPatientByExternalId('CHU-2026-00001');

      expect(result).toBeNull();
    });

    it('should return null on timeout', async () => {
      const error = {
        message: 'timeout of 5000ms exceeded',
      };

      jest.spyOn(httpService, 'get').mockReturnValue(
        throwError(() => error),
      );

      const result = await service.getPatientByExternalId('CHU-2026-00001');

      expect(result).toBeNull();
    });

    it('should map FEMALE to F and compute age from dateNaissance', async () => {
      const mockResponse: AxiosResponse = {
        data: { ...mockRawPatient, sexe: 'FEMALE', dateNaissance: '2000-01-01' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.getPatientByExternalId('CHU-2026-00002');

      expect(result?.sexe).toBe('F');
      expect(result?.age).toBeGreaterThanOrEqual(25);
    });
  });

  describe('listPatients', () => {
    it('should return normalized patients and filter by search term', async () => {
      const mockResponse: AxiosResponse = {
        data: [
          mockRawPatient,
          { id: 'CHU-2026-00002', nom: 'Smith', prenom: 'Anna', sexe: 'FEMALE', dateNaissance: '1990-05-05' },
        ],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.listPatients(undefined, 'smith');

      expect(result).toHaveLength(1);
      expect(result[0].nom).toBe('Smith');
    });

    it('should return an empty array on error', async () => {
      jest.spyOn(httpService, 'get').mockReturnValue(
        throwError(() => new Error('Network Error')),
      );

      const result = await service.listPatients();

      expect(result).toEqual([]);
    });
  });

  describe('updatePatient', () => {
    it('should map sexe back to MALE/FEMALE and return normalized result', async () => {
      const mockResponse: AxiosResponse = {
        data: { ...mockRawPatient, nom: 'Updated' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'patch').mockReturnValue(of(mockResponse));

      const result = await service.updatePatient('CHU-2026-00001', { nom: 'Updated', sexe: 'M' });

      expect(httpService.patch).toHaveBeenCalledWith(
        expect.stringContaining('/patients/CHU-2026-00001'),
        expect.objectContaining({ nom: 'Updated', sexe: 'MALE' }),
        expect.any(Object),
      );
      expect(result?.nom).toBe('Updated');
    });

    it('should return null on error', async () => {
      jest.spyOn(httpService, 'patch').mockReturnValue(
        throwError(() => new Error('Network Error')),
      );

      const result = await service.updatePatient('CHU-2026-00001', { nom: 'X' });

      expect(result).toBeNull();
    });
  });
});
