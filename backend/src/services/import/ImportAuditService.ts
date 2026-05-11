import path from 'path';
import { Prisma } from '@prisma/client';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import { storageAdapter } from '../dal/storage';

export type ImportRunStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'PARTIAL_SUCCESS'
  | 'ABANDONED';

export type ImportChannel =
  | 'generic_upload'
  | 'custom_posting_bank_statement'
  | 'parse_document_two_pass';

export interface ImportRunMetrics {
  records_total?: number | null;
  records_success?: number | null;
  records_failed?: number | null;
}

interface CreateRunParams {
  context: AuthContext;
  targetModel: string;
  targetView?: string | null;
  importChannel: ImportChannel;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  isDryRun?: boolean;
  requestContext?: Record<string, unknown>;
  storagePath?: string;
  sourceFileBuffer?: Buffer;
}

export class ImportAuditService {
  private static instance: ImportAuditService;
  private readonly MAX_ERROR_DETAILS = 100;

  private constructor() { }

  public static getInstance(): ImportAuditService {
    if (!ImportAuditService.instance) {
      ImportAuditService.instance = new ImportAuditService();
    }
    return ImportAuditService.instance;
  }

  async createRun(params: CreateRunParams): Promise<string> {
    const orgId = params.context.user?.org_id ?? params.context.user?.metadata?.fabriq_org_id;
    const createdBy = params.context.user?.id ?? null;
    const sourceFileName = params.fileName?.trim() || 'source-file';
    const run = await (prisma as any).import_run.create({
      data: {
        org_id: orgId,
        created_by: createdBy,
        modified_by: createdBy,
        target_model: params.targetModel,
        target_view: params.targetView,
        import_channel: params.importChannel,
        source_file_name: sourceFileName,
        source_mime_type: params.mimeType,
        source_file_size_bytes: params.fileSizeBytes,
        storage_path: params.storagePath ?? null,
        status: 'RECEIVED',
        started_at: new Date(),
        is_dry_run: params.isDryRun ?? false,
        request_context: params.requestContext ?? Prisma.JsonNull,
      },
      select: { id: true },
    });
    const resolvedStoragePath =
      params.storagePath ?? (orgId ? this.buildStoragePath(orgId, run.id, sourceFileName) : null);
    if (resolvedStoragePath) {
      const fullStoragePath = await this.persistSourceFile(resolvedStoragePath, params.sourceFileBuffer);
      await (prisma as any).import_run.update({
        where: { id: run.id },
        data: { storage_path: fullStoragePath },
      });
    }
    return run.id;
  }

  async storeSourceFile(importId: string, orgId: string, originalFileName: string, buffer: Buffer): Promise<string> {
    const storagePath = this.buildStoragePath(orgId, importId, originalFileName);
    const fullStoragePath = await this.persistSourceFile(storagePath, buffer);
    await (prisma as any).import_run.update({
      where: { id: importId },
      data: { storage_path: fullStoragePath },
    });
    return fullStoragePath;
  }



  private buildStoragePath(orgId: string, importId: string, originalFileName: string): string {
    const sanitizedName = path.basename(originalFileName || 'source-file');
    return path.posix.join('imports', orgId, importId, sanitizedName);
  }

  private async persistSourceFile(storagePath: string, sourceFileBuffer?: Buffer): Promise<string> {
    if (sourceFileBuffer) {
      await storageAdapter.writeFile(sourceFileBuffer, storagePath);
    }
    return storageAdapter.resolveFullPath(storagePath);
  }

  async markProcessing(importId: string, metrics?: ImportRunMetrics): Promise<void> {
    await (prisma as any).import_run.update({
      where: { id: importId },
      data: {
        status: 'PROCESSING',
        ...this.normalizeMetrics(metrics),
      },
    });
  }

  async markSuccess(importId: string, metrics?: ImportRunMetrics): Promise<void> {
    await (prisma as any).import_run.update({
      where: { id: importId },
      data: {
        status: 'SUCCESS',
        completed_at: new Date(),
        ...this.normalizeMetrics(metrics),
      },
    });
  }

  async markFailure(importId: string, error: unknown, metrics?: ImportRunMetrics): Promise<void> {
    await (prisma as any).import_run.update({
      where: { id: importId },
      data: {
        status: 'FAILED',
        completed_at: new Date(),
        error_summary: this.toErrorSummary(error),
        ...this.normalizeMetrics(metrics),
      },
    });
  }

  async markAbandoned(importId: string, reason = 'user_discarded_in_mapper'): Promise<void> {
    await (prisma as any).import_run.update({
      where: { id: importId },
      data: {
        status: 'ABANDONED',
        completed_at: new Date(),
        discard_reason: reason,
      },
    });
  }

  async appendError(importId: string, rowError: Record<string, unknown>): Promise<void> {
    const existing = await (prisma as any).import_run.findUnique({
      where: { id: importId },
      select: { error_details: true },
    });
    const current = Array.isArray(existing?.error_details) ? existing.error_details : [];
    if (current.length >= this.MAX_ERROR_DETAILS) return;
    current.push(rowError);
    await (prisma as any).import_run.update({
      where: { id: importId },
      data: { error_details: current },
    });
  }

  private normalizeMetrics(metrics?: ImportRunMetrics): ImportRunMetrics {
    if (!metrics) return {};
    return {
      records_total: metrics.records_total ?? null,
      records_success: metrics.records_success ?? null,
      records_failed: metrics.records_failed ?? null,
    };
  }

  private toErrorSummary(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Import failed';
  }
}
