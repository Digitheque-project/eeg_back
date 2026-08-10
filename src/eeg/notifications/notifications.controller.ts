import { Controller, Get, Patch, Param, Query, Request } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

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

  // MAJOR_SERVICE est un rôle de supervision/reporting (voit déjà "Tous
  // les statuts" par défaut dans la worklist) : il voit toutes les
  // notifications, sans filtre. TECHNICIEN/CHEF_SERVICE ne voient que ce
  // qui les concerne (roleCible = leur rôle) + les notifications
  // génériques non ciblées (roleCible NULL, compat anciennes données).
  private filtreRole(role?: string): Prisma.EegNotificationWhereInput {
    if (!role || role === 'MAJOR_SERVICE') return {};
    return { OR: [{ roleCible: null }, { roleCible: role }] };
  }

  // GET /eeg/notifications
  // GET /eeg/notifications?lu=false
  @Get()
  async getNotifications(
    @Request() req: AuthenticatedRequest,
    @Query('lu') lu?: string,
  ) {
    const where: Prisma.EegNotificationWhereInput = {
      ...this.filtreRole(req.user?.role),
    };

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
  async countNonLues(@Request() req: AuthenticatedRequest) {
    const where = this.filtreRole(req.user?.role);
    const total = await this.prisma.eegNotification.count({ where });
    const nonLues = await this.prisma.eegNotification.count({
      where: { ...where, lu: false },
    });
    return { total, nonLues };
  }

  // GET /eeg/notifications/:id
  @Get(':id')
  async getNotificationById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const notification = await this.prisma.eegNotification.findFirst({
      where: { id, ...this.filtreRole(req.user?.role) },
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
  async marquerCommeLue(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    // Filtre par rôle : on ne peut marquer comme lue qu'une notification
    // qui nous concerne (sinon n'importe quel utilisateur pouvait marquer
    // lue une notification d'un autre rôle en connaissant son id).
    const notification = await this.prisma.eegNotification.findFirst({
      where: { id, ...this.filtreRole(req.user?.role) },
    });
    if (!notification) return null;
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
  async marquerToutesCommeLues(@Request() req: AuthenticatedRequest) {
    const result = await this.prisma.eegNotification.updateMany({
      where: { ...this.filtreRole(req.user?.role), lu: false },
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
