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

@ApiTags('Demandes')
@Controller('eeg/demandes')
export class DemandesController {
  constructor(private readonly demandesService: DemandesService) {}

  @Get('worklist')
  @ApiOperation({ summary: 'Worklist filtrée par rôle' })
  getWorklist(
    @Request() req: AuthenticatedRequest,
    @Query('role') roleParam?: string,
  ) {
    const role = roleParam || req.user?.role;
    return this.demandesService.getWorklist(role ?? '');
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: "Historique EEG d'un patient" })
  getDemandesByPatient(@Param('patientId') patientId: string) {
    return this.demandesService.getDemandesByPatient(patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'une demande EEG" })
  @ApiParam({ name: 'id' })
  getDemandeById(@Param('id') id: string) {
    return this.demandesService.getDemandeById(id);
  }

  @Patch(':id/annuler')
  @ApiOperation({ summary: 'Annuler une demande EEG' })
  annulerDemande(@Param('id') id: string, @Body('motif') motif: string) {
    return this.demandesService.annulerDemande(id, motif);
  }

  // RÈGLE MÉTIER — à faire respecter par le RolesGuard en Phase 6
  // Rôle autorisé : TECHNICIEN
  // Statut requis de la demande avant action : CREEE
  @Patch(':id/refuser')
  @ApiOperation({
    summary:
      'TECHNICIEN : Refuser une prescription avec motif (CREEE → ANNULEE)',
  })
  refuserDemande(
    @Param('id') id: string,
    @Body('motif') motif: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const technicienId =
      req.user?.id ?? 'tec-00000000-0000-0000-0000-000000000002';
    return this.demandesService.refuserDemande(id, motif, technicienId);
  }

  // RÈGLE MÉTIER — à faire respecter par le RolesGuard en Phase 6
  // Rôle autorisé : TECHNICIEN
  // Statut requis de la demande avant action : CREEE
  @Patch(':id/planifier')
  @ApiOperation({
    summary: 'TECHNICIEN : Planifier un RDV (CREEE → PLANIFIEE)',
  })
  planifierRdv(
    @Param('id') id: string,
    @Body() dto: PlanifierRdvDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const technicienId =
      req.user?.id ?? 'tec-00000000-0000-0000-0000-000000000002';
    return this.demandesService.planifierRdv(id, dto, technicienId);
  }

  // RÈGLE MÉTIER — à faire respecter par le RolesGuard en Phase 6
  // Rôle autorisé : TECHNICIEN
  // Statut requis de la demande avant action : CREEE avec urgence STAT (prise en charge immédiate)
  //   ou PLANIFIEE (examen planifié)
  @Patch(':id/realiser')
  @ApiOperation({
    summary:
      "TECHNICIEN : Réaliser un examen, uploader l'image (CREEE+STAT ou PLANIFIEE → EN_COURS)",
  })
  realiserDemande(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const technicienId =
      req.user?.id ?? 'tec-00000000-0000-0000-0000-000000000002';
    return this.demandesService.realiserDemande(id, technicienId);
  }

  // RÈGLE MÉTIER — à faire respecter par le RolesGuard en Phase 6
  // Rôle autorisé : CHEF_SERVICE
  // Statut requis de la demande avant action : EN_COURS
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
    const chefId = req.user?.id ?? 'med-00000000-0000-0000-0000-000000000001';
    return this.demandesService.archiverResultat(id, compteRendu, chefId);
  }
}
