import { Test, TestingModule } from '@nestjs/testing';
import { ArchivesController } from './archives.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { UserLookupService } from '../../common/clients/user-lookup.service';

interface PrismaMock {
  eegResultat: { count: jest.Mock; findMany: jest.Mock };
  eegDemande: { count: jest.Mock; findMany: jest.Mock };
}

describe('ArchivesController', () => {
  let controller: ArchivesController;
  let prisma: PrismaMock;
  let patientLookup: Record<string, jest.Mock>;
  let userLookup: Record<string, jest.Mock>;

  const dateRealisation = new Date('2026-08-10T08:30:00.000Z');

  const resultatArchive = {
    id: 'res-001',
    demandeId: 'dem-001',
    conclusion: 'Tracé normal',
    etatEveil: 'veille',
    conditions: 'Patient calme',
    noteComplementaireConclusion: 'Contrôle à 6 mois',
    noteComplementaireConduite: 'Poursuivre le traitement',
    estImmutable: true,
    dateValidation: new Date('2026-08-10T10:00:00.000Z'),
    medecinValidateurId: 'chef-001',
    rectifications: [],
    demande: {
      numeroEEG: 'EEG-001',
      typeEEG: 'EEG',
      urgence: 'NORMALE',
      statut: 'RESULTAT_DISPONIBLE',
      dateCreation: new Date('2026-08-09T07:00:00.000Z'),
      patientId: 'PAT-001',
      prescripteurId: 'doc-001',
      dateRealisation,
      dateRDV: new Date('2026-08-10T00:00:00.000Z'),
      dateValidation: new Date('2026-08-10T10:00:00.000Z'),
      motifPrescription: 'Bilan épilepsie',
      aeActuel: 'Valproate',
      agePremiereCrise: '3 ans',
      dpm: 'Normal',
      typeCrise: 'Généralisée',
      dateDerniereCrise: '2026-07-10',
      prescripteurExterneNom: null,
      prescripteurExternePrenom: null,
      prescripteurExterne: false,
      rdv: {
        heureDebut: '08:30',
        heureFin: '09:30',
        renseignementClinique: 'Crises nocturnes',
        dateRdv: new Date('2026-08-10T00:00:00.000Z'),
      },
    },
  };

  beforeEach(async () => {
    prisma = {
      eegResultat: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([resultatArchive]),
      },
      eegDemande: { count: jest.fn(), findMany: jest.fn() },
    };
    patientLookup = {
      getPatientInfo: jest.fn().mockResolvedValue({
        nom: 'RABE',
        prenom: 'Koto',
        age: 32,
        sexe: 'M',
        adresse: 'Ambozontany Fianarantsoa',
        contact: '+261 34 12 345 67',
        idDossier: 'DOS-001',
        priseEnCharge: null,
        source: 'ACCUEIL',
      }),
      attachPatientInfoToMany: jest.fn(),
    };
    userLookup = {
      getUserInfo: jest.fn((id: string | null) =>
        Promise.resolve(
          id
            ? {
                id,
                nom: 'RAKOTO',
                prenom: 'Jean',
                role: 'CHEF_SERVICE',
                numeroOrdre: 'ONM-12345',
                specialite: 'Neurologue',
                telephone: '+261 34 00 000 00',
              }
            : null,
        ),
      ),
      attachPrescripteurInfoToMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArchivesController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: PatientLookupService, useValue: patientLookup },
        { provide: UserLookupService, useValue: userLookup },
      ],
    }).compile();

    controller = module.get<ArchivesController>(ArchivesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Le compte rendu officiel imprime le n° ONM et le rôle du signataire :
  // ils étaient absents tant que UserLookupService ne renvoyait que le nom.
  it('should expose the medecinValidateur with role and numeroOrdre', async () => {
    const { data } = await controller.getArchives();

    expect(data[0].medecinValidateur).toMatchObject({
      role: 'CHEF_SERVICE',
      numeroOrdre: 'ONM-12345',
    });
  });

  it('should include dateRealisation and rdv on the demande', async () => {
    const { data } = await controller.getArchives();

    expect(data[0].demande.dateRealisation).toEqual(dateRealisation);
    expect(data[0].demande.rdv).toMatchObject({
      heureDebut: '08:30',
      renseignementClinique: 'Crises nocturnes',
    });
    expect(data[0].demande.motifPrescription).toBe('Bilan épilepsie');
  });

  // Le mapper front lit adresse / contact / renseignementClinique à la
  // RACINE du résultat, en plus de demande.patient.*.
  it('should expose adresse, contact and renseignementClinique at the root', async () => {
    const { data } = await controller.getArchives();

    expect(data[0].adresse).toBe('Ambozontany Fianarantsoa');
    expect(data[0].contact).toBe('+261 34 12 345 67');
    expect(data[0].renseignementClinique).toBe('Crises nocturnes');
    expect(data[0].dateRealisation).toEqual(dateRealisation);
    expect(data[0].heuresExamen).toBe('08:30');
    expect(data[0].demande.adresse).toBe('Ambozontany Fianarantsoa');
    expect(data[0].demande.patient.contact).toBe('+261 34 12 345 67');
  });

  it('should keep the clinical fields of the résultat untouched', async () => {
    const { data } = await controller.getArchives();

    expect(data[0]).toMatchObject({
      conclusion: 'Tracé normal',
      etatEveil: 'veille',
      conditions: 'Patient calme',
      noteComplementaireConclusion: 'Contrôle à 6 mois',
      noteComplementaireConduite: 'Poursuivre le traitement',
    });
  });

  it('should fall back to motifPrescription when the rdv has no renseignement', async () => {
    prisma.eegResultat.findMany.mockResolvedValue([
      {
        ...resultatArchive,
        demande: {
          ...resultatArchive.demande,
          rdv: {
            heureDebut: null,
            heureFin: null,
            renseignementClinique: null,
            dateRdv: null,
          },
        },
      },
    ]);

    const { data } = await controller.getArchives();

    expect(data[0].renseignementClinique).toBe('Bilan épilepsie');
  });
});
