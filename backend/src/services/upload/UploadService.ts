import { DataAccessLayer } from '../dal/DataAccessLayer';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import prisma from '../../lib/prisma';
import { DataAccessResult } from '../types';
import { DataTransformer } from '../../utils/DataTransformer';
import { PermissionService } from '../permissions/PermissionService';

interface UploadRequest {
  data: any[];
  mapping: Record<string, string>;
  parentData?: Record<string, any>;
}

export class UploadService {
  private static instance: UploadService;
  private dal: DataAccessLayer;
  private dataTransformer: DataTransformer;
  private readonly BATCH_SIZE = 1000;

  private constructor() {
    this.dal = DataAccessLayer.getInstance(prisma);
    this.dataTransformer = DataTransformer.getInstance();
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

    const mergedData = { ...mappedRecord, ...parentData, ...metaData };
    return this.dataTransformer.transformRecord(modelName, mergedData, fieldsets);
  }

  public async uploadCSV(modelName: string, context: AuthContext, request: UploadRequest, viewName?: string): Promise<DataAccessResult<{ count: number }>> {
    try {
      const { data, mapping, parentData = {} } = request;

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

      const metaData = {
        org_id: context.user?.org_id ?? context.user?.metadata?.fabriq_org_id,
        created_by: context.user?.id,
        modified_by: context.user?.id
      };

      const transformedData = data.map(record =>
        this.transformRecord(modelName, record, mapping, parentData, metaData, fieldsets)
      );

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
          return result;
        }

        totalCount += result.data?.count || 0;
      }

      return {
        success: true,
        message: `Successfully created ${totalCount} records`,
        data: { count: totalCount }
      };

    } catch (error) {
      logger.error('Error in CSV upload', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
} 