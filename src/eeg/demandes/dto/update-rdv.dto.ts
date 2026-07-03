import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateRdvDto {
  @IsDateString()
  @IsNotEmpty()
  dateRDV: string;

  @IsString()
  @IsOptional()
  salle?: string;

  @IsString()
  @IsOptional()
  heureDebut?: string;

  @IsString()
  @IsOptional()
  heureFin?: string;

  @IsOptional()
  dureeMinutes?: number;

  @IsString()
  @IsOptional()
  renseignementClinique?: string;
}
