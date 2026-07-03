import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ResultatsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Upload image tracé (PNG/JPG uniquement) ───────────────────────
  async uploadImageTrace(
    demandeId: string,
    fichier: Express.Multer.File,
    technicienId: string,
  ) {
    if (!fichier) {
      throw new BadRequestException('Fichier image requis');
    }

    // Vérifier extension
    const ext = path.extname(fichier.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
      throw new BadRequestException('Seuls les formats PNG et JPG sont acceptés');
    }

    const demande = await this.prisma.eegDemande.findUnique({
      where: { id: demandeId },
    });
    if (!demande) throw new NotFoundException(`Demande ${demandeId} introuvable`);

    // Stocker l'image
    const dossier = path.join('uploads', 'eeg', 'images', demandeId);
    fs.mkdirSync(dossier, { recursive: true });
    const cheminFichier = path.join(dossier, `trace${ext}`);
    fs.writeFileSync(cheminFichier, fichier.buffer);

    // Créer ou mettre à jour le résultat
    const existant = await this.prisma.eegResultat.findUnique({
      where: { demandeId },
    });

    if (existant) {
      return this.prisma.eegResultat.update({
        where: { demandeId },
        data: {
          fichierImagePath: cheminFichier,
          nomFichierImage: fichier.originalname,
        },
      });
    }

    return this.prisma.eegResultat.create({
      data: {
        demandeId,
        fichierImagePath: cheminFichier,
        nomFichierImage: fichier.originalname,
        medecinValidateurId: technicienId,
      },
    });
  }
}
