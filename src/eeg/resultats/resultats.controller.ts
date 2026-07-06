import {
  Controller,
  Post,
  Param,
  Body,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { ResultatsService } from './resultats.service';
import { RectifierResultatDto } from './dto/rectifier-resultat.dto';

@ApiTags('Résultats')
@Controller('eeg')
export class ResultatsController {
  constructor(private readonly resultatsService: ResultatsService) {}

  // POST /eeg/upload/image/:demandeId
  @Post('upload/image/:demandeId')
  @ApiOperation({ summary: 'TECHNICIEN : Uploader une image de trace EEG (PNG/JPG)' })
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
    @Request() req: any,
  ) {
    const technicienId = req.user?.id ?? 'tec-00000000-0000-0000-0000-000000000002';
    return this.resultatsService.uploadImageTrace(demandeId, fichier, technicienId);
  }

  // RÈGLE MÉTIER (Phase 2) — à faire respecter par le RolesGuard en Phase 6
  // Rôle(s) autorisé(s) : CHEF_SERVICE (ou MEDECIN_SERVICE selon validation métier)
  // Prérequis : EegResultat.estImmutable === true
  // POST /eeg/resultats/:id/rectifier
  @Post('resultats/:id/rectifier')
  @ApiOperation({
    summary: 'CHEF_SERVICE : Rectifier un résultat immuable (crée une trace EegRectification et incrémente la version)',
  })
  @ApiParam({ name: 'id', description: 'ID du résultat EEG (EegResultat.id)' })
  @ApiBody({ type: RectifierResultatDto })
  rectifierResultat(
    @Param('id') id: string,
    @Body() dto: RectifierResultatDto,
    @Request() req: any,
  ) {
    const auteurId = req.user?.id ?? 'med-00000000-0000-0000-0000-000000000001';
    return this.resultatsService.rectifierResultat(id, dto, auteurId);
  }
}
