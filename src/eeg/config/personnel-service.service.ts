import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonnelServiceDto } from './dto/personnel-service.dto';

/**
 * Personnel du service de Neurologie imprimé sur le compte rendu EEG.
 *
 * Singleton métier : une seule ligne en base. Aucune notion de « première
 * installation » à gérer côté appelant — tant qu'aucune ligne n'existe, la
 * lecture renvoie des valeurs vides (le front affiche « Néant »), jamais
 * un 404 qui casserait la génération du document.
 */
@Injectable()
export class PersonnelServiceService {
  private static readonly VIDE: PersonnelServiceDto = {
    chefDeService: '',
    medecins: [],
    majorDeService: '',
    techniciens: [],
    telephoneRdv: '',
  };

  constructor(private readonly prisma: PrismaService) {}

  /** Ligne unique (la plus récemment mise à jour si plusieurs existent). */
  private async findSingleton() {
    return this.prisma.personnelServiceNeurologie.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(): Promise<PersonnelServiceDto> {
    const ligne = await this.findSingleton();
    if (!ligne)
      return { ...PersonnelServiceService.VIDE, medecins: [], techniciens: [] };
    return {
      chefDeService: ligne.chefDeService,
      medecins: ligne.medecins,
      majorDeService: ligne.majorDeService,
      techniciens: ligne.techniciens,
      telephoneRdv: ligne.telephoneRdv,
    };
  }

  /**
   * Upsert de la ligne unique. `upsert` Prisma exige un champ unique : la
   * clé primaire est un uuid généré, on passe donc par update-si-existe /
   * create-sinon.
   */
  async update(dto: PersonnelServiceDto): Promise<PersonnelServiceDto> {
    const existante = await this.findSingleton();
    const data = {
      chefDeService: dto.chefDeService,
      medecins: dto.medecins,
      majorDeService: dto.majorDeService,
      techniciens: dto.techniciens,
      telephoneRdv: dto.telephoneRdv,
    };

    const ligne = existante
      ? await this.prisma.personnelServiceNeurologie.update({
          where: { id: existante.id },
          data,
        })
      : await this.prisma.personnelServiceNeurologie.create({ data });

    return {
      chefDeService: ligne.chefDeService,
      medecins: ligne.medecins,
      majorDeService: ligne.majorDeService,
      techniciens: ligne.techniciens,
      telephoneRdv: ligne.telephoneRdv,
    };
  }
}
