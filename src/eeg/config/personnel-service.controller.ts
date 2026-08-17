import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PersonnelServiceService } from './personnel-service.service';
import { PersonnelServiceDto } from './dto/personnel-service.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Configuration')
@Controller('eeg/config')
export class PersonnelServiceController {
  constructor(private readonly personnelService: PersonnelServiceService) {}

  // GET /eeg/config/personnel-service
  // Consommé par le générateur de compte rendu côté eeg_front
  // (lib/compte-rendu.ts → getPersonnelService).
  @Get('personnel-service')
  @ApiOperation({
    summary: 'Personnel du service de Neurologie affiché sur le compte rendu',
    description:
      "Retourne toujours 200 : si aucune ligne n'a encore été saisie, les valeurs sont vides (le front affiche « Néant »).",
  })
  @ApiResponse({ status: 200, type: PersonnelServiceDto })
  get(): Promise<PersonnelServiceDto> {
    // Aucun @Roles : lecture ouverte à tout rôle EEG authentifié
    // (TECHNICIEN, CHEF_SERVICE, MAJOR_SERVICE) — JwtAuthGuard reste actif.
    return this.personnelService.get();
  }

  // PUT /eeg/config/personnel-service
  @Put('personnel-service')
  @Roles('CHEF_SERVICE', 'MAJOR_SERVICE')
  @ApiOperation({
    summary:
      'CHEF_SERVICE / MAJOR_SERVICE : mettre à jour le personnel du service',
    description: "Upsert de l'unique ligne de configuration.",
  })
  @ApiBody({ type: PersonnelServiceDto })
  @ApiResponse({ status: 200, type: PersonnelServiceDto })
  update(@Body() dto: PersonnelServiceDto): Promise<PersonnelServiceDto> {
    return this.personnelService.update(dto);
  }
}
