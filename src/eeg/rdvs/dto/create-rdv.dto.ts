import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TypeEEG, NiveauUrgence } from '@prisma/client';

/**
 * DTO pour la création directe d'un RDV via le module RDVs.
 * Distinct de PlanifierRdvDto (qui opère sur une demande existante).
 * patientId/prescripteurId ne sont pas des UUID : le premier vient
 * d'Accueil (format CHU-YYYY-NNNNN), le second peut être un compte
 * simulé (format "tec-...", "med-...").
 */
export class CreateRdvDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  prescripteurId: string;

  @IsString()
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
