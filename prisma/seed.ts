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
  const chef = await prisma.utilisateur.upsert({
    where: { email: 'raharison@chu-andrainjato.mg' }, update: {},
    create: { id: 'med-00000000-0000-0000-0000-000000000001', nom: 'Raharison', prenom: 'Jean-Pierre', email: 'raharison@chu-andrainjato.mg', password: passwordHash, telephone: '+261 34 00 000 01', matricule: 'CHU-CHF-001', role: RoleUtilisateur.CHEF_SERVICE, ordresProfessionnel: OrdreProfessionnel.ONM, numeroOrdre: '12/1234/MG', actif: true },
  });
  const tech = await prisma.utilisateur.upsert({
    where: { email: 'rakotomalala@chu-andrainjato.mg' }, update: {},
    create: { id: 'tec-00000000-0000-0000-0000-000000000002', nom: 'Rakotomalala', prenom: 'Hery', email: 'rakotomalala@chu-andrainjato.mg', password: passwordHash, telephone: '+261 34 00 000 02', matricule: 'CHU-TEC-001', role: RoleUtilisateur.TECHNICIEN, ordresProfessionnel: OrdreProfessionnel.AUCUN, actif: true },
  });
  const major = await prisma.utilisateur.upsert({
    where: { email: 'andrianasolo@chu-andrainjato.mg' }, update: {},
    create: { id: 'maj-00000000-0000-0000-0000-000000000003', nom: 'Andrianasolo', prenom: 'Luc', email: 'andrianasolo@chu-andrainjato.mg', password: passwordHash, telephone: '+261 34 00 000 03', matricule: 'CHU-MAJ-001', role: RoleUtilisateur.MAJOR_SERVICE, ordresProfessionnel: OrdreProfessionnel.AUCUN, actif: true },
  });
  const med = await prisma.utilisateur.upsert({
    where: { email: 'randria@chu-andrainjato.mg' }, update: {},
    create: { id: 'int-00000000-0000-0000-0000-000000000004', nom: 'Randrianantenaina', prenom: 'Soa', email: 'randria@chu-andrainjato.mg', password: passwordHash, telephone: '+261 34 00 000 04', matricule: 'CHU-MED-001', role: RoleUtilisateur.CHEF_SERVICE, ordresProfessionnel: OrdreProfessionnel.ONM, numeroOrdre: '12/5678/MG', actif: true },
  });
  console.log('✅ Utilisateurs');

  // ─── 4 Demandes EEG ─────────────────────────────────────────────────
  // D1 : STAT → TECHNICIEN worklist
  const d1 = await prisma.eegDemande.upsert({
    where: { numeroEEG: 'EEG-2026-00001' }, update: {},
    create: { numeroEEG: 'EEG-2026-00001', patientId: p1Id, prescripteurId: chef.id, technicienId: tech.id, typeEEG: 'STANDARD', urgence: 'STAT', motifPrescription: 'Suspicion état de mal épileptique. Crise focale répétée depuis 2h.', statut: 'CREEE', episodeSoinsId: 'EP-2026-00001' },
  });
  // D2 : NORMALE CREEE → MEDECIN_SERVICE worklist
  const d2 = await prisma.eegDemande.upsert({
    where: { numeroEEG: 'EEG-2026-00002' }, update: {},
    create: { numeroEEG: 'EEG-2026-00002', patientId: p2Id, prescripteurId: chef.id, technicienId: tech.id, typeEEG: 'SOMMEIL', urgence: 'NORMALE', motifPrescription: 'Bilan épilepsie. Contrôle de routine.', statut: 'CREEE', episodeSoinsId: 'EP-2026-00002' },
  });
  // D3 : VALIDEE → CHEF_SERVICE worklist (à planifier)
  const d3 = await prisma.eegDemande.upsert({
    where: { numeroEEG: 'EEG-2026-00003' }, update: {},
    create: { numeroEEG: 'EEG-2026-00003', patientId: p1Id, prescripteurId: chef.id, technicienId: tech.id, typeEEG: 'STANDARD', urgence: 'URGENTE', motifPrescription: 'Contrôle post-AVC. Suspicion anomalies paroxystiques.', statut: 'VALIDEE', episodeSoinsId: 'EP-2026-00003' },
  });
  // D4 : EN_COURS → MEDECIN_SERVICE worklist (à interpréter)
  const d4 = await prisma.eegDemande.upsert({
    where: { numeroEEG: 'EEG-2026-00004' }, update: {},
    create: { numeroEEG: 'EEG-2026-00004', patientId: p2Id, prescripteurId: chef.id, technicienId: tech.id, typeEEG: 'AMBULATOIRE', urgence: 'NORMALE', motifPrescription: 'Surveillance épilepsie pharmaco-résistante.', statut: 'EN_COURS', episodeSoinsId: 'EP-2026-00004', dateRealisation: new Date() },
  });
  console.log('✅ 4 Demandes : CREEE(STAT), CREEE(NORMALE), VALIDEE, EN_COURS');

  // ─── Notifications ───────────────────────────────────────────────────
  await prisma.eegNotification.create({ data: { niveau: 'STAT', type: 'ALERTE_CRITIQUE', titre: 'STAT en attente', message: `Demande ${d1.numeroEEG} - RAKOTO Jean.`, demandeId: d1.id, patientId: p1Id, assigneeUserId: tech.id } });
  await prisma.eegNotification.create({ data: { niveau: 'NORMALE', type: 'SYSTEME', titre: 'Demande à valider', message: `Demande ${d2.numeroEEG} en attente de validation.`, demandeId: d2.id, patientId: p2Id, assigneeUserId: med.id } });
  await prisma.eegNotification.create({ data: { niveau: 'URGENTE', type: 'RAPPORT', titre: 'Demande à planifier', message: `Demande ${d3.numeroEEG} validée.`, demandeId: d3.id, patientId: p1Id, assigneeUserId: chef.id } });
  await prisma.eegNotification.create({ data: { niveau: 'NORMALE', type: 'RAPPORT', titre: 'Examen à interpréter', message: `Demande ${d4.numeroEEG} réalisée.`, demandeId: d4.id, patientId: p2Id, assigneeUserId: med.id } });
  console.log('✅ Notifications');

  console.log('🎉 Seed terminé !');
  console.log('CHEF_SERVICE | raharison@chu-andrainjato.mg | password123');
  console.log('TECHNICIEN | rakotomalala@chu-andrainjato.mg | password123');
  console.log('MAJOR_SERVICE | andrianasolo@chu-andrainjato.mg | password123');
  console.log('CHEF_SERVICE (Médecin) | randria@chu-andrainjato.mg | password123');
}

main().catch((e) => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
