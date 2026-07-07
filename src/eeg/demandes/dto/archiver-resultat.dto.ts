import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * DTO pour l'archivage du compte rendu par le chef de service.
 * Interpréter = archiver en une seule action (pas de brouillon séparé).
 * Champs alignés sur le formulaire papier réel du CHU Andrainjato — seule
 * cette section (CLINIQUE, INTERPRETATION, CONCLUSION, CONDUITE A TENIR)
 * est saisie manuellement, le reste du document étant rempli automatiquement.
 */
export class ArchiverResultatDto {
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

  @IsBoolean()
  @IsOptional()
  estCritique?: boolean;
}
