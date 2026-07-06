import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { DemandesService } from './demandes.service';
import { CreateDemandeDto } from './dto/create-demande.dto';
import { PlanifierRdvDto } from './dto/planifier-rdv.dto';
import { InterpreterDemandeDto } from './dto/interpreter-demande.dto';

@ApiTags('Demandes')
@Controller('eeg/demandes')
export class DemandesController {
  constructor(private readonly demandesService: DemandesService) {}

  @Post()
  @ApiOperation({ summary: "Créer une nouvelle demande EEG" })
  async creerDemande(@Body() dto: CreateDemandeDto, @Request() req: any) {
    const prescripteurId = req.user?.id ?? 'int-00000000-0000-0000-0000-000000000004';
    return this.demandesService.creerDemande(dto, prescripteurId);
  }

  @Get('worklist')
  @ApiOperation({ summary: 'Worklist filtrée par rôle' })
  getWorklist(@Request() req: any, @Query("role") roleParam?: string) {
    const role = roleParam || req.user?.role || 'MEDECIN_SERVICE';
    return this.demandesService.getWorklist(role);
  }

  @Get("patient/:patientId")
  @ApiOperation({ summary: "Historique EEG d'un patient" })
  getDemandesByPatient(@Param("patientId") patientId: string) {
    return this.demandesService.getDemandesByPatient(patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une demande EEG' })
  @ApiParam({ name: 'id' })
  getDemandeById(@Param('id') id: string) {
    return this.demandesService.getDemandeById(id);
  }

  // RÈGLE MÉTIER (Phase 2) — à faire respecter par le RolesGuard en Phase 6
  // Rôle(s) autorisé(s) : CHEF_SERVICE, MEDECIN_SERVICE
  // Statut requis de la demande avant action : CREEE
  @Patch(':id/valider')
  @ApiOperation({ summary: 'CHEF_SERVICE / MEDECIN_SERVICE : Valider une demande (CREEE → VALIDEE)' })
  validerDemande(@Param('id') id: string, @Request() req: any) {
    const medecinId = req.user?.id ?? 'int-00000000-0000-0000-0000-000000000004';
    return this.demandesService.validerDemande(id, medecinId);
  }

  @Patch(":id/annuler")
  @ApiOperation({ summary: "Annuler une demande EEG" })
  annulerDemande(@Param("id") id: string, @Body("motif") motif: string, @Request() req: any) {
    const userId = req.user?.id ?? "int-00000000-0000-0000-0000-000000000004";
    return this.demandesService.annulerDemande(id, motif, userId);
  }

  // RÈGLE MÉTIER (Phase 2) — à faire respecter par le RolesGuard en Phase 6
  // Rôle(s) autorisé(s) : CHEF_SERVICE, MEDECIN_SERVICE
  // Statut requis de la demande avant action : CREEE
  @Patch(':id/refuser')
  @ApiOperation({ summary: 'CHEF_SERVICE / MEDECIN_SERVICE : Refuser une demande avec motif' })
  refuserDemande(
    @Param('id') id: string,
    @Body('motif') motif: string,
    @Request() req: any,
  ) {
    const medecinId = req.user?.id ?? 'int-00000000-0000-0000-0000-000000000004';
    return this.demandesService.refuserDemande(id, motif, medecinId);
  }

  // RÈGLE MÉTIER (Phase 2) — à faire respecter par le RolesGuard en Phase 6
  // Rôle(s) autorisé(s) : CHEF_SERVICE, TECHNICIEN
  // Statut requis de la demande avant action : VALIDEE
  @Patch(':id/planifier')
  @ApiOperation({ summary: 'CHEF_SERVICE / TECHNICIEN : Planifier un RDV (VALIDEE → PLANIFIEE)' })
  planifierRdv(
    @Param('id') id: string,
    @Body() dto: PlanifierRdvDto,
    @Request() req: any,
  ) {
    const chefId = req.user?.id ?? 'med-00000000-0000-0000-0000-000000000001';
    return this.demandesService.planifierRdv(id, dto, chefId);
  }

  // RÈGLE MÉTIER (Phase 2) — à faire respecter par le RolesGuard en Phase 6
  // Rôle(s) autorisé(s) : TECHNICIEN
  // Statut requis de la demande avant action : CREEE avec urgence STAT (prise en charge immédiate)
  //   ou PLANIFIEE (examen planifié)
  @Patch(':id/realiser')
  @ApiOperation({ summary: 'TECHNICIEN : Réaliser un examen (CREEE+STAT ou PLANIFIEE → EN_COURS)' })
  realiserDemande(@Param('id') id: string, @Request() req: any) {
    const technicienId = req.user?.id ?? 'tec-00000000-0000-0000-0000-000000000002';
    return this.demandesService.realiserDemande(id, technicienId);
  }

  // RÈGLE MÉTIER (Phase 2) — à faire respecter par le RolesGuard en Phase 6
  // Rôle(s) autorisé(s) : MEDECIN_SERVICE
  // Statut requis de la demande avant action : EN_COURS
  @Patch(':id/interpreter')
  @ApiOperation({ summary: 'MEDECIN_SERVICE : Rédiger le brouillon compte rendu (EN_COURS → EN_INTERPRETATION)' })
  interpreterDemande(
    @Param('id') id: string,
    @Body() brouillon: InterpreterDemandeDto,
    @Request() req: any,
  ) {
    const medecinId = req.user?.id ?? 'int-00000000-0000-0000-0000-000000000004';
    return this.demandesService.interpreterDemande(id, brouillon, medecinId);
  }

  // RÈGLE MÉTIER (Phase 2) — à faire respecter par le RolesGuard en Phase 6
  // Rôle(s) autorisé(s) : CHEF_SERVICE
  // Statut requis de la demande avant action : EN_INTERPRETATION
  @Patch(':id/valider-cr')
  @ApiOperation({ summary: 'CHEF_SERVICE : Valider le compte rendu final (EN_INTERPRETATION → RESULTAT_DISPONIBLE)' })
  validerCR(@Param('id') id: string, @Request() req: any) {
    const chefId = req.user?.id ?? 'med-00000000-0000-0000-0000-000000000001';
    return this.demandesService.validerCR(id, chefId);
  }

  // RÈGLE MÉTIER (Phase 2) — à faire respecter par le RolesGuard en Phase 6
  // Rôle(s) autorisé(s) : MEDECIN_SERVICE (prescripteur de la demande)
  // Statut requis de la demande avant action : RESULTAT_DISPONIBLE
  @Patch(':id/ack')
  @ApiOperation({ summary: 'MEDECIN_SERVICE : Accusé de réception du résultat (RESULTAT_DISPONIBLE → ACK_RECU)' })
  accuserReception(@Param('id') id: string, @Request() req: any) {
    const medecinId = req.user?.id ?? 'int-00000000-0000-0000-0000-000000000004';
    return this.demandesService.accuserReception(id, medecinId);
  }
}
