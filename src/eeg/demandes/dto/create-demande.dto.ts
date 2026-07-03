import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TypeEEG, NiveauUrgence } from '@prisma/client';

export class CreateDemandeDto {
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  episodeSoinsId: string;

  @IsEnum(TypeEEG)
  @IsNotEmpty()
  typeEEG: TypeEEG;

  @IsEnum(NiveauUrgence)
  @IsNotEmpty()
  urgence: NiveauUrgence;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motifPrescription: string;

  @IsUUID()
  @IsOptional()
  technicienId?: string;
}
