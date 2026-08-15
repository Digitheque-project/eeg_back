import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ActionAudit } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Pas de @Roles ici : le dashboard (visible aux 3 rôles EEG) alimente son
// widget "Dernières activités" depuis cet endpoint pour tout le monde — le
// restreindre casserait ce widget pour TECHNICIEN. Reste protégé par
// JwtAuthGuard (authentification requise) comme le reste de l'API.
@ApiTags('Audit')
@Controller('eeg/audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: "Journal d'audit EEG",
    description:
      "Retourne les 100 dernières entrées d'audit, triées par date décroissante. Filtrable par patientId, demandeId ou action.",
  })
  @ApiQuery({
    name: 'patientId',
    required: false,
    description: 'Filtrer par identifiant patient',
  })
  @ApiQuery({
    name: 'demandeId',
    required: false,
    description: 'Filtrer par identifiant demande',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: [
      'CREATION',
      'CONSULTATION',
      'MODIFICATION',
      'VALIDATION',
      'ANNULATION',
      'IMPRESSION',
      'ACK',
    ],
    description: "Filtrer par type d'action",
  })
  @ApiResponse({
    status: 200,
    description: "Journal d'audit (max 100 entrées)",
  })
  async getAudit(
    @Query('patientId') patientId?: string,
    @Query('demandeId') demandeId?: string,
    @Query('action') action?: string,
  ) {
    return this.prisma.eegAudit.findMany({
      where: {
        ...(patientId && { patientId }),
        ...(demandeId && { demandeId }),
        ...(action && { action: action as ActionAudit }),
      },
      orderBy: { dateAction: 'desc' },
      take: 100,
    });
  }
}
