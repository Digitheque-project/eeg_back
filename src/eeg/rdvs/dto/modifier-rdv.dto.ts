import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * DTO pour la modification partielle d'un RDV existant.
 * Tous les champs sont optionnels (PATCH sémantique).
 *
 * Pas de champ `statut` ici volontairement : chaque transition de statut a
 * sa propre route dédiée (/realiser, /non-realise, /annuler) qui applique
 * la cascade nécessaire sur la EegDemande liée (voir rdvs.controller.ts).
 * Accepter `statut` en écriture libre ici permettait de contourner ces
 * cascades et de désynchroniser RDV et demande.
 */
export class ModifierRdvDto {
  @IsDateString()
  @IsOptional()
  dateRdv?: string;

  @IsString()
  @IsOptional()
  heureDebut?: string;

  @IsString()
  @IsOptional()
  heureFin?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  dureeMinutes?: number;

  @IsString()
  @IsOptional()
  renseignementClinique?: string;
}
