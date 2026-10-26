// Carrega .env ANTES de qualquer import que dependa de process.env.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('IAStudioAPI');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ ignoreTrailingSlash: true, bodyLimit: 10 * 1024 * 1024 }),
  );

  // Upload de pacotes de backup (multipart/form-data) na administração local.
  // Registrado no Fastify subjacente; limite generoso (backups grandes).
  // Se o plugin nao estiver instalado, apenas loga um aviso — o endpoint de
  // upload responde 400 informando que o multipart esta indisponivel.
  try {
    const multipart = (await import('@fastify/multipart')).default;
    // Cast: @fastify/multipart tipa contra o fastify de topo, e o Nest usa o
    // fastify embutido no @nestjs/platform-fastify (versoes diferentes). Em
    // runtime e o mesmo plugin — o cast so silencia o conflito de tipos.
    await app.register(multipart as any, {
      limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
    });
    logger.log('Plugin @fastify/multipart registrado (upload de backups).');
  } catch (e) {
    logger.warn(`@fastify/multipart indisponível — upload de backup desabilitado: ${(e as Error).message}`);
  }

  // API publica versionada desde a Fase 1 (diretriz 14): prefixo api + /v1.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS por env para o painel local em desenvolvimento.
  const isProd = process.env['NODE_ENV'] === 'production';
  const corsEnv = (process.env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const corsOrigins: Array<string | RegExp> = corsEnv.length
    ? corsEnv
    : isProd
      ? []
      : [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
  app.enableCors({
    origin: corsOrigins.length === 0 && isProd ? false : corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // OpenAPI/Swagger gerado desde a Fase 1 (diretriz 14).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('IA Studio API')
    .setDescription('API da instância dedicada IA Studio')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
  logger.log('Swagger UI disponível em /api/docs');

  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`IA Studio API rodando na porta ${port}`);
}
bootstrap();
