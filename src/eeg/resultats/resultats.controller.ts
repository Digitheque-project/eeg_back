import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Request,
  Res,
  StreamableFile,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import { createReadStream } from 'fs';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { ResultatsService } from './resultats.service';
import { RectifierResultatDto } from './dto/rectifier-resultat.dto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

@ApiTags('Résultats')
@Controller('eeg')
export class ResultatsController {
  constructor(private readonly resultatsService: ResultatsService) {}

  // POST /eeg/upload/image/:demandeId
  @Post('upload/image/:demandeId')
  @ApiOperation({
    summary: 'TECHNICIEN : Uploader une image de trace EEG (PNG/JPG)',
  })
  @ApiParam({ name: 'demandeId', description: 'ID de la demande EEG' })
  @UseInterceptors(
    FileInterceptor('fichier', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
    }),
  )
  uploadImageTrace(
    @Param('demandeId') demandeId: string,
    @UploadedFile() fichier: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    const technicienId = req.user!.id;
    return this.resultatsService.uploadImageTrace(
      demandeId,
      fichier,
      technicienId,
    );
  }

  // GET /eeg/upload/image/:demandeId
  // Sert l'image tracé déjà uploadée — utilisé par l'onglet compte rendu
  // (pour que le chef de service voie le tracé qu'il interprète) et par
  // les archives (pour retrouver l'image d'un résultat déjà validé).
  @Get('upload/image/:demandeId')
  @ApiOperation({
    summary: "Récupérer l'image de trace EEG déjà uploadée",
  })
  @ApiParam({ name: 'demandeId', description: 'ID de la demande EEG' })
  async getImageTrace(
    @Param('demandeId') demandeId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { cheminFichier, nomFichier } =
      await this.resultatsService.getCheminImage(demandeId);
    const ext = path.extname(nomFichier).toLowerCase();
    res.set({
      'Content-Type': ext === '.png' ? 'image/png' : 'image/jpeg',
      'Content-Disposition': `inline; filename="${nomFichier}"`,
    });
    return new StreamableFile(createReadStream(path.resolve(cheminFichier)));
  }

  // RÈGLE MÉTIER — à faire respecter par le RolesGuard en Phase 6
  // Rôle autorisé : CHEF_SERVICE
  // Prérequis : EegResultat.estImmutable === true
  // POST /eeg/resultats/:id/rectifier
  @Post('resultats/:id/rectifier')
  @ApiOperation({
    summary:
      'CHEF_SERVICE : Rectifier un résultat immuable (crée une trace EegRectification et incrémente la version)',
  })
  @ApiParam({ name: 'id', description: 'ID du résultat EEG (EegResultat.id)' })
  @ApiBody({ type: RectifierResultatDto })
  rectifierResultat(
    @Param('id') id: string,
    @Body() dto: RectifierResultatDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const auteurId = req.user!.id;
    return this.resultatsService.rectifierResultat(id, dto, auteurId);
  }
}
