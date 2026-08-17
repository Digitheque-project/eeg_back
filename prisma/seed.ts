import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Début du seed...');

  // ─── Patients ────────────────────────────────────────────────────────
  // Les patients sont désormais gérés par le service Accueil ; on ne fait
  // ici que réserver des ids externes factices + leur numéro de dossier EEG local.
  const p1Id = 'SEED-PATIENT-0001';
  const p2Id = 'SEED-PATIENT-0002';
  await prisma.eegDossier.upsert({
    where: { idDossier: 'DOS-2026-00001' }, update: {},
    create: { patientId: p1Id, idDossier: 'DOS-2026-00001' },
  });
  await prisma.eegDossier.upsert({
    where: { idDossier: 'DOS-2026-00002' }, update: {},
    create: { patientId: p2Id, idDossier: 'DOS-2026-00002' },
  });
  console.log('✅ Dossiers EEG (patients gérés par Accueil)');

  // ─── Utilisateurs ────────────────────────────────────────────────────
  // Plus de table locale : identité, rôle et permissions viennent du
  // service auth externe (JwtAuthGuard décode le JWT SSO à chaque requête).
  // Rien à semer ici — les comptes réels sont créés côté auth-service /
  // user-services, avec les rôles TECHNICIEN / CHEF_SERVICE / MAJOR_SERVICE
  // déjà enregistrés pour ce service EEG (serviceId = SSO_EEG_SERVICE_ID).

  // ─── Demandes EEG ────────────────────────────────────────────────────
  // Il n'y a plus de demande de démonstration : les demandes EEG ne sont
  // jamais créées localement à l'avance. Une prescription CREEE n'existe
  // que dans le service Prescription (pull en direct côté worklist) ; elle
  // n'est enregistrée ici qu'au moment où un technicien agit dessus
  // (planifier, refuser, réaliser). Voir DemandesService.resolveOrPromote.

  console.log('🎉 Seed terminé !');
}

main().catch((e) => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
