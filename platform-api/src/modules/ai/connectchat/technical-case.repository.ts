import { Injectable } from '@nestjs/common';
import {
  AiDiagnosticExperimentStatus,
  AiTechnicalCaseStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export const ACTIVE_TECHNICAL_CASE_STATUSES: AiTechnicalCaseStatus[] = [
  AiTechnicalCaseStatus.INVESTIGATING,
  AiTechnicalCaseStatus.WAITING_CUSTOMER,
  AiTechnicalCaseStatus.WAITING_TELEMETRY,
  AiTechnicalCaseStatus.TESTING,
];

export const ACTIVE_EXPERIMENT_STATUSES: AiDiagnosticExperimentStatus[] = [
  AiDiagnosticExperimentStatus.WAITING_CUSTOMER_OFF,
  AiDiagnosticExperimentStatus.WAITING_TELEMETRY_OFF,
  AiDiagnosticExperimentStatus.WAITING_CUSTOMER_ON,
  AiDiagnosticExperimentStatus.WAITING_TELEMETRY_ON,
  AiDiagnosticExperimentStatus.WAITING_CUSTOMER_VALIDATION,
];

@Injectable()
export class TechnicalCaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveCase(conversationId: string) {
    return this.prisma.aiTechnicalCase.findFirst({
      where: { conversation_id: conversationId, status: { in: ACTIVE_TECHNICAL_CASE_STATUSES } },
      orderBy: { updated_at: 'desc' },
    });
  }

  findLatestCase(conversationId: string) {
    return this.prisma.aiTechnicalCase.findFirst({
      where: { conversation_id: conversationId },
      orderBy: { updated_at: 'desc' },
    });
  }

  createCase(data: Prisma.AiTechnicalCaseUncheckedCreateInput) {
    return this.prisma.aiTechnicalCase.create({ data });
  }

  updateCase(id: string, data: Prisma.AiTechnicalCaseUpdateInput) {
    return this.prisma.aiTechnicalCase.update({ where: { id }, data });
  }

  async cancelCase(id: string, reason: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.aiDiagnosticExperiment.updateMany({
        where: { case_id: id, status: { in: ACTIVE_EXPERIMENT_STATUSES } },
        data: {
          status: AiDiagnosticExperimentStatus.CANCELLED,
          completed_at: new Date(),
          result: reason,
        },
      }),
      this.prisma.aiTechnicalCase.update({
        where: { id },
        data: {
          status: AiTechnicalCaseStatus.CANCELLED,
          next_recommended_action: null,
          resolution_summary: reason,
        },
      }),
    ]);
  }

  upsertEvidence(data: Prisma.AiTechnicalEvidenceUncheckedCreateInput) {
    return this.prisma.aiTechnicalEvidence.upsert({
      where: {
        case_id_correlation_key: {
          case_id: data.case_id,
          correlation_key: data.correlation_key,
        },
      },
      create: data,
      update: {
        kind: data.kind,
        source: data.source,
        status: data.status,
        confidence: data.confidence,
        contract_ref: data.contract_ref,
        access_ref: data.access_ref,
        payload: data.payload ?? Prisma.JsonNull,
        error: data.error,
        source_at: data.source_at,
        observed_at: data.observed_at,
        expires_at: data.expires_at,
      },
    });
  }

  upsertHypothesis(data: Prisma.AiDiagnosticHypothesisUncheckedCreateInput) {
    return this.prisma.aiDiagnosticHypothesis.upsert({
      where: { case_id_code: { case_id: data.case_id, code: data.code } },
      create: data,
      update: {
        label: data.label,
        state: data.state,
        rationale: data.rationale,
        last_evaluated_at: new Date(),
      },
    });
  }

  findActiveExperiment(caseId: string) {
    return this.prisma.aiDiagnosticExperiment.findFirst({
      where: { case_id: caseId, status: { in: ACTIVE_EXPERIMENT_STATUSES } },
      orderBy: { created_at: 'desc' },
    });
  }

  createExperiment(data: Prisma.AiDiagnosticExperimentUncheckedCreateInput) {
    return this.prisma.aiDiagnosticExperiment.create({ data });
  }

  updateExperiment(id: string, data: Prisma.AiDiagnosticExperimentUpdateInput) {
    return this.prisma.aiDiagnosticExperiment.update({ where: { id }, data });
  }

  createAction(data: Prisma.AiTechnicalActionUncheckedCreateInput) {
    return this.prisma.aiTechnicalAction.create({ data });
  }

  findDueTelemetry(now: Date) {
    return this.prisma.aiDiagnosticExperiment.findMany({
      where: {
        status: { in: [
          AiDiagnosticExperimentStatus.WAITING_TELEMETRY_OFF,
          AiDiagnosticExperimentStatus.WAITING_TELEMETRY_ON,
        ] },
        observe_after: { lte: now },
        OR: [
          { observation_claim_until: null },
          { observation_claim_until: { lte: now } },
        ],
        technical_case: { status: AiTechnicalCaseStatus.WAITING_TELEMETRY },
      },
      include: { technical_case: true },
      orderBy: { observe_after: 'asc' },
      take: 20,
    });
  }

  findExpiredExperiments(now: Date) {
    return this.prisma.aiDiagnosticExperiment.findMany({
      where: {
        status: { in: ACTIVE_EXPERIMENT_STATUSES },
        expires_at: { lte: now },
        OR: [
          { observation_claim_until: null },
          { observation_claim_until: { lte: now } },
        ],
        technical_case: { status: { in: ACTIVE_TECHNICAL_CASE_STATUSES } },
      },
      include: { technical_case: true },
      orderBy: { expires_at: 'asc' },
      take: 20,
    });
  }

  async claimExpiry(id: string, token: string, now: Date): Promise<boolean> {
    const result = await this.prisma.aiDiagnosticExperiment.updateMany({
      where: {
        id,
        status: { in: ACTIVE_EXPERIMENT_STATUSES },
        expires_at: { lte: now },
        OR: [
          { observation_claim_until: null },
          { observation_claim_until: { lte: now } },
        ],
      },
      data: {
        observation_claim_token: token,
        observation_claim_until: new Date(now.getTime() + 60_000),
      },
    });
    return result.count === 1;
  }

  async claimTelemetry(id: string, token: string, now: Date): Promise<boolean> {
    const result = await this.prisma.aiDiagnosticExperiment.updateMany({
      where: {
        id,
        status: { in: [
          AiDiagnosticExperimentStatus.WAITING_TELEMETRY_OFF,
          AiDiagnosticExperimentStatus.WAITING_TELEMETRY_ON,
        ] },
        observe_after: { lte: now },
        OR: [
          { observation_claim_until: null },
          { observation_claim_until: { lte: now } },
        ],
        technical_case: { status: AiTechnicalCaseStatus.WAITING_TELEMETRY },
      },
      data: {
        observation_claim_token: token,
        observation_claim_until: new Date(now.getTime() + 60_000),
      },
    });
    return result.count === 1;
  }

  async updateClaimedTelemetry(
    id: string,
    token: string,
    expectedStatus: AiDiagnosticExperimentStatus,
    data: Prisma.AiDiagnosticExperimentUpdateManyMutationInput,
  ): Promise<boolean> {
    const result = await this.prisma.aiDiagnosticExperiment.updateMany({
      where: { id, status: expectedStatus, observation_claim_token: token },
      data,
    });
    return result.count === 1;
  }

  async updateCaseIfStatus(
    id: string,
    expectedStatus: AiTechnicalCaseStatus,
    data: Prisma.AiTechnicalCaseUpdateManyMutationInput,
  ): Promise<boolean> {
    const result = await this.prisma.aiTechnicalCase.updateMany({
      where: { id, status: expectedStatus },
      data,
    });
    return result.count === 1;
  }

  releaseTelemetry(id: string, token: string) {
    return this.prisma.aiDiagnosticExperiment.updateMany({
      where: { id, observation_claim_token: token },
      data: { observation_claim_token: null, observation_claim_until: null },
    });
  }
}

