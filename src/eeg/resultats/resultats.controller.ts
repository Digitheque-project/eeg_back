import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ResultatsService } from './resultats.service';

@Controller('eeg')
export class ResultatsController {
  constructor(private readonly resultatsService: ResultatsService) {}

  // POST /eeg/upload/image/:demandeId
  @Post('upload/image/:demandeId')
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
}
