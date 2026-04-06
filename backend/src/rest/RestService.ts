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
import prisma from '../lib/prisma';
import { AuthContext } from '../auth/types';
import { SearchQueryBuilder } from '../services/query/SearchQueryBuilder';
import { run_report } from '../lib/reports';
import { ModelService } from '../services/core/ModelService';
import { ImportExtensionRegistry } from '../lib/import-extensions';

export interface AuthRequest extends Request {
  context?: any;
}

export class RestService {
  private static instance: RestService;
  private dal: DataAccessLayer;
  private modelService: ModelService;
  private importExtensionRegistry: ImportExtensionRegistry;

  private constructor() {
    this.dal = DataAccessLayer.getInstance(prisma);
    this.modelService = ModelService.getInstance();
    this.importExtensionRegistry = ImportExtensionRegistry.getInstance();
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
        throw new Error(result.error);
      }
      res.json(result);
    } catch (error: any) {
      logger.error('Error in getAll', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to fetch records' });
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
          throw new NotFoundError(`${modelName} not found`);
        }
        throw new Error(result.error);
      }
      res.json(result);
    } catch (error: any) {
      logger.error('Error in getById', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError) {
        return res.status(error instanceof NotFoundError ? 404 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to fetch record' });
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
            currency_master: {
              select: {
                id: true,
                name: true,
                base_currency: true,
                from_currency: true,
                effective_from: true,
                currency_value: true,
                status: true,
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
          throw new NotFoundError(`User not found with auth_id: ${authId}`);
        }
        throw new Error(result.error);
      }
      res.json(result);
    } catch (error: any) {
      logger.error('Error in getByAuthId', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError) {
        return res.status(error instanceof NotFoundError ? 404 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to fetch record by auth_id' });
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
        throw new Error(result.error);
      }
      res.status(201).json(result);
    } catch (error: any) {
      logger.error('Error in create', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError) {
        return res.status(error instanceof ValidationError ? 400 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create record' });
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

      logger.warn('Updating record via model service', { modelName, id, user: context.user?.id });
      const result = await this.modelService.update(
        modelName,
        context,
        id,
        req.body,
        { viewName: finalViewName }
      );
      if (!result.success) {
        if (result.error === 'Record not found') {
          throw new NotFoundError(`${modelName} not found`);
        }
        throw new Error(result.error);
      }
      res.json(result);
    } catch (error: any) {
      logger.error('Error in update', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError) {
        return res.status(error instanceof NotFoundError ? 404 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update record' });
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
        return res.status(400).json({ error: result.error });
      }
      res.json(result);
    } catch (error: any) {
      logger.error('Error in updateChild', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError) {
        return res.status(error instanceof ValidationError ? 400 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update child', message: error.message });
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
          throw new NotFoundError(`${modelName} not found`);
        }
        throw new Error(result.error);
      }
      res.status(204).send();
    } catch (error: any) {
      logger.error('Error in delete', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError) {
        return res.status(error instanceof NotFoundError ? 404 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to delete record' });
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
        return res.status(400).json({ error: result.error });
      }
      res.json(result);
    } catch (error: any) {
      logger.error('Error in addChildrenToParent', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError) {
        return res.status(error instanceof ValidationError ? 400 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to add children to parent', message: error.message });
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
        return res.status(400).json({ error: result.error });
      }
      res.json(result);
    } catch (error: any) {
      logger.error('Error in deleteRelation', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError) {
        return res.status(error instanceof ValidationError ? 400 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to delete relation', message: error.message });
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
        throw new Error(result.error);
      }
      res.json(result);
    } catch (error: any) {
      logger.error('Error in search', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to search records' });
    }
  }

  public async generateReport(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id;
      const body = req.body;
      const context = this.getAuthContext(req);
      const result = await run_report(context, id, body.filters);
      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error generating report', { error: error.message, reportId: req.params.id });
      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to generate report' });
    }
  };

  public async uploadCSV(req: AuthRequest, res: Response) {
    try {
      const context = this.getAuthContext(req);
      const modelName = req.params.modelName;
      const viewName = req.query.view as string;
      const viewId = req.params.viewId;

      // Use viewId from path params if viewName from query is not available
      const finalViewName = viewName || viewId;

      const view = await PermissionService.getView(finalViewName, modelName);
      const dataGraph = view?.data_graph as { select?: any; include?: any } | null;

      logger.info('Uploading CSV data', { modelName, user: context.user?.id });

      const uploadService = UploadService.getInstance();
      const result = await uploadService.uploadCSV(modelName, context, req.body, finalViewName);
      result.metaData = dataGraph;

      if (!result.success) {
        throw new Error(result.error);
      }

      res.json(result);
    } catch (error: any) {
      logger.error('Error in uploadCSV', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to upload CSV data' });
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
        throw new Error(result.error);
      }
      res.status(201).json(result);
    } catch (error: any) {
      logger.error('Error in createMany', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError) {
        return res.status(error instanceof ValidationError ? 400 : 403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create records' });
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
    } catch (error: any) {
      logger.error('Error in runCustomAction', { error: error.message });
      res.status(500).json({ error: error.message || 'Failed to run custom action' });
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
        throw new Error(result.error);
      }
      res.json(result);
    } catch (error: any) {
      logger.error("Error in updateMany", { error: error.message, path: req.path });

      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update records" });
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
        throw new Error(result.error);
      }
      res.json(result);
    } catch (error: any) {
      logger.error("Error in deleteMany", { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to delete records" });
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
    try {
      const context = this.getAuthContext(req);
      const modelName = req.params.modelName;
      const documentType = req.query.documentType as string;
      const viewName = req.query.view as string;

      // Validate model name
      if (!modelName) {
        throw new ValidationError('Model name is required');
      }

      // Check if file is uploaded
      if (!req.file) {
        throw new ValidationError('PDF file is required');
      }

      // Validate file type
      if (req.file.mimetype !== 'application/pdf') {
        throw new ValidationError('Only PDF files are supported');
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        throw new ValidationError('File size must be less than 10MB');
      }

      // Build extractor options dynamically based on extension requirements
      const extractorOptions: Record<string, any> = {
        documentType,
        fileName: req.file.originalname,
        fileSize: req.file.size
      };

      // Check if there's an extension for this document type
      const extension = this.importExtensionRegistry.getByDocumentType(modelName);
      if (extension) {
        // Extract required options from form data
        const requiredOptions = extension.getRequiredOptions();
        for (const optionKey of requiredOptions) {
          if (req.body?.[optionKey]) {
            extractorOptions[optionKey] = req.body[optionKey];
          }
        }
      }

      logger.info('Parsing PDF document', {
        modelName,
        documentType,
        extractorOptions,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        user: context.user?.id
      });

      // Convert buffer to Buffer if needed
      const pdfBuffer = Buffer.isBuffer(req.file.buffer)
        ? req.file.buffer
        : Buffer.from(req.file.buffer);

      // Parse document using ModelService
      const result = await this.modelService.parseDocument(
        modelName,
        context,
        pdfBuffer,
        { extractorOptions }
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      logger.info('PDF parsing completed successfully', {
        modelName,
        documentType,
        confidence: result.metaData?.confidence,
        processingTime: result.metaData?.processingTime,
        dataFields: Object.keys(result.data || {}),
        user: context.user?.id
      });

      res.json({
        success: true,
        data: result.data,
        metaData: {
          ...result.metaData,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          uploadedAt: new Date().toISOString()
        },
        error: undefined
      });

    } catch (error: any) {
      logger.error('Error in parseDocument', {
        error: error.message,
        modelName: req.params.modelName,
        fileName: req.file?.originalname
      });

      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      } else if (error instanceof NotFoundError) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({
        error: 'Failed to parse PDF document',
        details: error.message
      });
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
    } catch (error: any) {
      logger.error('Error in getDatagraph', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      } else if (error instanceof NotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to fetch datagraph' });
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
    } catch (error: any) {
      logger.error('Error in getModelSchema', { error: error.message, path: req.path });
      if (error instanceof UnauthorizedError) {
        return res.status(401).json({ error: error.message });
      } else if (error instanceof ForbiddenError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      } else if (error instanceof NotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to fetch model schema' });
    }
  }

}


