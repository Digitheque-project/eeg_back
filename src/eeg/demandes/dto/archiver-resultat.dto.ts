import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * DTO pour l'archivage du compte rendu par le chef de service.
 * Interpréter = archiver en une seule action (pas de brouillon séparé).
 *
 * La plupart des champs CLINIQUE (AE actuel, âge 1ère crise, DPM, type de
 * crise(s), date dernière crise) ne sont plus saisis ici : ce sont des
 * informations déjà fournies à la prescription chez prescription_back,
 * recopiées automatiquement depuis la demande (voir
 * DemandesService.archiverResultat). Seul `autresRc` (sans équivalent côté
 * prescription) reste une saisie du chef de service, avec INTERPRETATION
 * et CONCLUSION / CONDUITE A TENIR.
 */
export class ArchiverResultatDto {
  @IsString()
  @IsOptional()
  autresRc?: string;

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
