// Provider SMTP (Fase 7 — Email Platform). health() = handshake real
// (transporter.verify()); execute('email.send', ...) via nodemailer com
// host/port/security do config e user/pass do Cofre de Segredos.
import { BadRequestException, Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { BaseProvider } from './base.provider';
import {
  HealthResult,
  ProviderContext,
  ProviderMetadata,
} from '../../../../shared/integration/provider.interface';

interface SmtpSettings {
  host: string;
  port: number;
  security: 'starttls' | 'tls' | 'none';
  fromEmail: string;
  user: string;
  pass: string;
}

@Injectable()
export class SmtpProvider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 'smtp',
      name: 'E-mail (SMTP)',
      category: ProviderCategory.COMMUNICATION,
      description: 'Envio de e-mail via servidor SMTP próprio ou de terceiros.',
      icon: 'mail',
      secretKind: 'PASSWORD',
      capabilities: ['health', 'execute:email.send'],
      wizardSchema: {
        testable: true,
        steps: [
          {
            id: 'server',
            title: 'Servidor SMTP',
            fields: [
              { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'smtp.exemplo.com' },
              { key: 'port', label: 'Porta', type: 'number', required: true, default: 587 },
              {
                key: 'security',
                label: 'Segurança',
                type: 'select',
                required: true,
                default: 'starttls',
                options: [
                  { value: 'starttls', label: 'STARTTLS (587)' },
                  { value: 'tls', label: 'TLS/SSL (465)' },
                  { value: 'none', label: 'Sem criptografia' },
                ],
              },
              { key: 'from_email', label: 'Remetente padrão', type: 'text', required: true, placeholder: 'nao-responda@empresa.com' },
            ],
          },
          {
            id: 'credentials',
            title: 'Credenciais',
            description: 'Usuário e senha ficam no Cofre de Segredos.',
            fields: [
              { key: 'username', label: 'Usuário', type: 'text', secret: true, required: true },
              { key: 'password', label: 'Senha', type: 'password', secret: true, required: true },
            ],
          },
        ],
      },
    };
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    let settings: SmtpSettings;
    try {
      settings = await this.settings(ctx);
    } catch (e) {
      return { ok: false, detail: (e as Error).message, checks: { config: false } };
    }
    try {
      const transporter = this.transporter(settings);
      await transporter.verify();
      return {
        ok: true,
        detail: `Handshake SMTP OK em ${settings.host}:${settings.port} (${settings.security}).`,
        checks: { config: true, handshake: true },
      };
    } catch (e) {
      return {
        ok: false,
        detail: `Falha no handshake SMTP: ${(e as Error).message}`,
        checks: { config: true, handshake: false },
      };
    }
  }

  override async execute(ctx: ProviderContext, operation: string, params: unknown): Promise<unknown> {
    if (operation !== 'email.send') {
      throw new BadRequestException(`Operação "${operation}" não suportada pelo provider smtp.`);
    }
    const p = (params ?? {}) as Record<string, unknown>;
    const to = this.recipients(p['to']);
    if (!to.length) throw new BadRequestException('email.send exige "to" (e-mail ou lista de e-mails).');
    const subject = typeof p['subject'] === 'string' ? (p['subject'] as string) : '';
    const html = typeof p['html'] === 'string' ? (p['html'] as string) : undefined;
    const text = typeof p['text'] === 'string' ? (p['text'] as string) : undefined;
    if (!html && !text) throw new BadRequestException('email.send exige "html" ou "text".');

    const settings = await this.settings(ctx);
    const transporter = this.transporter(settings);
    const fromName = typeof p['from_name'] === 'string' ? (p['from_name'] as string) : undefined;
    const from = fromName ? `${fromName} <${settings.fromEmail}>` : settings.fromEmail;

    const info = await transporter.sendMail({
      from,
      to,
      cc: this.recipients(p['cc']),
      bcc: this.recipients(p['bcc']),
      subject,
      html,
      text: text ?? (html ? undefined : ''),
      replyTo: typeof p['reply_to'] === 'string' ? (p['reply_to'] as string) : undefined,
    });
    return {
      message_id: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      to,
    };
  }

  // ─── Helpers ────────────────────────────────────────

  private async settings(ctx: ProviderContext): Promise<SmtpSettings> {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const host = typeof config['host'] === 'string' ? (config['host'] as string) : '';
    if (!host) throw new BadRequestException('Conexão sem host SMTP configurado.');
    const port = Number(config['port'] ?? 587) || 587;
    const security = (typeof config['security'] === 'string' ? config['security'] : 'starttls') as
      | 'starttls'
      | 'tls'
      | 'none';
    const fromEmail = typeof config['from_email'] === 'string' ? (config['from_email'] as string) : '';
    const user = (await ctx.secrets.get('username')) ?? '';
    const pass = (await ctx.secrets.get('password')) ?? '';
    if (!user || !pass) {
      throw new BadRequestException('Credenciais SMTP ausentes no Cofre de Segredos.');
    }
    if (!fromEmail) throw new BadRequestException('Conexão SMTP sem remetente padrão (from_email).');
    return { host, port, security, fromEmail, user, pass };
  }

  private transporter(s: SmtpSettings): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.security === 'tls', // TLS implícito (465); STARTTLS usa secure=false + upgrade
      auth: { user: s.user, pass: s.pass },
      tls: s.security === 'none' ? { rejectUnauthorized: false } : undefined,
    });
  }

  private recipients(raw: unknown): string[] {
    if (typeof raw === 'string') {
      return raw
        .split(/[,;]/)
        .map((r) => r.trim())
        .filter(Boolean);
    }
    if (Array.isArray(raw)) {
      return raw.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => r.trim());
    }
    return [];
  }
}
