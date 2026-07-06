import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RectifierResultatDto } from './dto/rectifier-resultat.dto';
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

    // Contrôle d'immutabilité : bloquer l'upload si le résultat est déjà figé
    const existant = await this.prisma.eegResultat.findUnique({
      where: { demandeId },
    });
    if (existant?.estImmutable) {
      throw new BadRequestException(
        'Ce résultat est immuable et ne peut plus être modifié directement (utiliser la rectification)',
      );
    }

    // Stocker l'image
    const dossier = path.join('uploads', 'eeg', 'images', demandeId);
    fs.mkdirSync(dossier, { recursive: true });
    const cheminFichier = path.join(dossier, `trace${ext}`);
    fs.writeFileSync(cheminFichier, fichier.buffer);

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

  // ─── Rectification d'un résultat immuable ─────────────────────────
  async rectifierResultat(
    resultatId: string,
    dto: RectifierResultatDto,
    auteurId: string,
  ) {
    const resultat = await this.prisma.eegResultat.findUnique({
      where: { id: resultatId },
    });
    if (!resultat) {
      throw new NotFoundException(`Résultat ${resultatId} introuvable`);
    }

    // Seul un résultat immuable (déjà validé) peut être rectifié
    if (!resultat.estImmutable) {
      throw new BadRequestException(
        'Seul un résultat immuable peut être rectifié',
      );
    }

    // Créer la trace de rectification (audit trail)
    await this.prisma.eegRectification.create({
      data: {
        resultatId,
        auteurId,
        motif: dto.motif,
        // Conserver le contenu ANCIEN
        ancienCompteRendu:    resultat.compteRendu            ?? null,
        ancienRythmesDeFond:  resultat.rythmesDeFond          ?? null,
        ancienAnomalies:      resultat.anomaliesDetectees      ?? null,
        ancienneConclusion:   resultat.conclusionDiagnostique  ?? null,
        // Enregistrer le contenu NOUVEAU
        nouveauCompteRendu:   dto.nouveauCompteRendu           ?? null,
        nouveauRythmesDeFond: dto.nouveauRythmesDeFond          ?? null,
        nouveauAnomalies:     dto.nouveauAnomalies              ?? null,
        nouvelleConclusion:   dto.nouvelleConclusion            ?? null,
      },
    });

    // Construire l'objet de mise à jour (uniquement les champs fournis)
    const miseAJour: Record<string, string | number | null> = {
      version: resultat.version + 1,
    };
    if (dto.nouveauCompteRendu   !== undefined) miseAJour.compteRendu            = dto.nouveauCompteRendu;
    if (dto.nouveauRythmesDeFond !== undefined) miseAJour.rythmesDeFond          = dto.nouveauRythmesDeFond;
    if (dto.nouveauAnomalies     !== undefined) miseAJour.anomaliesDetectees     = dto.nouveauAnomalies;
    if (dto.nouvelleConclusion   !== undefined) miseAJour.conclusionDiagnostique = dto.nouvelleConclusion;

    return this.prisma.eegResultat.update({
      where: { id: resultatId },
      data: miseAJour,
      include: { rectifications: true },
    });
  }
}
