import { Test, TestingModule } from '@nestjs/testing';
import { PersonnelServiceService } from './personnel-service.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PersonnelServiceService', () => {
  let service: PersonnelServiceService;
  let prisma: {
    personnelServiceNeurologie: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const ligneEnBase = {
    id: 'cfg-1',
    chefDeService: 'Pr RAKOTO Jean',
    medecins: ['Dr RASOA Marie'],
    majorDeService: 'Mme RAVELO Hanta',
    techniciens: ['M. RAKOTOARISOA Tiana'],
    telephoneRdv: '+261 20 75 000 00',
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      personnelServiceNeurologie: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonnelServiceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PersonnelServiceService>(PersonnelServiceService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    // Pas de 404 tant que rien n'est configuré : le compte rendu doit
    // pouvoir se générer, le front affiche « Néant » pour les vides.
    it('should return empty values when nothing has been configured yet', async () => {
      prisma.personnelServiceNeurologie.findFirst.mockResolvedValue(null);

      await expect(service.get()).resolves.toEqual({
        chefDeService: '',
        medecins: [],
        majorDeService: '',
        techniciens: [],
        telephoneRdv: '',
      });
    });

    it('should return exactly the contract expected by the front', async () => {
      prisma.personnelServiceNeurologie.findFirst.mockResolvedValue(
        ligneEnBase,
      );

      const result = await service.get();

      // Aucune clé en trop (pas d'id ni d'updatedAt dans le contrat).
      expect(result).toEqual({
        chefDeService: 'Pr RAKOTO Jean',
        medecins: ['Dr RASOA Marie'],
        majorDeService: 'Mme RAVELO Hanta',
        techniciens: ['M. RAKOTOARISOA Tiana'],
        telephoneRdv: '+261 20 75 000 00',
      });
    });

    it('should keep the most recently updated row when several exist', async () => {
      prisma.personnelServiceNeurologie.findFirst.mockResolvedValue(
        ligneEnBase,
      );

      await service.get();

      expect(prisma.personnelServiceNeurologie.findFirst).toHaveBeenCalledWith({
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  describe('update', () => {
    const dto = {
      chefDeService: 'Pr RANDRIA Paul',
      medecins: ['Dr A', 'Dr B'],
      majorDeService: 'Mme B',
      techniciens: ['M. C'],
      telephoneRdv: '+261 34 00 000 00',
    };

    it('should create the singleton row on first configuration', async () => {
      prisma.personnelServiceNeurologie.findFirst.mockResolvedValue(null);
      prisma.personnelServiceNeurologie.create.mockResolvedValue({
        id: 'cfg-new',
        ...dto,
        updatedAt: new Date(),
      });

      const result = await service.update(dto);

      expect(prisma.personnelServiceNeurologie.create).toHaveBeenCalledWith({
        data: dto,
      });
      expect(prisma.personnelServiceNeurologie.update).not.toHaveBeenCalled();
      expect(result).toEqual(dto);
    });

    it('should update the existing row instead of creating a second one', async () => {
      prisma.personnelServiceNeurologie.findFirst.mockResolvedValue(
        ligneEnBase,
      );
      prisma.personnelServiceNeurologie.update.mockResolvedValue({
        id: 'cfg-1',
        ...dto,
        updatedAt: new Date(),
      });

      const result = await service.update(dto);

      expect(prisma.personnelServiceNeurologie.update).toHaveBeenCalledWith({
        where: { id: 'cfg-1' },
        data: dto,
      });
      expect(prisma.personnelServiceNeurologie.create).not.toHaveBeenCalled();
      expect(result).toEqual(dto);
    });

    it('should accept empty values (service not fully staffed yet)', async () => {
      const vide = {
        chefDeService: '',
        medecins: [],
        majorDeService: '',
        techniciens: [],
        telephoneRdv: '',
      };
      prisma.personnelServiceNeurologie.findFirst.mockResolvedValue(null);
      prisma.personnelServiceNeurologie.create.mockResolvedValue({
        id: 'cfg-new',
        ...vide,
        updatedAt: new Date(),
      });

      await expect(service.update(vide)).resolves.toEqual(vide);
    });
  });
});
