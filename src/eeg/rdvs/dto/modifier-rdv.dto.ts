import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { StatutRdv } from '@prisma/client';

/**
 * DTO pour la modification partielle d'un RDV existant.
 * Tous les champs sont optionnels (PATCH sémantique).
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

  @IsEnum(StatutRdv)
  @IsOptional()
  statut?: StatutRdv;

  @IsString()
  @IsOptional()
  renseignementClinique?: string;
}
