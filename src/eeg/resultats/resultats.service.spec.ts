import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResultatsService } from './resultats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadClientService } from '../external/upload-client.service';

describe('ResultatsService', () => {
  let service: ResultatsService;
  let prisma: any;
  let uploadClient: any;

  const mockPrisma = {
    eegDemande: { findUnique: jest.fn() },
    eegResultat: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  const mockUploadClient = {
    uploadFile: jest.fn(),
    getFile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResultatsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UploadClientService, useValue: mockUploadClient },
      ],
    }).compile();

    service = module.get<ResultatsService>(ResultatsService);
    prisma = mockPrisma;
    uploadClient = mockUploadClient;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadImageTrace', () => {
    const fichier = {
      originalname: 'trace.png',
      mimetype: 'image/png',
      buffer: Buffer.from('fake'),
    } as Express.Multer.File;

    it('should upload via UploadClientService and persist the returned filename (not a local path)', async () => {
      prisma.eegDemande.findUnique.mockResolvedValue({ id: 'dem-001' });
      prisma.eegResultat.findUnique.mockResolvedValue(null);
      uploadClient.uploadFile.mockResolvedValue({
        filename: 'abc-123.png',
        path: '/files/abc-123.png',
        url: 'https://service-upload-u5z9.onrender.com/files/abc-123.png',
        mimetype: 'image/png',
        size: 4,
      });
      prisma.eegResultat.create.mockResolvedValue({});

      await service.uploadImageTrace('dem-001', fichier, 'tech-001', 'user-token');

      expect(uploadClient.uploadFile).toHaveBeenCalledWith(
        fichier.buffer,
        'trace.png',
        'image/png',
        'user-token',
      );
      expect(prisma.eegResultat.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fichierImagePath: 'abc-123.png',
            nomFichierImage: 'trace.png',
          }),
        }),
      );
    });

    it('should reject non PNG/JPG extensions before calling the upload client', async () => {
      const mauvaisFichier = { ...fichier, originalname: 'trace.pdf' } as Express.Multer.File;

      await expect(
        service.uploadImageTrace('dem-001', mauvaisFichier, 'tech-001'),
      ).rejects.toThrow(BadRequestException);
      expect(uploadClient.uploadFile).not.toHaveBeenCalled();
    });

    it('should reject if the demande does not exist', async () => {
      prisma.eegDemande.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadImageTrace('dem-inconnue', fichier, 'tech-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getImageTrace', () => {
    it('should fetch the file from UploadClientService using the stored filename', async () => {
      prisma.eegResultat.findUnique.mockResolvedValue({
        fichierImagePath: 'abc-123.png',
        nomFichierImage: 'trace.png',
      });
      uploadClient.getFile.mockResolvedValue({
        data: Buffer.from('fake-bytes'),
        contentType: 'image/png',
      });

      const result = await service.getImageTrace('dem-001', 'user-token');

      expect(uploadClient.getFile).toHaveBeenCalledWith('abc-123.png', 'user-token');
      expect(result.contentType).toBe('image/png');
      expect(result.nomFichier).toBe('trace.png');
    });

    it('should throw NotFoundException if no image was ever uploaded', async () => {
      prisma.eegResultat.findUnique.mockResolvedValue(null);

      await expect(service.getImageTrace('dem-001')).rejects.toThrow(
        NotFoundException,
      );
      expect(uploadClient.getFile).not.toHaveBeenCalled();
    });
  });
});
