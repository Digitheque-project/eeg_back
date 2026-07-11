import { PrismaClient, RoleUtilisateur, OrdreProfessionnel } from '@prisma/client';

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
  // Ids alignés sur les comptes SSO réels (service auth externe) — voir
  // JwtAuthGuard / AuthController.me : la fiche locale est provisionnée à
  // la volée avec l'id de l'utilisateur SSO, ce seed ne fait que
  // pré-remplir les champs métier (ordre professionnel, matricule...).
  await prisma.utilisateur.upsert({
    where: { email: 'jean.raharison@chu-andrainjato.mg' }, update: {},
    create: { id: '83b45e70-86e9-4fc7-beda-a66c2a944ba6', nom: 'Raharison', prenom: 'Jean', email: 'jean.raharison@chu-andrainjato.mg', telephone: '0340000002', matricule: 'EEG-CHF-001', role: RoleUtilisateur.CHEF_SERVICE, ordresProfessionnel: OrdreProfessionnel.ONM, numeroOrdre: 'ONM-2018-0123', actif: true },
  });
  await prisma.utilisateur.upsert({
    where: { email: 'toky.rakotomalala@chu-andrainjato.mg' }, update: {},
    create: { id: '1abc5592-d322-4d11-9502-386038cd92cd', nom: 'Rakotomalala', prenom: 'Toky', email: 'toky.rakotomalala@chu-andrainjato.mg', telephone: '0340000001', matricule: 'EEG-TEC-001', role: RoleUtilisateur.TECHNICIEN, ordresProfessionnel: OrdreProfessionnel.AUCUN, actif: true },
  });
  await prisma.utilisateur.upsert({
    where: { email: 'miora.andrianasolo@chu-andrainjato.mg' }, update: {},
    create: { id: 'f0577ade-0a22-448f-98df-cb612739e4f5', nom: 'Andrianasolo', prenom: 'Miora', email: 'miora.andrianasolo@chu-andrainjato.mg', telephone: '0340000003', matricule: 'EEG-MAJ-001', role: RoleUtilisateur.MAJOR_SERVICE, ordresProfessionnel: OrdreProfessionnel.AUCUN, actif: true },
  });
  console.log('✅ Utilisateurs');

  // ─── Demandes EEG ────────────────────────────────────────────────────
  // Il n'y a plus de demande de démonstration : les demandes EEG ne sont
  // jamais créées localement à l'avance. Une prescription CREEE n'existe
  // que dans le service Prescription (pull en direct côté worklist) ; elle
  // n'est enregistrée ici qu'au moment où un technicien agit dessus
  // (planifier, refuser, réaliser). Voir DemandesService.resolveOrPromote.

  console.log('🎉 Seed terminé !');
  console.log('Connexion via https://auth-client-dun.vercel.app/login (compte SSO, pas de mot de passe local)');
}

main().catch((e) => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
