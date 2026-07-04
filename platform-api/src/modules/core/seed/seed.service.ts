// Seed idempotente de primeira instalacao. So roda quando NAO existe nenhum
// usuario no banco. Cria:
//   1. Planos Starter / Professional / Enterprise (diretriz 39 — tudo dado)
//   2. Admin de plataforma (env PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD)
//   3. Organization "Demo" completa (workspace + ambiente + perfis + licenca
//      TRIAL + assinatura TRIALING + admin admin@demo.local/demo123)
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SeedRepository } from './seed.repository';
import { LicensingRepository } from '../../licensing/licensing.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { hashPassword } from '../../../shared/auth/password.util';

interface PlanSeed {
  name: string;
  description: string;
  trial_days: number;
  price_cents: number | null;
  limits: Record<string, number>;
  features: string[];
}

const BASE_FEATURES = ['whatsapp', 'email', 'automation', 'studio', 'ai_studio', 'api'];
const ALL_FEATURES = [
  'whatsapp', 'email', 'automation', 'studio', 'ai_studio', 'ai_rag', 'ai_mcp',
  'mcp', 'marketplace', 'api', 'white_label', 'rag', 'voice', 'analytics',
];

// Limites exemplo da diretriz 39 (Starter: 2 usuarios, 1 workspace, 1 numero
// WhatsApp, 1 conta Google, 2 agentes, 20 mil execucoes, 500 mil tokens).
const PLAN_SEEDS: PlanSeed[] = [
  {
    name: 'Starter',
    description: 'Para começar: 2 usuários, 1 workspace, 2 agentes, 20 mil execuções/mês',
    trial_days: 14,
    price_cents: null,
    limits: {
      users: 2,
      workspaces: 1,
      agents: 2,
      ai_agents: 2,
      ai_knowledge_bases: 1,
      flows: 10,
      executions_month: 20_000,
      ai_tokens_month: 500_000,
      whatsapp_numbers: 1,
      google_accounts: 1,
      email_sends_month: 5_000,
      connections: 5,
    },
    features: BASE_FEATURES,
  },
  {
    name: 'Professional',
    description: 'Para operações maiores: 10 usuários, 5 workspaces, 20 agentes',
    trial_days: 14,
    price_cents: null,
    limits: {
      users: 10,
      workspaces: 5,
      agents: 20,
      ai_agents: 20,
      ai_knowledge_bases: 10,
      flows: 100,
      executions_month: 200_000,
      ai_tokens_month: 5_000_000,
      whatsapp_numbers: 5,
      google_accounts: 5,
      email_sends_month: 50_000,
      connections: 25,
    },
    features: [...BASE_FEATURES, 'ai_rag', 'ai_mcp', 'mcp', 'marketplace', 'rag', 'analytics'],
  },
  {
    name: 'Enterprise',
    description: 'Sem limites, White Label e domínio próprio',
    trial_days: 14,
    price_cents: null,
    limits: {}, // {} = ilimitado (metrica ausente nao e checada)
    features: ALL_FEATURES,
  },
];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly repository: SeedRepository,
    private readonly licensingRepository: LicensingRepository,
    private readonly organizations: OrganizationsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      // Idempotencia: qualquer usuario existente = instalacao ja semeada.
      const userCount = await this.repository.countUsers();
      if (userCount > 0) return;

      this.logger.log('Banco vazio — executando seed de primeira instalação...');

      // 1) Planos
      for (const seed of PLAN_SEEDS) {
        const existing = await this.licensingRepository.findPlanByName(seed.name);
        if (existing) continue;
        await this.licensingRepository.createPlan({
          name: seed.name,
          description: seed.description,
          trial_days: seed.trial_days,
          price_cents: seed.price_cents,
          limits: seed.limits as Prisma.InputJsonValue,
          features: seed.features,
        });
        this.logger.log(`Plano criado: ${seed.name}`);
      }

      // 2) Admin de plataforma
      const adminEmail = process.env['PLATFORM_ADMIN_EMAIL'] ?? 'admin@iastudio.local';
      const adminPassword = process.env['PLATFORM_ADMIN_PASSWORD'] ?? 'admin123';
      await this.repository.createPlatformAdmin({
        name: 'Administrador da Plataforma',
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
      });
      this.logger.log(`Admin de plataforma criado: ${adminEmail}`);
      if (!process.env['PLATFORM_ADMIN_PASSWORD']) {
        this.logger.warn(
          'ATENÇÃO: admin de plataforma criado com a senha padrão "admin123" — troque IMEDIATAMENTE após o primeiro login.',
        );
      }

      // 3) Organization Demo completa (gate SEED_DEMO — install.sh define '0'
      //    em producao pra nao criar org de avaliacao). Default: cria.
      if (process.env['SEED_DEMO'] !== '0') {
        await this.organizations.create({
          name: 'Demo',
          slug: 'demo',
          admin_name: 'Admin Demo',
          admin_email: 'admin@demo.local',
          admin_password: 'demo123',
        });
        this.logger.log('Organização "Demo" provisionada (admin@demo.local / demo123).');
        this.logger.warn('ATENÇÃO: a organização Demo usa senha padrão — apenas para avaliação.');
      } else {
        this.logger.log('SEED_DEMO=0 — organização Demo não criada (instalação de produção).');
      }
    } catch (e) {
      // Seed nunca derruba o boot — loga e segue (instalacao pode reexecutar).
      this.logger.error(`Seed de primeira instalação falhou: ${(e as Error).message}`);
    }
  }
}
