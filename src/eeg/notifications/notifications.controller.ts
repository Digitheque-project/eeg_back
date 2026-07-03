import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('eeg/notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /eeg/notifications
  // GET /eeg/notifications?lu=false
  @Get()
  async getNotifications(@Query('lu') lu?: string) {
    const where: any = {};

    if (lu !== undefined) {
      where.lu = lu === 'true';
    }

    return this.prisma.eegNotification.findMany({
      where,
      include: {
        patient: {
          select: { nom: true, prenom: true, idDossier: true },
        },
        demande: {
          select: { numeroEEG: true, statut: true, urgence: true },
        },
        actions: true,
      },
      orderBy: { horodatage: 'desc' },
      take: 100,
    });
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
    return this.prisma.eegNotification.findUnique({
      where: { id },
      include: {
        patient: true,
        demande: true,
        actions: true,
      },
    });
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
