import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { PersonnelServiceController } from './personnel-service.controller';
import { PersonnelServiceService } from './personnel-service.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('PersonnelServiceController', () => {
  let controller: PersonnelServiceController;
  let personnelService: { get: jest.Mock; update: jest.Mock };

  const personnel = {
    chefDeService: 'Pr RAKOTO Jean',
    medecins: ['Dr RASOA Marie'],
    majorDeService: 'Mme RAVELO Hanta',
    techniciens: ['M. RAKOTOARISOA Tiana'],
    telephoneRdv: '+261 20 75 000 00',
  };

  beforeEach(async () => {
    personnelService = {
      get: jest.fn().mockResolvedValue(personnel),
      update: jest.fn().mockResolvedValue(personnel),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonnelServiceController],
      providers: [
        { provide: PersonnelServiceService, useValue: personnelService },
      ],
    }).compile();

    controller = module.get<PersonnelServiceController>(
      PersonnelServiceController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET should return the personnel contract', async () => {
    await expect(controller.get()).resolves.toEqual(personnel);
    expect(personnelService.get).toHaveBeenCalled();
  });

  it('PUT should delegate the upsert to the service', async () => {
    await expect(controller.update(personnel)).resolves.toEqual(personnel);
    expect(personnelService.update).toHaveBeenCalledWith(personnel);
  });

  // La lecture doit rester ouverte à tout rôle EEG authentifié (le
  // technicien génère aussi des comptes rendus), l'écriture réservée.
  it('should leave GET unrestricted and restrict PUT to CHEF_SERVICE/MAJOR_SERVICE', () => {
    // Les handlers sont lus comme de simples porteurs de métadonnées, pas
    // appelés — d'où la lecture directe via Reflect plutôt qu'un accès au
    // prototype typé (règle unbound-method).
    const handlers = PersonnelServiceController.prototype as unknown as Record<
      string,
      object
    >;
    expect(Reflect.getMetadata(ROLES_KEY, handlers.get)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, handlers.update)).toEqual([
      'CHEF_SERVICE',
      'MAJOR_SERVICE',
    ]);
  });
});
