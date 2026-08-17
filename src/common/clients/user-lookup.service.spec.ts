import { Test, TestingModule } from '@nestjs/testing';
import { UserLookupService } from './user-lookup.service';
import { UserClientService } from './user-client.service';
import { externalServicesConfig } from '../config/external-services.config';

describe('UserLookupService', () => {
  let service: UserLookupService;
  let userClient: { getUserById: jest.Mock };

  beforeEach(async () => {
    userClient = { getUserById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserLookupService,
        { provide: UserClientService, useValue: userClient },
      ],
    }).compile();

    service = module.get<UserLookupService>(UserLookupService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserInfo', () => {
    it('should return null without calling user-services when no id is given', async () => {
      expect(await service.getUserInfo(null)).toBeNull();
      expect(await service.getUserInfo(undefined)).toBeNull();
      expect(await service.getUserInfo('')).toBeNull();
      expect(userClient.getUserById).not.toHaveBeenCalled();
    });

    it('should return null when user-services does not know the user', async () => {
      userClient.getUserById.mockResolvedValue(null);
      expect(await service.getUserInfo('unknown')).toBeNull();
    });

    // Le compte rendu officiel imprime, sous la signature, le rôle et le
    // numéro d'inscription à l'Ordre du médecin validateur : ces champs
    // étaient jetés à la résolution (le front affichait « Néant »).
    it('should expose role, numeroOrdre, specialite and telephone', async () => {
      // eegServiceId est lu depuis l'environnement : on le fixe le temps du
      // test pour vérifier que c'est bien le rôle DE CE SERVICE qui est
      // retenu (et pas la première entrée venue).
      const eegServiceIdOriginal = externalServicesConfig.eegServiceId;
      externalServicesConfig.eegServiceId = 'eeg-service-test';

      userClient.getUserById.mockResolvedValue({
        id: 'doc-1',
        name: 'RAKOTO',
        firstname: 'Jean',
        job: 'Neurologue',
        registration_number_professional_order: 'ONM-12345',
        professional_order: 'ONM',
        phone: '+261 34 00 000 00',
        serviceRoles: [
          {
            id: 'sr1',
            serviceId: 'autre-service',
            roleId: 'r1',
            roleName: 'MEDECIN',
          },
          {
            id: 'sr2',
            serviceId: 'eeg-service-test',
            roleId: 'r2',
            roleName: 'CHEF_SERVICE',
          },
        ],
      });

      try {
        const info = await service.getUserInfo('doc-1');

        expect(info).toEqual({
          id: 'doc-1',
          nom: 'RAKOTO',
          prenom: 'Jean',
          role: 'CHEF_SERVICE',
          numeroOrdre: 'ONM-12345',
          specialite: 'Neurologue',
          telephone: '+261 34 00 000 00',
        });
      } finally {
        externalServicesConfig.eegServiceId = eegServiceIdOriginal;
      }
    });

    it('should fall back to job when no serviceRoles are provided', async () => {
      userClient.getUserById.mockResolvedValue({
        id: 'doc-2',
        name: 'RASOA',
        firstname: 'Marie',
        job: 'Neurologue',
      });

      const info = await service.getUserInfo('doc-2');

      expect(info?.role).toBe('Neurologue');
      expect(info?.numeroOrdre).toBeNull();
      expect(info?.telephone).toBeNull();
    });

    it('should keep id/nom/prenom intact for existing callers', async () => {
      userClient.getUserById.mockResolvedValue({
        id: 'doc-3',
        name: 'RANDRIA',
        firstname: 'Paul',
      });

      const info = await service.getUserInfo('doc-3');

      expect(info).toMatchObject({
        id: 'doc-3',
        nom: 'RANDRIA',
        prenom: 'Paul',
      });
    });
  });

  describe('attachPrescripteurInfo', () => {
    it('should attach the enriched prescripteur to the entity', async () => {
      userClient.getUserById.mockResolvedValue({
        id: 'doc-1',
        name: 'RAKOTO',
        firstname: 'Jean',
        job: 'Neurologue',
        registration_number_professional_order: 'ONM-12345',
      });

      const result = await service.attachPrescripteurInfo({
        id: 'dem-1',
        prescripteurId: 'doc-1',
      });

      expect(result.id).toBe('dem-1');
      expect(result.prescripteur?.role).toBe('Neurologue');
      expect(result.prescripteur?.numeroOrdre).toBe('ONM-12345');
    });

    it('should attach null when the entity has no prescripteurId', async () => {
      const result = await service.attachPrescripteurInfo({
        id: 'dem-2',
        prescripteurId: null,
      });
      expect(result.prescripteur).toBeNull();
    });
  });
});
