// Exporta uma revisão JÁ produzida (PDF ou TXT), sem reexecutar a IA nem
// consultar fontes novas. Porte do Aquapark (pdf-lib, JS puro), adaptado: sem
// escopo (o nosso modelo não tem categoria) e usando document_label.
import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ContentReviewIssue, ContentReviewResult } from './content-review.helpers';

export type ContentReviewExportFormat = 'pdf' | 'txt';

export interface ContentReviewExportInput {
  agentName: string;
  status: string;
  createdAt: Date;
  finishedAt?: Date | null;
  error?: string | null;
  result?: unknown;
  sources?: unknown;
}

export interface ContentReviewExport {
  body: Buffer;
  contentType: string;
  filename: string;
}

interface ReviewSourceSnapshot {
  base_name: string;
  document_label: string;
}

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Concluída',
  FAILED: 'Não concluída',
  PENDING: 'Em análise',
};
const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Crítico',
  ATTENTION: 'Atenção',
  IMPROVEMENT: 'Melhoria',
};
const CATEGORY_LABEL: Record<string, string> = {
  CONFLICT: 'Conflito',
  REDUNDANCY: 'Redundância',
  GAP: 'Lacuna',
  PROMISE_RISK: 'Risco de promessa',
};

@Injectable()
export class ContentReviewExportService {
  async build(input: ContentReviewExportInput, format: ContentReviewExportFormat): Promise<ContentReviewExport> {
    const filenameBase = `revisao-ia-${filePart(input.agentName)}-${datePart(input.finishedAt ?? input.createdAt)}`;
    if (format === 'txt') {
      return {
        body: Buffer.from(this.text(input), 'utf8'),
        contentType: 'text/plain; charset=utf-8',
        filename: `${filenameBase}.txt`,
      };
    }
    return {
      body: await this.pdf(input),
      contentType: 'application/pdf',
      filename: `${filenameBase}.pdf`,
    };
  }

  text(input: ContentReviewExportInput): string {
    const result = asResult(input.result);
    const lines = [
      'REVISÃO POR IA DO ASSISTENTE',
      '',
      `Assistente: ${input.agentName}`,
      `Situação: ${STATUS_LABEL[input.status] ?? input.status}`,
      `Concluída em: ${formatDate(input.finishedAt ?? input.createdAt)}`,
      '',
      'FONTES ANALISADAS',
      ...sourcesFrom(input.sources).map((s) => `- ${s.base_name}: ${s.document_label}`),
      '',
    ];
    if (!result) {
      lines.push('RESULTADO', input.error || 'A revisão ainda não possui um parecer disponível.');
      return `${lines.join('\n')}\n`;
    }
    lines.push('RESUMO', result.summary, '', 'APONTAMENTOS');
    if (!result.issues.length) lines.push('Nenhum conflito ou redundância relevante foi encontrado nesta revisão.');
    result.issues.forEach((issue, index) => this.appendIssue(lines, issue, index + 1));
    if (result.strengths.length) {
      lines.push('', 'PONTOS COERENTES');
      result.strengths.forEach((s) => lines.push(`- ${s}`));
    }
    return `${lines.join('\n')}\n`;
  }

  private appendIssue(lines: string[], issue: ContentReviewIssue, index: number): void {
    lines.push(
      '',
      `${index}. ${SEVERITY_LABEL[issue.severity] ?? 'Atenção'} | ${CATEGORY_LABEL[issue.category] ?? 'Ponto para conferir'}`,
      issue.title,
      issue.explanation,
      `Como corrigir: ${issue.recommendation}`,
      'Evidências:',
    );
    issue.sources.forEach((s) => lines.push(`- ${s.base_name}: ${s.document_title}\n  “${s.excerpt}”`));
  }

