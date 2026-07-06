import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TypeEEG, NiveauUrgence } from '@prisma/client';

/**
 * DTO pour la création directe d'un RDV via le module RDVs.
 * Distinct de PlanifierRdvDto (qui opère sur une demande existante).
 */
export class CreateRdvDto {
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsUUID()
  @IsNotEmpty()
  prescripteurId: string;

  @IsUUID()
  @IsOptional()
  demandeId?: string;

  @IsEnum(TypeEEG)
  @IsNotEmpty()
  typeEEG: TypeEEG;

  @IsString()
  @IsNotEmpty()
  salle: string;

  @IsEnum(NiveauUrgence)
  @IsNotEmpty()
  priorite: NiveauUrgence;

  @IsDateString()
  @IsNotEmpty()
  dateRdv: string;

  @IsString()
  @IsNotEmpty()
  heureDebut: string;

  @IsString()
  @IsNotEmpty()
  heureFin: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  dureeMinutes: number;

  @IsString()
  @IsOptional()
  renseignementClinique?: string;
}
