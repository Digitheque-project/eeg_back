import { IsOptional, IsString } from 'class-validator';

/**
 * DTO pour la réalisation d'un RDV.
 * Seul le technicienId est transmis dans le corps (optionnel —
 * il est résolu depuis le token JWT en Phase 6). Ce n'est pas forcément
 * un UUID : les comptes simulés utilisent des ids du type "tec-...".
 */
export class RealiserRdvDto {
  @IsString()
  @IsOptional()
  technicienId?: string;
}
