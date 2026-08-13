import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

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

  // ─── Rubriques du compte rendu officiel CHUA ────────────────────────
  // Présentes sur le document papier mais absentes du back jusqu'ici :
  // le générateur PDF côté eeg_front les affichait « Néant ». Acceptées et
  // stockées ici même si TabC ne les envoie pas encore.

  /** État du patient pendant l'enregistrement : "veille" | "sommeil". */
  @IsString()
  @IsOptional()
  @IsIn(['veille', 'sommeil'], {
    message: 'etatEveil doit valoir "veille" ou "sommeil"',
  })
  etatEveil?: string;

  /** Conditions d'examen : comportement, artéfacts, étape non réalisable... */
  @IsString()
  @IsOptional()
  conditions?: string;

  @IsString()
  @IsOptional()
  noteComplementaireConclusion?: string;

  @IsString()
  @IsOptional()
  noteComplementaireConduite?: string;

  @IsBoolean()
  @IsOptional()
  estCritique?: boolean;
}
