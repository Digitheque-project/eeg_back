import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let prisma: any;

  const mockPrisma = {
    eegNotification: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const mockPatientLookup = {
    getPatientInfo: jest.fn().mockResolvedValue(null),
  };

  const reqPour = (role: string) => ({ user: { role } }) as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsController,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PatientLookupService, useValue: mockPatientLookup },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    prisma = mockPrisma;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getNotifications', () => {
    it('should scope TECHNICIEN to its own role plus untargeted notifications', async () => {
      await controller.getNotifications(reqPour('TECHNICIEN'));

      expect(prisma.eegNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ roleCible: null }, { roleCible: 'TECHNICIEN' }],
          }),
        }),
      );
    });

    it('should scope CHEF_SERVICE to its own role plus untargeted notifications', async () => {
      await controller.getNotifications(reqPour('CHEF_SERVICE'));

      expect(prisma.eegNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ roleCible: null }, { roleCible: 'CHEF_SERVICE' }],
          }),
        }),
      );
    });

    it('should not scope MAJOR_SERVICE (supervision role sees everything)', async () => {
      await controller.getNotifications(reqPour('MAJOR_SERVICE'));

      const where = prisma.eegNotification.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
    });
  });

  describe('marquerToutesCommeLues', () => {
    it('should only mark as read the notifications visible to that role', async () => {
      await controller.marquerToutesCommeLues(reqPour('TECHNICIEN'));

      expect(prisma.eegNotification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ roleCible: null }, { roleCible: 'TECHNICIEN' }],
            lu: false,
          }),
        }),
      );
    });
  });
});
