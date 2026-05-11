import { DataAccessLayer } from '../dal/DataAccessLayer';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import prisma from '../../lib/prisma';
import { DataAccessResult } from '../types';
import { DataTransformer } from '../../utils/DataTransformer';
import { PermissionService } from '../permissions/PermissionService';
import { ImportAuditService } from '../import/ImportAuditService';
import { ModelService } from '../core/ModelService';

interface UploadRequest {
  data: any[];
  mapping: Record<string, string>;
  parentData?: Record<string, any>;
  importMeta?: {
    import_id?: string;
    source_file_name?: string;
    source_mime_type?: string;
    source_file_size_bytes?: number;
  };
}

interface UploadSourceFile {
  buffer: Buffer;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
}

export class UploadService {
  private static instance: UploadService;
  private dal: DataAccessLayer;
  private dataTransformer: DataTransformer;
  private readonly BATCH_SIZE = 1000;
  private modelService: ModelService;
  private importFieldSupportCache = new Map<string, boolean>();

  private constructor() {
    this.dal = DataAccessLayer.getInstance(prisma);
    this.dataTransformer = DataTransformer.getInstance();
    this.modelService = ModelService.getInstance();
  }

  public static getInstance(): UploadService {
    if (!UploadService.instance) {
      UploadService.instance = new UploadService();
    }
    return UploadService.instance;
  }

  private transformRecord(
    modelName: string,
    record: Record<string, any>,
    mapping: Record<string, string>,
    parentData: Record<string, any> = {},
    metaData: Record<string, any> = {},
    fieldsets?: Record<string, any>
  ): Record<string, any> {
    const mappedRecord = Object.entries(record).reduce<Record<string, any>>((acc, [key, value]) => {
      if (mapping[key]) {
        acc[mapping[key]] = value;
      }
      return acc;
    }, {});

    // parentData should provide defaults; per-row mapped values must win.
    const mergedData = { ...parentData, ...mappedRecord, ...metaData };
    return this.dataTransformer.transformRecord(modelName, mergedData, fieldsets);
  }

  public async uploadCSV(
    modelName: string,
    context: AuthContext,
    request: UploadRequest,
    viewName?: string,
    sourceFile?: UploadSourceFile
  ): Promise<DataAccessResult<{ count: number }>> {
    try {
      const { data, mapping, parentData = {}, importMeta } = request;
      const topLevelImportId =
        typeof (request as any)?.import_id === 'string' ? (request as any).import_id : undefined;
      if (!data || !mapping) {
        logger.error('Missing required fields', { data: !!data, mapping: !!mapping });
        return {
          success: false,
          error: 'Missing required fields: data or mapping'
        };
      }

      // Get view metadata/fieldsets if viewName is provided
      let fieldsets: Record<string, any> | undefined;
      if (viewName) {
        const view = await PermissionService.getView(viewName, modelName);
        fieldsets = view?.data_graph as Record<string, any> | undefined;
      }

      const metaData: Record<string, any> = {
        org_id: context.user?.org_id ?? context.user?.metadata?.fabriq_org_id,
        created_by: context.user?.id,
        modified_by: context.user?.id
      };
      const auditService = ImportAuditService.getInstance();
      let importId = importMeta?.import_id ?? topLevelImportId;
      if (!importId) {
        const sourceFileBuffer = sourceFile?.buffer;
        const sourceFileName = importMeta?.source_file_name ?? sourceFile?.fileName;
        const sourceMimeType = importMeta?.source_mime_type ?? sourceFile?.mimeType;
        const sourceFileSizeBytes = importMeta?.source_file_size_bytes ?? sourceFile?.fileSizeBytes;
        if (!sourceFileBuffer && sourceFileName) {
          logger.warn('UploadService: source_file_name provided without file bytes, source file will not be persisted', {
            fileName: sourceFileName,
          });
        }
        importId = await auditService.createRun({
          context,
          targetModel: modelName,
          targetView: viewName ?? null,
          importChannel: 'generic_upload',
          fileName: sourceFileName,
          mimeType: sourceMimeType,
          fileSizeBytes: sourceFileSizeBytes,
          isDryRun: false,
          sourceFileBuffer,
        });
      }
      const modelSupportsImportId = await this.modelSupportsImportId(modelName);
      if (importId && modelSupportsImportId) {
        metaData.import_id = importId;
      }

      const transformedData = data.map(record => {
        const transformed = this.transformRecord(modelName, record, mapping, parentData, metaData, fieldsets);
        if (importId && modelSupportsImportId) {
          transformed.import_id = importId;
        }
        return transformed;
      });
      if (importId) {
        await auditService.markProcessing(importId, {
          records_total: transformedData.length,
          records_success: 0,
          records_failed: 0,
        });
      }

      const batches = [];
      for (let i = 0; i < transformedData.length; i += this.BATCH_SIZE) {
        const batch = transformedData.slice(i, i + this.BATCH_SIZE);
        batches.push(batch);
      }

      let totalCount = 0;
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const result = await this.dal.createMany(modelName, context, batch);

        if (!result.success) {
          logger.error('Batch creation failed', {
            batchIndex: i,
            error: result.error
          });
          if (importId) {
            await auditService.appendError(importId, {
              stage: 'createMany',
              batch_index: i,
              message: result.error ?? 'Upload failed',
            });
            await auditService.markFailure(importId, result.error ?? 'Upload failed', {
              records_total: transformedData.length,
              records_success: totalCount,
              records_failed: Math.max(transformedData.length - totalCount, 0),
            });
          }
          return result;
        }

        totalCount += result.data?.count || 0;
      }
      if (importId) {
        await auditService.markSuccess(importId, {
          records_total: transformedData.length,
          records_success: totalCount,
          records_failed: Math.max(transformedData.length - totalCount, 0),
        });
      }

      return {
        success: true,
        message: `Successfully created ${totalCount} records`,
        data: { count: totalCount },
        metaData: fieldsets ?? null,
      };

    } catch (error) {
      logger.error('Error in CSV upload', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      if (request.importMeta?.import_id) {
        await ImportAuditService.getInstance().appendError(request.importMeta.import_id, {
          stage: 'upload_csv_exception',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        await ImportAuditService.getInstance().markFailure(request.importMeta.import_id, error);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async modelSupportsImportId(modelName: string): Promise<boolean> {
    const key = modelName.toLowerCase();
    if (this.importFieldSupportCache.has(key)) {
      return this.importFieldSupportCache.get(key) === true;
    }
    const schema = this.modelService.getModelSchema(modelName);
    const supports = !!schema?.scalarFields.some((f) => f.name === 'import_id');
    this.importFieldSupportCache.set(key, supports);
    return supports;
  }
} 