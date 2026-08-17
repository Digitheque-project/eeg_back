import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO d'entrée pour la rectification d'un résultat EEG immuable.
 * Les champs cliniques à rectifier sont tous optionnels : seuls ceux fournis
 * seront mis à jour. Le motif est obligatoire pour assurer la traçabilité.
 */
export class RectifierResultatDto {
  @IsString()
  @IsNotEmpty({ message: 'Le motif de rectification est obligatoire' })
  motif: string;

  // CLINIQUE
  @IsString()
  @IsOptional()
  aeActuel?: string;

  @IsString()
  @IsOptional()
  age1ereCrise?: string;

  @IsString()
  @IsOptional()
  dpm?: string;

  @IsString()
  @IsOptional()
  typeCrises?: string;

  @IsString()
  @IsOptional()
  autresRc?: string;

  @IsString()
  @IsOptional()
  dateDerniereCrise?: string;

  // INTERPRETATION
  @IsString()
  @IsOptional()
  activiteDeFond?: string;

  @IsString()
  @IsOptional()
  anomaliesAuRepos?: string;

  @IsString()
  @IsOptional()
  testActivationHpn?: string;

  @IsString()
  @IsOptional()
  testActivationSli?: string;

  // CONCLUSION / CONDUITE A TENIR
  @IsString()
  @IsOptional()
  conclusion?: string;

  @IsString()
  @IsOptional()
  conduiteATenir?: string;
}
