import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { DataAccessLayer } from '../services/dal/DataAccessLayer';
import { PermissionService } from '../services/permissions/PermissionService';
import { UploadService } from '../services/upload/UploadService';
import logger from '../utils/logger';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError
} from './errors/ApiError';
import {
  handleRestControllerError,
  mapServiceMessageToApiError,
  respondWithMappedServiceFailure
} from './errors/restErrorHandling';
import prisma from '../lib/prisma';
import { AuthContext } from '../auth/types';
import { SearchQueryBuilder } from '../services/query/SearchQueryBuilder';
import { run_report } from '../lib/reports';
import { ModelService } from '../services/core/ModelService';
import { ImportAuditService } from '../services/import/ImportAuditService';
import { ExtractionProgress } from '../lib/extractors/types';

export interface AuthRequest extends Request {
  context?: any;
}

export class RestService {
  private static instance: RestService;
  private dal: DataAccessLayer;
  private modelService: ModelService;

  private constructor() {
    this.dal = DataAccessLayer.getInstance(prisma);
    this.modelService = ModelService.getInstance();
  }

  public static getInstance(): RestService {
    if (!RestService.instance) {
      RestService.instance = new RestService();
    }
    return RestService.instance;
  }

  private getAuthContext(req: AuthRequest): AuthContext {
    const user = req.context?.auth?.user;
    const permissions = req.context?.auth?.permissions;

    if (!user) {
      throw new UnauthorizedError('User not authenticated');
    }

    if (!permissions) {
      throw new ForbiddenError('No permissions found for user');
    }

    return { user, permissions };
  }

  private getPermissionForField(context: AuthContext, modelName: string, field: string): string[] {
    const permissions = PermissionService.validatePermissions(context, modelName, undefined);
    return Object.keys(permissions).filter((key: string) => key === field || key === '*').map((key: string) => permissions[key]);
  }

  private getModelNameFromPath(path: string): string {
    const modelName = path.split('/')[1];
    if (!modelName) {
      throw new ValidationError('Invalid model name in path');
    }
    return modelName;
  }

  public async getAll(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      // Build query options using SearchQueryBuilder
      const queryOptions = SearchQueryBuilder.buildQueryOptions(req.query);
      // Add default sorting by createdAt if it exists and no sort is specified
      if (!queryOptions.orderBy) {
        if (this.getPermissionForField(context, modelName, 'created_at')) {
          queryOptions.orderBy = { created_at: 'desc' };
        }
      }
      // Use ModelService for getAll (findMany)
      const result = await this.modelService.search(
        modelName,
        context,
        queryOptions,
        { viewName: finalViewName }
      );
      if (!result.success) {
        throw mapServiceMessageToApiError(result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'getAll', 'Failed to fetch records');
    }
  }

  public async getById(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const id = req.params.id;
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      const result = await this.modelService.getById(
        modelName,
        context,
        id,
        { viewName: finalViewName }
      );
      if (!result.success) {
        if (result.error === 'Record not found') {
          throw new NotFoundError(
            `No ${modelName} record was found for the id you requested. It may have been removed, or the id may be mistyped.`,
            { originalError: result.error }
          );
        }
        throw mapServiceMessageToApiError(result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'getById', 'Failed to fetch record');
    }
  }

