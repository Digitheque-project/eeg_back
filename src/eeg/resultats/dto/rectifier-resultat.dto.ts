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

  @IsString()
  @IsOptional()
  nouveauCompteRendu?: string;

  @IsString()
  @IsOptional()
  nouveauRythmesDeFond?: string;

  @IsString()
  @IsOptional()
  nouveauAnomalies?: string;

  @IsString()
  @IsOptional()
  nouvelleConclusion?: string;
}
