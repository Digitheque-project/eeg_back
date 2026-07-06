import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * DTO pour la réalisation d'un RDV.
 * Seul le technicienId est transmis dans le corps (optionnel —
 * il est résolu depuis le token JWT en Phase 6).
 */
export class RealiserRdvDto {
  @IsUUID()
  @IsOptional()
  technicienId?: string;
}
