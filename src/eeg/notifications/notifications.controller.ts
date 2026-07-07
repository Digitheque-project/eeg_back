import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';

@Controller('eeg/notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientLookup: PatientLookupService,
  ) {}

  private async attachPatientIfAny<T extends { patientId: string | null }>(
    notif: T,
  ) {
    if (!notif.patientId) return { ...notif, patient: null };
    const patient = await this.patientLookup.getPatientInfo(notif.patientId);
    return { ...notif, patient };
  }

  // GET /eeg/notifications
  // GET /eeg/notifications?lu=false
  @Get()
  async getNotifications(@Query('lu') lu?: string) {
    const where: Prisma.EegNotificationWhereInput = {};

    if (lu !== undefined) {
      where.lu = lu === 'true';
    }

    const notifications = await this.prisma.eegNotification.findMany({
      where,
      include: {
        demande: {
          select: { numeroEEG: true, statut: true, urgence: true },
        },
        actions: true,
      },
      orderBy: { horodatage: 'desc' },
      take: 100,
    });
    return Promise.all(notifications.map((n) => this.attachPatientIfAny(n)));
  }

  // GET /eeg/notifications/count
  @Get('count')
  async countNonLues() {
    const total = await this.prisma.eegNotification.count();
    const nonLues = await this.prisma.eegNotification.count({
      where: { lu: false },
    });
    return { total, nonLues };
  }

  // GET /eeg/notifications/:id
  @Get(':id')
  async getNotificationById(@Param('id') id: string) {
    const notification = await this.prisma.eegNotification.findUnique({
      where: { id },
      include: {
        demande: true,
        actions: true,
      },
    });
    if (!notification) return null;
    return this.attachPatientIfAny(notification);
  }

  // PATCH /eeg/notifications/:id/lu
  @Patch(':id/lu')
  async marquerCommeLue(@Param('id') id: string) {
    return this.prisma.eegNotification.update({
      where: { id },
      data: {
        lu: true,
        dateLecture: new Date(),
      },
    });
  }

  // PATCH /eeg/notifications/lire-tout
  @Patch('lire-tout')
  async marquerToutesCommeLues() {
    const result = await this.prisma.eegNotification.updateMany({
      where: { lu: false },
      data: {
        lu: true,
        dateLecture: new Date(),
      },
    });
    return {
      message: `${result.count} notification(s) marquée(s) comme lue(s)`,
      count: result.count,
    };
  }
}
