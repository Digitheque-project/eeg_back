import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { UploadClientService } from './upload-client.service';

describe('UploadClientService', () => {
  let service: UploadClientService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadClientService,
        {
          provide: HttpService,
          useValue: { post: jest.fn(), get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UploadClientService>(UploadClientService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should POST the file and return the uploaded file info', async () => {
      const responseBody = {
        filename: 'abc-123.png',
        path: '/files/abc-123.png',
        url: 'https://service-upload-u5z9.onrender.com/files/abc-123.png',
        mimetype: 'image/png',
        size: 68,
      };
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of({ data: responseBody } as any));

      const result = await service.uploadFile(
        Buffer.from('fake-image'),
        'trace.png',
        'image/png',
        'user-token',
      );

      expect(result).toEqual(responseBody);
    });

    it('should propagate the error instead of swallowing it (unlike read-only clients)', async () => {
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(throwError(() => new Error('upload failed')));

      await expect(
        service.uploadFile(Buffer.from('x'), 'trace.png', 'image/png'),
      ).rejects.toThrow('upload failed');
    });
  });

  describe('getFile', () => {
    it('should GET the file as a buffer with its content-type', async () => {
      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: Buffer.from('fake-bytes'),
          headers: { 'content-type': 'image/png' },
        } as any),
      );

      const result = await service.getFile('abc-123.png', 'user-token');

      expect(result.contentType).toBe('image/png');
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it('should propagate the error instead of swallowing it', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => new Error('not found')));

      await expect(service.getFile('missing.png')).rejects.toThrow('not found');
    });
  });
});
