import { PrismaClient, RoleUtilisateur, OrdreProfessionnel } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Début du seed...');
  const passwordHash = await bcrypt.hash('password123', 10);

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
  await prisma.utilisateur.upsert({
    where: { email: 'raharison@chu-andrainjato.mg' }, update: {},
    create: { id: 'med-00000000-0000-0000-0000-000000000001', nom: 'Raharison', prenom: 'Jean-Pierre', email: 'raharison@chu-andrainjato.mg', password: passwordHash, telephone: '+261 34 00 000 01', matricule: 'CHU-CHF-001', role: RoleUtilisateur.CHEF_SERVICE, ordresProfessionnel: OrdreProfessionnel.ONM, numeroOrdre: '12/1234/MG', actif: true },
  });
  await prisma.utilisateur.upsert({
    where: { email: 'rakotomalala@chu-andrainjato.mg' }, update: {},
    create: { id: 'tec-00000000-0000-0000-0000-000000000002', nom: 'Rakotomalala', prenom: 'Hery', email: 'rakotomalala@chu-andrainjato.mg', password: passwordHash, telephone: '+261 34 00 000 02', matricule: 'CHU-TEC-001', role: RoleUtilisateur.TECHNICIEN, ordresProfessionnel: OrdreProfessionnel.AUCUN, actif: true },
  });
  await prisma.utilisateur.upsert({
    where: { email: 'andrianasolo@chu-andrainjato.mg' }, update: {},
    create: { id: 'maj-00000000-0000-0000-0000-000000000003', nom: 'Andrianasolo', prenom: 'Luc', email: 'andrianasolo@chu-andrainjato.mg', password: passwordHash, telephone: '+261 34 00 000 03', matricule: 'CHU-MAJ-001', role: RoleUtilisateur.MAJOR_SERVICE, ordresProfessionnel: OrdreProfessionnel.AUCUN, actif: true },
  });
  await prisma.utilisateur.upsert({
    where: { email: 'randria@chu-andrainjato.mg' }, update: {},
    create: { id: 'int-00000000-0000-0000-0000-000000000004', nom: 'Randrianantenaina', prenom: 'Soa', email: 'randria@chu-andrainjato.mg', password: passwordHash, telephone: '+261 34 00 000 04', matricule: 'CHU-MED-001', role: RoleUtilisateur.CHEF_SERVICE, ordresProfessionnel: OrdreProfessionnel.ONM, numeroOrdre: '12/5678/MG', actif: true },
  });
  console.log('✅ Utilisateurs');

  // ─── Demandes EEG ────────────────────────────────────────────────────
  // Il n'y a plus de demande de démonstration : les demandes EEG ne sont
  // jamais créées localement à l'avance. Une prescription CREEE n'existe
  // que dans le service Prescription (pull en direct côté worklist) ; elle
  // n'est enregistrée ici qu'au moment où un technicien agit dessus
  // (planifier, refuser, réaliser). Voir DemandesService.resolveOrPromote.

  console.log('🎉 Seed terminé !');
  console.log('CHEF_SERVICE | raharison@chu-andrainjato.mg | password123');
  console.log('TECHNICIEN | rakotomalala@chu-andrainjato.mg | password123');
  console.log('MAJOR_SERVICE | andrianasolo@chu-andrainjato.mg | password123');
  console.log('CHEF_SERVICE | randria@chu-andrainjato.mg | password123');
}

main().catch((e) => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
