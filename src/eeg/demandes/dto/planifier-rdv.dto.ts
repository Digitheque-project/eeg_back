import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * DTO pour la planification d'un RDV depuis un endpoint de demande.
 * dateRDV + heureDebut + salle => créneau explicite fourni par le chef.
 * Si absents, le service cherche automatiquement le prochain créneau libre.
 */
export class PlanifierRdvDto {
  @IsDateString()
  @IsOptional()
  dateRDV?: string;

  @IsString()
  @IsOptional()
  heureDebut?: string;

  @IsString()
  @IsOptional()
  salle?: string;

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
