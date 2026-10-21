import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { resolveIdentity } from './common/config/external-services.config';
import { requestContext } from './common/request-context';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  void resolveIdentity();
  app.use((req: { headers: { authorization?: string } }, _res: unknown, next: () => void) =>
    requestContext.run({ authorization: req.headers.authorization }, next),
  );

  // Validation globale des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Gestion globale des erreurs
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS pour le frontend Next.js
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.enableCors({
    origin: corsOrigin,
    // PUT nécessaire depuis l'ajout de PUT /eeg/config/personnel-service ;
    // OPTIONS pour le preflight des requêtes avec Authorization.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('SIH CHUA — Module EEG')
    .setDescription(
      'API du module Électroencéphalographie — CHU Andrainjato Fianarantsoa',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Demandes', 'Gestion des demandes EEG')
    .addTag('Résultats', 'Upload, validation et rectification des résultats')
    .addTag('Rapports', 'Rapports et statistiques')
    .addTag('Audit', 'Journal des actions')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('eeg/api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(process.env.PORT || 3001);
  console.log(`🏥 SIH CHUA — Module EEG démarré sur http://localhost:${port}`);
  console.log(
    `📋 Swagger disponible sur http://localhost:${port}/eeg/api/docs`,
  );
}
void bootstrap();
