import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Archives')
@Controller('eeg/archives')
export class ArchivesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Archives EEG — résultats validés',
    description: 'Retourne uniquement les résultats validés (estImmutable=true). Filtrable par patient, date, type EEG, conclusion, numéro EEG.',
  })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'numeroEEG', required: false })
  @ApiQuery({ name: 'typeEEG', required: false, enum: ['STANDARD', 'SOMMEIL', 'AMBULATOIRE', 'VIDEO_EEG'] })
  @ApiQuery({ name: 'dateDebut', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateFin', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'conclusion', required: false, description: 'Recherche texte libre dans conclusionDiagnostique' })
  @ApiQuery({ name: 'page', required: false, description: 'Page (défaut 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Résultats par page (défaut 20, max 100)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des résultats archivés' })
  async getArchives(
    @Query('patientId') patientId?: string,
    @Query('numeroEEG') numeroEEG?: string,
    @Query('typeEEG') typeEEG?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('conclusion') conclusion?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      estImmutable: true,
      demande: {},
    };

    if (patientId) where.demande.patientId = patientId;
    if (typeEEG) where.demande.typeEEG = typeEEG;
    if (numeroEEG) where.demande.numeroEEG = { contains: numeroEEG };
    if (dateDebut || dateFin) {
      where.dateValidation = {};
      if (dateDebut) where.dateValidation.gte = new Date(dateDebut);
      if (dateFin) {
        const fin = new Date(dateFin);
        fin.setHours(23, 59, 59, 999);
        where.dateValidation.lte = fin;
      }
    }
    if (conclusion) {
      where.conclusionDiagnostique = { contains: conclusion };
    }

    const [total, resultats] = await Promise.all([
      this.prisma.eegResultat.count({ where }),
      this.prisma.eegResultat.findMany({
        where,
        include: {
          demande: {
            select: {
              numeroEEG: true,
              typeEEG: true,
              urgence: true,
              statut: true,
              dateCreation: true,
              dateAck: true,
              patient: { select: { id: true, nom: true, prenom: true, age: true, sexe: true, idDossier: true } },
              prescripteur: { select: { nom: true, prenom: true, role: true } },
            },
          },
          medecinValidateur: {
            select: { nom: true, prenom: true, role: true, numeroOrdre: true },
          },
          rectifications: {
            orderBy: { dateRectification: 'desc' },
            take: 1,
            select: { dateRectification: true, motif: true },
          },
        },
        orderBy: { dateValidation: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    return {
      data: resultats,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }
}
