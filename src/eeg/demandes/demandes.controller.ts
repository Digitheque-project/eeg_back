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
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { DemandesService } from './demandes.service';

@ApiTags('Demandes')
@Controller('eeg/demandes')
export class DemandesController {
  constructor(private readonly demandesService: DemandesService) {}

  @Post()
  @ApiOperation({ summary: "Créer une nouvelle demande EEG" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        patientId: { type: "string", example: "4b0f2a29-af9b-4e93-9db6-78c27d19c30c" },
        episodeSoinsId: { type: "string", example: "EPI-001" },
        typeEEG: { type: "string", enum: ["STANDARD", "SOMMEIL", "AMBULATOIRE", "VIDEO_EEG"], example: "STANDARD" },
        urgence: { type: "string", enum: ["STAT", "URGENTE", "NORMALE"], example: "URGENTE" },
        motifPrescription: { type: "string", example: "Motif de la prescription" }
      },
      required: ["patientId", "episodeSoinsId", "typeEEG", "urgence", "motifPrescription"]
    }
  })
  @ApiOperation({ summary: 'Créer une nouvelle demande EEG' })
  async creerDemande(@Body() dto: any, @Request() req: any) {
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

  @Patch(':id/valider')
  @ApiOperation({ summary: 'MEDECIN_SERVICE : Valider une demande (CREEE → VALIDEE)' })
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

  @Patch(':id/refuser')
  @ApiOperation({ summary: 'MEDECIN_SERVICE : Refuser une demande avec motif' })
  refuserDemande(
    @Param('id') id: string,
    @Body('motif') motif: string,
    @Request() req: any,
  ) {
    const medecinId = req.user?.id ?? 'int-00000000-0000-0000-0000-000000000004';
    return this.demandesService.refuserDemande(id, motif, medecinId);
  }

  @Patch(':id/planifier')
  @ApiOperation({ summary: 'CHEF_SERVICE : Planifier un RDV (VALIDEE → PLANIFIEE)' })
  planifierRdv(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req: any,
  ) {
    const chefId = req.user?.id ?? 'med-00000000-0000-0000-0000-000000000001';
    return this.demandesService.planifierRdv(id, dto, chefId);
  }

  @Patch(':id/realiser')
  @ApiOperation({ summary: 'TECHNICIEN : Réaliser un examen' })
  realiserDemande(@Param('id') id: string, @Request() req: any) {
    const technicienId = req.user?.id ?? 'tec-00000000-0000-0000-0000-000000000002';
    return this.demandesService.realiserDemande(id, technicienId);
  }

  @Patch(':id/interpreter')
  @ApiOperation({ summary: 'MEDECIN_SERVICE : Remplir le brouillon CR' })
  interpreterDemande(
    @Param('id') id: string,
    @Body() brouillon: any,
    @Request() req: any,
  ) {
    const medecinId = req.user?.id ?? 'int-00000000-0000-0000-0000-000000000004';
    return this.demandesService.interpreterDemande(id, brouillon, medecinId);
  }

  @Patch(':id/valider-cr')
  @ApiOperation({ summary: 'CHEF_SERVICE : Valider le compte rendu final' })
  validerCR(@Param('id') id: string, @Request() req: any) {
    const chefId = req.user?.id ?? 'med-00000000-0000-0000-0000-000000000001';
    return this.demandesService.validerCR(id, chefId);
  }

  @Patch(':id/ack')
  @ApiOperation({ summary: 'Accusé de réception du résultat' })
  accuserReception(@Param('id') id: string, @Request() req: any) {
    const medecinId = req.user?.id ?? 'int-00000000-0000-0000-0000-000000000004';
    return this.demandesService.accuserReception(id, medecinId);
  }
}