  private async pdf(input: ContentReviewExportInput): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Revisão por IA: ${input.agentName}`);
    pdf.setAuthor('IA Studio');
    pdf.setSubject('Parecer interno de revisão das fontes do assistente');
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [595.28, 841.89];
    const margin = 48;
    const contentWidth = pageSize[0] - margin * 2;
    let page = pdf.addPage(pageSize);
    let y = pageSize[1] - margin;

    const nextPage = () => { page = pdf.addPage(pageSize); y = pageSize[1] - margin; };
    const write = (text: string, options: { size?: number; font?: typeof font; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
      const size = options.size ?? 10;
      const chosenFont = options.font ?? font;
      const lineHeight = size * 1.42;
      const lines = wrapPdfText(pdfText(text), chosenFont, size, contentWidth);
      for (const line of lines) {
        if (y - lineHeight < margin) nextPage();
        page.drawText(line, { x: margin, y: y - size, size, font: chosenFont, color: options.color ?? rgb(0.12, 0.16, 0.23) });
        y -= lineHeight;
      }
      y -= options.gap ?? 3;
    };
    const section = (title: string) => {
      if (y - 28 < margin) nextPage();
      write(title, { size: 13, font: bold, color: rgb(0.18, 0.22, 0.33), gap: 6 });
    };

    write('REVISÃO POR IA DO ASSISTENTE', { size: 18, font: bold, color: rgb(0.19, 0.22, 0.38), gap: 10 });
    write(`Assistente: ${input.agentName}`);
    write(`Situação: ${STATUS_LABEL[input.status] ?? input.status}`);
    write(`Concluída em: ${formatDate(input.finishedAt ?? input.createdAt)}`, { gap: 10 });

    section('FONTES ANALISADAS');
    const sources = sourcesFrom(input.sources);
    if (!sources.length) write('Nenhuma fonte foi registrada para esta revisão.');
    sources.forEach((s) => write(`• ${s.base_name}: ${s.document_label}`));

    const result = asResult(input.result);
    if (!result) {
      section('RESULTADO');
      write(input.error || 'A revisão ainda não possui um parecer disponível.');
    } else {
      section('RESUMO');
      write(result.summary, { gap: 8 });
      section('APONTAMENTOS');
      if (!result.issues.length) write('Nenhum conflito ou redundância relevante foi encontrado nesta revisão.');
      result.issues.forEach((issue, index) => {
        write(`${index + 1}. ${SEVERITY_LABEL[issue.severity] ?? 'Atenção'} | ${CATEGORY_LABEL[issue.category] ?? 'Ponto para conferir'}`, { font: bold, color: rgb(0.32, 0.21, 0.09) });
        write(issue.title, { font: bold });
        write(issue.explanation);
        write(`Como corrigir: ${issue.recommendation}`);
        write('Evidências:', { font: bold, gap: 1 });
        issue.sources.forEach((s) => write(`• ${s.base_name}: ${s.document_title}. “${s.excerpt}”`, { gap: 1 }));
        y -= 5;
      });
      if (result.strengths.length) {
        section('PONTOS COERENTES');
        result.strengths.forEach((s) => write(`• ${s}`));
      }
    }

    const pages = pdf.getPages();
    pages.forEach((item, index) => item.drawText(`Revisão interna. Página ${index + 1} de ${pages.length}`, {
      x: margin, y: 24, size: 8, font, color: rgb(0.4, 0.44, 0.5),
    }));
    return Buffer.from(await pdf.save());
  }
}

function asResult(value: unknown): ContentReviewResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Partial<ContentReviewResult>;
  if (typeof data.summary !== 'string' || !Array.isArray(data.issues) || !Array.isArray(data.strengths)) return null;
  return data as ContentReviewResult;
}

function sourcesFrom(value: unknown): ReviewSourceSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const base_name = typeof source.base_name === 'string' ? source.base_name : null;
    const label = typeof source.document_label === 'string'
      ? source.document_label
      : typeof source.document_title === 'string' ? source.document_title : null;
    if (!base_name || !label) return [];
    return [{ base_name, document_label: label }];
  });
}

function wrapPdfText(text: string, font: { widthOfTextAtSize(text: string, size: number): number }, size: number, width: number): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let current = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
      lines.push(current);
      current = word;
    }
    if (current) lines.push(current);
  }
  return lines;
}

function pdfText(value: string): string {
  return value.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\xFF\n]/g, '');
}

function formatDate(value: Date): string {
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function datePart(value: Date): string {
  return new Date(value).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

function filePart(value: string): string {
  const normalized = value.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'assistente';
}
