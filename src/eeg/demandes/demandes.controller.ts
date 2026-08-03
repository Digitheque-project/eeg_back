import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { DemandesService } from './demandes.service';
import { PlanifierRdvDto } from './dto/planifier-rdv.dto';
import { ArchiverResultatDto } from './dto/archiver-resultat.dto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { BearerToken } from '../../common/decorators/bearer-token.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Demandes')
@Controller('eeg/demandes')
export class DemandesController {
  constructor(private readonly demandesService: DemandesService) {}

  @Get('worklist')
  @ApiOperation({ summary: 'Worklist filtrée par rôle' })
  getWorklist(
    @Request() req: AuthenticatedRequest,
    @Query('role') roleParam?: string,
    @BearerToken() token?: string,
  ) {
    const role = roleParam || req.user?.role;
    return this.demandesService.getWorklist(role ?? '', token);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: "Historique EEG d'un patient" })
  getDemandesByPatient(@Param('patientId') patientId: string) {
    return this.demandesService.getDemandesByPatient(patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'une demande EEG" })
  @ApiParam({ name: 'id' })
  getDemandeById(@Param('id') id: string, @BearerToken() token?: string) {
    return this.demandesService.getDemandeById(id, token);
  }

  @Roles('TECHNICIEN', 'CHEF_SERVICE')
  @Patch(':id/annuler')
  @ApiOperation({ summary: 'Annuler une demande EEG' })
  annulerDemande(
    @Param('id') id: string,
    @Body('motif') motif: string,
    @BearerToken() token?: string,
  ) {
    return this.demandesService.annulerDemande(id, motif, token);
  }

  // Statut requis de la demande avant action : CREEE (vérifié dans le service)
  @Roles('TECHNICIEN')
  @Patch(':id/refuser')
  @ApiOperation({
    summary:
      'TECHNICIEN : Refuser une prescription avec motif (CREEE → ANNULEE)',
  })
  refuserDemande(
    @Param('id') id: string,
    @Body('motif') motif: string,
    @Request() req: AuthenticatedRequest,
    @BearerToken() token?: string,
  ) {
    const technicienId = req.user!.id;
    return this.demandesService.refuserDemande(id, motif, technicienId, token);
  }

  // Statut requis de la demande avant action : CREEE (vérifié dans le service)
  @Roles('TECHNICIEN')
  @Patch(':id/planifier')
  @ApiOperation({
    summary: 'TECHNICIEN : Planifier un RDV (CREEE → PLANIFIEE)',
  })
  planifierRdv(
    @Param('id') id: string,
    @Body() dto: PlanifierRdvDto,
    @Request() req: AuthenticatedRequest,
    @BearerToken() token?: string,
  ) {
    const technicienId = req.user!.id;
    return this.demandesService.planifierRdv(id, dto, technicienId, token);
  }

  // Statut requis : CREEE avec urgence STAT (prise en charge immédiate) ou
  // PLANIFIEE (examen planifié) — vérifié dans le service. CHEF_SERVICE est
  // volontairement inclus : il doit pouvoir réaliser un examen lui-même
  // dans les cas exceptionnels (absence du technicien, urgence).
  @Roles('TECHNICIEN', 'CHEF_SERVICE')
  @Patch(':id/realiser')
  @ApiOperation({
    summary:
      "TECHNICIEN : Réaliser un examen, uploader l'image (CREEE+STAT ou PLANIFIEE → EN_COURS)",
  })
  realiserDemande(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @BearerToken() token?: string,
  ) {
    const technicienId = req.user!.id;
    return this.demandesService.realiserDemande(id, technicienId, token);
  }

  // Statut requis de la demande avant action : EN_COURS (vérifié dans le service)
  @Roles('CHEF_SERVICE')
  @Patch(':id/archiver')
  @ApiOperation({
    summary:
      'CHEF_SERVICE : Interpréter et archiver le résultat en une seule action (EN_COURS → RESULTAT_DISPONIBLE)',
  })
  archiverResultat(
    @Param('id') id: string,
    @Body() compteRendu: ArchiverResultatDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const chefId = req.user!.id;
    return this.demandesService.archiverResultat(id, compteRendu, chefId);
  }
}
