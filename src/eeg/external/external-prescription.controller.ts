import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ExternalPrescriptionService } from './external-prescription.service';
import { ExternalEegPrescriptionDto } from '../demandes/dto/external-prescription.dto';
import { PatientLookupService } from '../patients/patient-lookup.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('External - Prescriptions')
@Controller('eeg/external')
export class ExternalPrescriptionController {
  constructor(
    private readonly externalPrescriptionService: ExternalPrescriptionService,
    private readonly patientLookup: PatientLookupService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('prescription')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Receive external EEG prescription from Prescription API',
    description:
      'Receives a prescription from external services (e.g., Prescription module). Creates patient if not exists.',
  })
  @ApiBody({ type: ExternalEegPrescriptionDto })
  @ApiResponse({
    status: 201,
    description: 'Prescription received and processed successfully',
    schema: {
      example: {
        success: true,
        message: 'Prescription EEG reçue et traitée',
        data: {
          demandeId: 'uuid',
          numeroEEG: 'EEG-1234567890',
          patientId: 'local-uuid',
          externalPatientId: 'CHU-2026-00001',
          statut: 'CREEE',
          createdAt: '2026-06-29T10:00:00Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid prescription data or processing error',
  })
  async receiveExternalPrescription(
    @Body() dto: ExternalEegPrescriptionDto,
  ) {
    return this.externalPrescriptionService.receiveExternalPrescription(dto);
  }

  @Get('prescription/:demandeId')
  @ApiOperation({
    summary: 'Get prescription status by demand ID',
    description: 'Returns the status and details of an EEG prescription',
  })
  @ApiResponse({
    status: 200,
    description: 'Prescription status retrieved',
    schema: {
      example: {
        demandeId: 'uuid',
        numeroEEG: 'EEG-1234567890',
        statut: 'CREEE',
        patientId: 'CHU-2026-00001',
        dateCreation: '2026-06-29T10:00:00Z',
        dateRealisation: null,
        dateValidation: null,
        hasResult: false,
        resultPreliminary: null,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Prescription not found',
  })
  async getPrescriptionStatus(@Param('demandeId') demandeId: string) {
    return this.externalPrescriptionService.getPrescriptionStatus(demandeId);
  }

  @Get('prescription/status/:externalPatientId')
  @ApiOperation({
    summary: 'Get prescriptions for external patient ID',
    description: 'Returns all EEG prescriptions for an external patient ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Patient prescriptions retrieved',
  })
  async getPrescriptionsForExternalPatient(
    @Param('externalPatientId') externalPatientId: string,
  ) {
    const patient = await this.patientLookup.findPatientByIdOrExternal(
      externalPatientId,
    );

    if (!patient) {
      return {
        externalPatientId,
        prescriptions: [],
        found: false,
      };
    }

    return {
      externalPatientId,
      patientId: patient.id,
      prescriptions: await this.prisma.eegDemande.findMany({
        where: { patientId: patient.id },
        select: {
          id: true,
          numeroEEG: true,
          statut: true,
          dateCreation: true,
          urgence: true,
        },
        orderBy: { dateCreation: 'desc' },
      }),
      found: true,
    };
  }
}
