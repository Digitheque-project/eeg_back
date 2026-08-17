import { Injectable, Logger } from '@nestjs/common';
import { ActionAudit, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  utilisateurId: string;
  role: string;
  action: ActionAudit;
  entite: string;
  entiteId: string;
  patientId: string;
  demandeId?: string | null;
  detail?: Prisma.InputJsonValue;
}

/**
 * Écrit une ligne d'audit (EegAudit) pour les actions sensibles. Isolé
 * dans un service dédié (plutôt qu'un `prisma.eegAudit.create` dispersé
 * dans chaque contrôleur) pour qu'un seul appel — `log()` — couvre toutes
 * les actions, sans jamais faire échouer l'action métier elle-même si la
 * ligne d'audit ne peut pas être écrite.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.eegAudit.create({
        data: {
          utilisateurId: entry.utilisateurId,
          role: entry.role,
          action: entry.action,
          entite: entry.entite,
          entiteId: entry.entiteId,
          patientId: entry.patientId,
          demandeId: entry.demandeId ?? null,
          detail: entry.detail ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      // L'audit ne doit jamais bloquer l'action métier qu'il trace.
      this.logger.error(
        `Échec d'écriture de l'audit (${entry.action} sur ${entry.entite}/${entry.entiteId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
