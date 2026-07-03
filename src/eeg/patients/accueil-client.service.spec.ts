import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { AccueilClientService } from './accueil-client.service';

describe('AccueilClientService', () => {
  let service: AccueilClientService;
  let httpService: HttpService;

  const mockPatientData = {
    id: 'CHU-2026-00001',
    nom: 'Doe',
    prenom: 'John',
    age: 45,
    sexe: 'M',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccueilClientService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
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
    it('should return patient data on successful fetch', async () => {
      const mockResponse: AxiosResponse = {
        data: mockPatientData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.getPatientByExternalId('CHU-2026-00001');

      expect(result).toEqual(mockPatientData);
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
  });
});
