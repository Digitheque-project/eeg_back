import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RectifierResultatDto } from './dto/rectifier-resultat.dto';
import { UploadClientService } from '../external/upload-client.service';
import * as path from 'path';

@Injectable()
export class ResultatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadClient: UploadClientService,
  ) {}

  // ─── Upload image tracé (PNG/JPG uniquement) ───────────────────────
  // Stockée sur le service upload centralisé du CHU (plus de disque local) —
  // `fichierImagePath` contient désormais le filename renvoyé par ce
  // service (clé pour le récupérer), pas un chemin disque.
  async uploadImageTrace(
    demandeId: string,
    fichier: Express.Multer.File,
    technicienId: string,
    token?: string,
  ) {
    if (!fichier) {
      throw new BadRequestException('Fichier image requis');
    }

    // Vérifier extension
    const ext = path.extname(fichier.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
      throw new BadRequestException(
        'Seuls les formats PNG et JPG sont acceptés',
      );
    }

    const demande = await this.prisma.eegDemande.findUnique({
      where: { id: demandeId },
    });
    if (!demande)
      throw new NotFoundException(`Demande ${demandeId} introuvable`);

    // Une image ne doit pas être rattachée à une demande annulée (le
    // résultat deviendrait un orphelin dans les archives).
    if (demande.statut === 'ANNULEE') {
      throw new BadRequestException(
        'Impossible d’uploader une image : la demande est annulée',
      );
    }

    // Contrôle d'immutabilité : bloquer l'upload si le résultat est déjà figé
    const existant = await this.prisma.eegResultat.findUnique({
      where: { demandeId },
    });
    if (existant?.estImmutable) {
      throw new BadRequestException(
        'Ce résultat est immuable et ne peut plus être modifié directement (utiliser la rectification)',
      );
    }

    const uploaded = await this.uploadClient.uploadFile(
      fichier.buffer,
      fichier.originalname,
      fichier.mimetype,
      token,
    );

    if (existant) {
      return this.prisma.eegResultat.update({
        where: { demandeId },
        data: {
          fichierImagePath: uploaded.filename,
          nomFichierImage: fichier.originalname,
        },
      });
    }

    return this.prisma.eegResultat.create({
      data: {
        demandeId,
        fichierImagePath: uploaded.filename,
        nomFichierImage: fichier.originalname,
        medecinValidateurId: technicienId,
      },
    });
  }

  // ─── Récupération de l'image tracé (pour affichage) ────────────────
  async getImageTrace(
    demandeId: string,
    token?: string,
  ): Promise<{ data: Buffer; contentType: string; nomFichier: string }> {
    const resultat = await this.prisma.eegResultat.findUnique({
      where: { demandeId },
      select: { fichierImagePath: true, nomFichierImage: true },
    });
    if (!resultat?.fichierImagePath) {
      throw new NotFoundException('Aucune image pour cette demande');
    }
    const { data, contentType } = await this.uploadClient.getFile(
      resultat.fichierImagePath,
      token,
    );
    return { data, contentType, nomFichier: resultat.nomFichierImage ?? 'trace' };
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

    // Champs du compte rendu — cf. ArchiverResultatDto / formulaire papier réel
    const CHAMPS_CLINIQUES = [
      'aeActuel',
      'age1ereCrise',
      'dpm',
      'typeCrises',
      'autresRc',
      'dateDerniereCrise',
      'activiteDeFond',
      'anomaliesAuRepos',
      'testActivationHpn',
      'testActivationSli',
      'conclusion',
      'conduiteATenir',
    ] as const;

    const ancienneVersion: Record<string, string | null> = {};
    const nouvelleVersion: Record<string, string> = {};
    const miseAJour: Record<string, string | number> = {
      version: resultat.version + 1,
    };

    for (const champ of CHAMPS_CLINIQUES) {
      const nouvelleValeur = dto[champ];
      if (nouvelleValeur !== undefined) {
        ancienneVersion[champ] = resultat[champ];
        nouvelleVersion[champ] = nouvelleValeur;
        miseAJour[champ] = nouvelleValeur;
      }
    }

    // Créer la trace de rectification (audit trail) — snapshot avant/après
    await this.prisma.eegRectification.create({
      data: {
        resultatId,
        auteurId,
        motif: dto.motif,
        ancienneVersion,
        nouvelleVersion,
      },
    });

    return this.prisma.eegResultat.update({
      where: { id: resultatId },
      data: miseAJour,
      include: { rectifications: true },
    });
  }
}
