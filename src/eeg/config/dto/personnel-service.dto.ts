import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/**
 * Personnel du service de Neurologie affiché sur le compte rendu EEG
 * officiel CHUA. Ce ne sont que des libellés imprimés sur le document
 * (pas un annuaire d'utilisateurs : celui-ci reste user-services).
 *
 * Le front affiche « Néant » pour toute valeur vide — d'où des chaînes
 * vides autorisées plutôt qu'un 404 / des champs obligatoires.
 */
export class PersonnelServiceDto {
  @ApiProperty({ example: 'Pr RAKOTO Jean' })
  @IsString()
  @MaxLength(200)
  chefDeService: string;

  @ApiProperty({
    type: [String],
    example: ['Dr RASOA Marie', 'Dr RANDRIA Paul'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(200, { each: true })
  medecins: string[];

  @ApiProperty({ example: 'Mme RAVELO Hanta' })
  @IsString()
  @MaxLength(200)
  majorDeService: string;

  @ApiProperty({ type: [String], example: ['M. RAKOTOARISOA Tiana'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(200, { each: true })
  techniciens: string[];

  @ApiProperty({ example: '+261 20 75 000 00' })
  @IsString()
  @MaxLength(50)
  telephoneRdv: string;
}
