import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('SIH CHUA — Module EEG')
    .setDescription('API du module Électroencéphalographie — CHU Andrainjato Fianarantsoa')
    .setVersion('1.0')
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
  console.log(`📋 Swagger disponible sur http://localhost:${port}/eeg/api/docs`);
}
bootstrap();
