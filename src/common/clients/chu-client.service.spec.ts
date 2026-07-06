import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { ChuClientService } from './chu-client.service';

describe('ChuClientService', () => {
  let service: ChuClientService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChuClientService,
        {
          provide: HttpService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ChuClientService>(ChuClientService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyServiceInfo', () => {
    it('should return service info on success', async () => {
      const mockResponse: AxiosResponse = {
        data: { id: 'svc-1', name: 'EEG' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.getMyServiceInfo();

      expect(result).toEqual({ id: 'svc-1', name: 'EEG' });
    });

    it('should return null on error instead of throwing', async () => {
      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('Network Error')));

      const result = await service.getMyServiceInfo();

      expect(result).toBeNull();
    });
  });

  describe('getChuInfo', () => {
    it('should return null on error instead of throwing', async () => {
      jest.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('Network Error')));

      const result = await service.getChuInfo();

      expect(result).toBeNull();
    });
  });
});
