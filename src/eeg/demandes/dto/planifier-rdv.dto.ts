import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * DTO pour la planification d'un RDV depuis une demande — formulaire
 * simple : date + heure de début, l'heure de fin est calculée à partir
 * de dureeMinutes.
 */
export class PlanifierRdvDto {
  @IsDateString()
  @IsNotEmpty()
  dateRDV: string;

  @IsString()
  @IsNotEmpty()
  heureDebut: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  dureeMinutes?: number;

  @IsString()
  @IsOptional()
  renseignementClinique?: string;
}
