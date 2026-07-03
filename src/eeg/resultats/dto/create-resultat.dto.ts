import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateResultatDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  dureeEnregistrement: number;

  @IsString()
  @IsNotEmpty()
  compteRendu: string;

  @IsBoolean()
  @IsOptional()
  estCritique?: boolean;
}
