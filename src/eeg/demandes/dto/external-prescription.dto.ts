import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TypeEEG, NiveauUrgence } from '@prisma/client';

export class ExternalPatientInfoDto {
  @IsString()
  @IsOptional()
  nom?: string;

  @IsString()
  @IsOptional()
  prenom?: string;

  @IsOptional()
  age?: number;

  @IsString()
  @IsOptional()
  sexe?: string;
}

export class ExternalEegPrescriptionDto {
  @IsString()
  @IsNotEmpty()
  patientId: string; // External patient ID (e.g., CHU-2026-00001)

  @IsString()
  @IsNotEmpty()
  prescripteurId: string;

  @IsEnum(NiveauUrgence)
  @IsOptional()
  urgence?: NiveauUrgence;

  @IsString()
  @IsOptional()
  alertes?: string;

  @IsString()
  @IsNotEmpty()
  renseignements: string; // motifPrescription

  @IsEnum(TypeEEG)
  @IsNotEmpty()
  typeEEG: TypeEEG;

  @IsString()
  @IsOptional()
  remarques?: string;

  @IsString()
  @IsOptional()
  chuId?: string;

  @IsString()
  @IsOptional()
  serviceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalPatientInfoDto)
  patient?: ExternalPatientInfoDto;

  @IsString()
  @IsOptional()
  episodeSoinsId?: string; // Optional for external prescriptions
}
