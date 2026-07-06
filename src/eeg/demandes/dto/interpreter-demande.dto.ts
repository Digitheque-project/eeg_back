import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO pour la saisie du brouillon de compte rendu (interprétation médicale).
 * Tous les champs cliniques sont optionnels pour permettre une saisie partielle,
 * mais estCritique doit être explicitement fourni si pertinent.
 */
export class InterpreterDemandeDto {
  @IsString()
  @IsOptional()
  rythmesDeFond?: string;

  @IsString()
  @IsOptional()
  anomaliesDetectees?: string;

  @IsString()
  @IsOptional()
  conclusionDiagnostique?: string;

  @IsString()
  @IsOptional()
  compteRendu?: string;

  @IsBoolean()
  @IsOptional()
  estCritique?: boolean;
}