  public async getByAuthId(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const authId = context.user.id; // Use authenticated user's ID as auth_id

      // Hardcode model name as "user" and specific select options
      const selectOptions = {
        id: true,
        email: true,
        name: true,
        external_id: true,
        org_id: true,
        manager_id: true,
        department_id: true,
        role_users: {
          select: {
            id: true,
            role_id: true,
            user_id: true,
            role: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        org: {
          select: {
            id: true,
            name: true,
            logo: true,
            customer_timezone: true,
            basecurrency_id: true,
            currency: {
              select: {
                id: true,
                code: true,
                name: true,
                symbol: true,
              }
            }
          }
        }
      };

      const result = await this.modelService.getByAuthId(
        "user",
        context,
        authId,
        { select: selectOptions }
      );

      if (!result.success) {
        if (result.error === 'Record not found') {
          throw new NotFoundError(
            'No user profile was found for your signed-in account. Your user record may be missing or deactivated.',
            { originalError: result.error, authId }
          );
        }
        throw mapServiceMessageToApiError(result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'getByAuthId', 'Failed to fetch record by auth_id');
    }
  }

  public async create(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      logger.warn('Creating new record', { modelName, user: context.user?.id });

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        return await this.modelService.create(
          modelName,
          context,
          req.body,
          { viewName: finalViewName },
          tx
        );
      });

      if (!result.success) {
        throw mapServiceMessageToApiError(result.error);
      }
      res.status(201).json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'create', 'Failed to create record');
    }
  }

  public async update(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const id = req.params.id;
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      logger.debug('Updating record via model service', { modelName, id, user: context.user?.id });
      const result = await this.modelService.update(
        modelName,
        context,
        id,
        req.body,
        { viewName: finalViewName }
      );
      if (!result.success) {
        if (result.error === 'Record not found') {
          throw new NotFoundError(
            `No ${modelName} record was found to update. Check the id, or confirm the record still exists.`,
            { originalError: result.error }
          );
        }
        throw mapServiceMessageToApiError(result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'update', 'Failed to update record');
    }
  }

  public async updateChild(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const { id, relation, childId } = req.params;
      const modelName = this.getModelNameFromPath(req.path);
      const data = req.body;
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      const result = await this.modelService.updateChild(
        modelName,
        context,
        id,
        relation,
        childId,
        data,
        { viewName: finalViewName }
      );
      if (!result.success) {
        return respondWithMappedServiceFailure(res, result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'updateChild', 'Failed to update child');
    }
  }

  public async delete(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const id = req.params.id;
      logger.info('Deleting record', { modelName, id, user: context.user?.id });
      const result = await this.modelService.delete(modelName, context, id);
      if (!result.success) {
        if (result.error === 'Record not found') {
          throw new NotFoundError(
            `No ${modelName} record was found to delete. It may have already been removed.`,
            { originalError: result.error }
          );
        }
        throw mapServiceMessageToApiError(result.error);
      }
      res.status(204).send();
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'delete', 'Failed to delete record');
    }
  }

  public async addChildrenToParent(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const { id, relation } = req.params;
      const modelName = this.getModelNameFromPath(req.path);
      const data = req.body;
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      const children = Array.isArray(data) ? data : [data];

      const result = await this.modelService.addChildrenToParent(
        modelName,
        id,
        relation,
        context,
        children,
        { viewName: finalViewName }
      );

      if (!result.success) {
        return respondWithMappedServiceFailure(res, result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'addChildrenToParent', 'Failed to add children to parent');
    }
  }

  public async deleteRelation(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const { relation, id, childId } = req.params;
      const modelName = this.getModelNameFromPath(req.path);
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      const result = await this.modelService.deleteRelation(
        context,
        modelName,
        relation,
        id,
        childId,
        { viewName: finalViewName }
      );
      if (!result.success) {
        return respondWithMappedServiceFailure(res, result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'deleteRelation', 'Failed to delete relation');
    }
  }

  public async search(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      // Build search query from request body and query params
      // Extract pagination and other top-level params from request body
      const { page, pageSize, sortOption, filters, ...otherBodyParams } = req.body;

      const searchQuery = {
        ...req.query,
        page,
        pageSize,
        sortOption,
        search: {
          filters,
          ...otherBodyParams
        }
      };
      // Use ModelService for search
      const result = await this.modelService.search(
        modelName,
        context,
        searchQuery,
        { viewName: finalViewName }
      );
      if (!result.success) {
        throw mapServiceMessageToApiError(result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'search', 'Failed to search records');
    }
  }

  public async generateReport(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id;
      const body = req.body;
      const context = this.getAuthContext(req);
      const result = await run_report(context, id, body.filters);
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'generateReport', 'Failed to generate report', {
        logExtras: { reportId: req.params.id }
      });
    }
  }

  public async uploadCSV(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = req.params.modelName;
      const viewId = req.params.viewId || (req.query.view as string);
      const parsedBody =
        typeof req.body?.payload === 'string'
          ? JSON.parse(req.body.payload)
          : req.body;

      logger.info('Uploading CSV data', { modelName, user: context.user?.id });

      // dataGraph is fetched once inside UploadService and returned in result.metaData
      const uploadService = UploadService.getInstance();
      const sourceFile =
        req.file && req.file.buffer
          ? {
            buffer: Buffer.isBuffer(req.file.buffer) ? req.file.buffer : Buffer.from(req.file.buffer),
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSizeBytes: req.file.size,
          }
          : undefined;
      const result = await uploadService.uploadCSV(modelName, context, parsedBody, viewId, sourceFile);

      if (!result.success) {
        throw mapServiceMessageToApiError(result.error);
      }

      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'uploadCSV', 'Failed to upload CSV data');
    }
  }

  public async createMany(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const viewName = req.query.view as string;
      const result = await this.modelService.createMany(
        modelName,
        context,
        req.body,
        { viewName }
      );
      if (!result.success) {
        throw mapServiceMessageToApiError(result.error);
      }
      res.status(201).json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'createMany', 'Failed to create records');
    }
  }

  public async runCustomAction(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const model = req.params.model;
      const id = req.params.id;
      const action = req.params.action;
      const data = req.body || {};
      const result = await this.modelService.runCustomAction(context, model, id, action, data);
      return res.status(200).json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'runCustomAction', 'Failed to run custom action');
    }
  }

  public async updateMany(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      // Extract update payload
      const { ids, data } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No IDs provided for update" });
      }
      if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No fields provided for update" });
      }
      const result = await this.modelService.updateMany(
        modelName,
        context,
        { ids, data },
        { viewName: finalViewName }
      );
      if (!result.success) {
        throw mapServiceMessageToApiError(result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'updateMany', 'Failed to update records');
    }
  }
  public async deleteMany(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = this.getModelNameFromPath(req.path);
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      // Extract IDs from body
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No IDs provided for delete" });
      }
      const result = await this.modelService.deleteMany(
        modelName,
        context,
        ids,
        { viewName: finalViewName }
      );
      if (!result.success) {
        throw mapServiceMessageToApiError(result.error);
      }
      res.json(result);
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'deleteMany', 'Failed to delete records');
    }
  }

  /**
   * Parse PDF document and extract data mapped to specified model schema
   * POST /api/parse-document/:modelName
   *
   * Body: FormData with 'file' field containing PDF
   * Query params:
   * - documentType (optional): Override auto-detection
   * - view (optional): View name for permissions
   *
   * Extension-specific options are extracted dynamically based on the extension's
   * getRequiredOptions() method. For example, posting_with_categorization requires
   * 'legalEntityId' which is extracted from form data.
   */
  public async parseDocument(req: AuthRequest, res: Response) {
    let importId: string | undefined;
    const wantsStream =
      req.params.modelName === 'posting_with_categorization' &&
      String(req.headers.accept || '').includes('text/event-stream');
    let streaming = false;
    const sendEvent = (data: object) => {
      if (!streaming) return;
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        (res as Response & { flush?: () => void }).flush?.();
      } catch {
        // Client disconnect must not fail the extract.
      }
    };
    try {
      const context = this.getAuthContext(req);
      const modelName = req.params.modelName;
      if (!modelName) {
        throw new ValidationError('Model name is required');
      }
      if (!req.file) {
        throw new ValidationError('PDF file is required');
      }
      const pdfBuffer = Buffer.isBuffer(req.file.buffer)
        ? req.file.buffer
        : Buffer.from(req.file.buffer);
      const auditService = ImportAuditService.getInstance();
      const orgId = context.user?.org_id ?? context.user?.metadata?.fabriq_org_id;
      importId = await auditService.createRun({
        context,
        targetModel: modelName,
        targetView: undefined,
        importChannel: 'parse_document_two_pass',
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        isDryRun: true,
        sourceFileBuffer: pdfBuffer,
      });
      if (orgId) {
        await auditService.storeSourceFile(importId, orgId, req.file.originalname, pdfBuffer);
      }
      await auditService.markProcessing(importId);

      if (wantsStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        streaming = true;
      }

      // Validation, extension option extraction, and metaData shaping are
      // handled inside ModelService.parseDocument
      const result = await this.modelService.parseDocument(
        modelName,
        context,
        pdfBuffer,
        {
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          fileName: req.file.originalname,
          documentType: req.query.documentType as string | undefined,
          ...req.body,
          ...(streaming
            ? {
                onProgress: (progress: ExtractionProgress) =>
                  sendEvent({ type: 'progress', ...progress }),
              }
            : {}),
        }
      );

      if (!result.success) {
        await auditService.markFailure(importId, result.error ?? 'Failed to parse PDF document');
        if (streaming) {
          sendEvent({ type: 'error', message: result.error ?? 'Failed to parse PDF document' });
          res.end();
          return;
        }
        throw mapServiceMessageToApiError(result.error);
      }

      logger.info('PDF parsing completed', {
        modelName,
        confidence: result.metaData?.confidence,
        processingTime: result.metaData?.processingTime,
        user: context.user?.id,
      });

      const payload = {
        ...result,
        metaData: {
          ...(result.metaData || {}),
          import_id: importId,
        },
      };
      if (streaming) {
        sendEvent({ type: 'result', ...payload });
        res.end();
        return;
      }
      res.json(payload);

    } catch (error: unknown) {
      if (importId) {
        await ImportAuditService.getInstance().markFailure(importId, error);
      }
      if (streaming) {
        const message = error instanceof Error ? error.message : 'Failed to parse PDF document';
        sendEvent({ type: 'error', message });
        try { res.end(); } catch { /* already closed */ }
        return;
      }
      handleRestControllerError(error, req, res, 'parseDocument', 'Failed to parse PDF document', {
        logExtras: {
          modelName: req.params.modelName,
          fileName: req.file?.originalname
        }
      });
    }
  }

  public async discardImportRun(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      if (!context.user) {
        throw new UnauthorizedError('User not authenticated');
      }
      const importId = req.params.importId || req.params.id;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'user_discarded_in_mapper';
      await ImportAuditService.getInstance().markAbandoned(importId, reason);
      res.json({ success: true, data: { id: importId, status: 'ABANDONED' } });
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'discardImportRun', 'Failed to discard import run');
    }
  }

  public async getDatagraph(req: AuthRequest, res: Response) {
    try {
      const modelName = req.params.model;
      const viewName = req.params.view;

      if (!modelName || !viewName) {
        throw new ValidationError('Model name and view name are required');
      }

      const view = await PermissionService.getView(viewName, modelName);

      if (!view) {
        throw new NotFoundError(`View '${viewName}' not found for model '${modelName}'`);
      }

      res.json({
        success: true,
        data: {
          model_name: view.model_name,
          view_name: view.name,
          data_graph: view.data_graph,
          description: view.description
        }
      });
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'getDatagraph', 'Failed to fetch datagraph');
    }
  }

  /**
   * Get model schema (fields and relations) for datagraph builder
   * GET /api/models/:modelName/schema
   */
  public async getModelSchemaEndpoint(req: AuthRequest, res: Response) {
    try {
      const modelName = req.params.modelName;

      if (!modelName) {
        throw new ValidationError('Model name is required');
      }

      // Validate model name to prevent path traversal or invalid names
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(modelName)) {
        throw new ValidationError('Invalid model name format');
      }

      const schema = this.modelService.getModelSchema(modelName);

      if (!schema) {
        throw new NotFoundError(`Model '${modelName}' not found in Prisma schema`);
      }

      res.json({
        success: true,
        data: schema
      });
    } catch (error: unknown) {
      handleRestControllerError(error, req, res, 'getModelSchema', 'Failed to fetch model schema');
    }
  }

}


