import { Router, Response } from 'express';
import { RestService } from './RestService';
import { authMiddleware } from '../auth/middleware';
import { ModelRegistry } from '../models/ModelRegistry';
import { workflowRouter } from '../workflow-engine';
import authRouter from '../auth/routes';
import adminRouter from './adminRouter';
import { PrismaSchemaParser } from '../utils/PrismaSchemaParser';
import logger from '../utils/logger';
import { LLMService } from '../lib/llm';
import { llmTraceLogger } from '../lib/llm-trace-logger';
import { getModelId } from '../lib/ai/modelProvider';
import multer from 'multer';
import { AttachmentController } from './AttachmentController';
import { AxiosError } from 'axios';
import { executeSourceSystemSync } from '../services/external-apis';
import { customActionRegistry } from './customActionRegistry';

export const setupRestRoutes = (router: Router) => {
  const restService = RestService.getInstance();
  const modelRegistry = ModelRegistry.getInstance();
  const llmService = LLMService.getInstance();
  const upload = multer();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // AI Analysis endpoint
  router.post('/ai', authMiddleware, async (req, res) => {
    const startTime = Date.now();
    const auth = (req as any).context?.auth;
    try {
      const financialData = req.body;

      if (!financialData) {
        return res.status(400).json({ error: "No financial data provided" });
      }

      const analysis = await llmService.analyzeFinancialData(financialData);
      const durationMs = Date.now() - startTime;

      if (auth?.user?.org_id) {
        llmTraceLogger.logTrace({
          orgId: auth.user.org_id,
          userId: auth.user.id,
          queryType: 'financial_analysis',
          question: `Financial analysis request`,
          llmModel: getModelId('analysis'),
          result: {
            text: JSON.stringify(analysis).substring(0, 500),
            steps: [],
            usage: { promptTokens: 0, completionTokens: 0 },
          },
          durationMs,
          status: 'success',
        }).catch(() => { });
      }

      res.json({ data: analysis });
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      logger.error('Error in AI analysis:', error);

      if (auth?.user?.org_id) {
        llmTraceLogger.logTrace({
          orgId: auth.user.org_id,
          userId: auth.user.id,
          queryType: 'financial_analysis',
          question: 'Financial analysis request',
          llmModel: getModelId('analysis'),
          result: { text: '', steps: [], usage: { promptTokens: 0, completionTokens: 0 } },
          durationMs,
          status: 'error',
          errorMessage: error.message,
        }).catch(() => { });
      }

      res.status(500).json({
        error: error.message || 'Failed to analyze financial data',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Custom action endpoint
  router.post('/:model/:id/action/:action', authMiddleware, restService.runCustomAction.bind(restService));

  // Get all registered models
  const models = modelRegistry.getAllEntityNames();

  // Add models endpoint
  router.get('/models', (req, res) => {
    try {
      //TODO: cache these models
      const schemaParser = new PrismaSchemaParser();
      const models = schemaParser.parseModels();
      res.json({ data: models });
    } catch (error) {
      logger.error('Error fetching models', { error });
      res.status(500).json({ error: 'Failed to fetch models' });
    }
  });

  // Get model schema for datagraph builder
  // TODO: Needs super admin permission
  router.get('/models/:modelName/schema', authMiddleware, restService.getModelSchemaEndpoint.bind(restService));

  // Add metadata routes for special endpoints
  router.get('/metadata/:model/me', authMiddleware, (req, res) => {
    const { model } = req.params;
    // Only allow /me endpoint for user model
    if (model.toLowerCase() === 'user') {
      restService.getByAuthId(req, res);
    } else {
      res.status(404).json({ error: 'Endpoint not found' });
    }
  });

  // Get datagraph endpoint
  router.get('/datagraph/:model/:view', authMiddleware, restService.getDatagraph.bind(restService));

  // Admin routes (Super Admin only; must be before generic model routes)
  router.use('/admin', authMiddleware, adminRouter);

  // Common attachment routes (reassign only; list + download are per-model below)
  router.post('/attachments/reassign', authMiddleware, AttachmentController.reassign.bind(AttachmentController));

  // Custom action dispatch — /:model/custom/:action
  // Must be registered BEFORE the model loops so Express does not treat "custom" as a
  // :viewId or :id segment and route to the wrong auto-generated handler.
  router.all('/:model/custom/:action', authMiddleware, upload.any(), async (req, res) => {
    const handler = customActionRegistry.resolve(req.params.model, req.params.action);
    if (!handler) {
      return res.status(404).json({
        error: `No custom action registered for: ${req.params.model}/${req.params.action}`,
        registered: customActionRegistry.list(),
      });
    }
    await handler(req, res);
  });

  // Setup routes for each model which has a view in the path (legacy support)
  models.forEach(model => {
    const basePath = `/${model.toLowerCase()}`;

    // GET /model - Get all records
    router.get(`${basePath}/view/:viewId`, authMiddleware, restService.getAll.bind(restService));

    // GET /model/search - Redirect to POST
    router.get(`${basePath}/view/:viewId/search`, (req, res) => {
      res.status(405).json({
        error: 'Method Not Allowed',
        message: 'Search endpoint requires POST method. Please use POST /{model}/search instead.'
      });
    });

    // POST /model/search - Search records with complex filters
    router.post(
      `${basePath}/view/:viewId/search`,
      authMiddleware,
      restService.search.bind(restService)
    );
    // PUT /model/- Update Many
    router.put(
      `${basePath}/view/:viewId`,
      authMiddleware,
      restService.updateMany.bind(restService)
    );
    // Delete /model/- Delete Many
    router.delete(
      `${basePath}/view/:viewId`,
      authMiddleware,
      restService.deleteMany.bind(restService)
    );
    // GET /model/:id - Get record by ID
    router.get(`${basePath}/:id/view/:viewId`, authMiddleware, restService.getById.bind(restService));
    router.get(`${basePath}/:id/state/:stateId`, authMiddleware, restService.getById.bind(restService));

    // POST /model - Create new record
    router.post(`${basePath}/view/:viewId`, authMiddleware, restService.create.bind(restService));
    router.post(`${basePath}/state/:stateId`, authMiddleware, restService.create.bind(restService));

    // PUT /model/:id - Update record
    router.put(`${basePath}/:id/view/:viewId`, authMiddleware, restService.update.bind(restService));
    router.put(`${basePath}/:id/state/:stateId`, authMiddleware, restService.update.bind(restService));

    // DELETE /model/:id - Delete record
    router.delete(`${basePath}/:id/view/:viewId`, authMiddleware, restService.delete.bind(restService));
    router.delete(`${basePath}/:id/state/:stateId`, authMiddleware, restService.delete.bind(restService));

    // POST /model/:id/:relation - Add children to parent
    router.post(
      `${basePath}/:id/view/:viewId/:relation`,
      authMiddleware,
      restService.addChildrenToParent.bind(restService)
    );

    // PUT /model/:id/:relation/:childId - Update a child
    router.put(
      `${basePath}/:id/view/:viewId/:relation/:childId`,
      authMiddleware,
      restService.updateChild.bind(restService)
    );

    // DELETE /model/:junctionModel/:id - Delete relation
    router.delete(
      `${basePath}/:id/view/:viewId/:relation/:childId`,
      authMiddleware,
      restService.deleteRelation.bind(restService)
    );

    // POST /model/view/:viewId/upload - Upload CSV data
    router.post(
      `${basePath}/view/:viewId/upload`,
      authMiddleware,
      upload.single('file'),
      (req, res, next) => {
        req.params.modelName = model;
        next();
      },
      restService.uploadCSV.bind(restService)
    );
  });

  // Add specific action endpoints BEFORE generic model routes to ensure precedence
  // Add endpoint to fetch expense accounts for ERP connection
  router.post(
    '/actions/source_system/:id/fetch-expense-accounts',
    authMiddleware,
    async (req: any, res: Response) => {
      try {
        const connectionId = req.params.id;

        if (!connectionId) {
          return res.status(400).json({
            success: false,
            message: 'Connection ID is required',
          });
        }

        // Use the unified connector factory
        const { createERPConnector } = await import('../lib/integrations/connectors');
        const connector = await createERPConnector(connectionId);

        // Fetch expense accounts using the connector
        const accounts = await connector.getExpenseAccounts();

        res.status(200).json({
          success: true,
          data: accounts,
        });
      } catch (error: any) {
        logger.error('Error fetching expense accounts:', error);

        // Handle specific error cases
        if (error.message?.includes('not found') || error.message?.includes('Connection not found')) {
          return res.status(404).json({
            success: false,
            message: error.message || 'Connection not found',
          });
        }

        if (error.message?.includes('inactive')) {
          return res.status(400).json({
            success: false,
            message: error.message || 'Connection is inactive',
          });
        }

        res.status(500).json({
          success: false,
          message: error.message || 'Failed to fetch expense accounts',
        });
      }
    }
  );

  // Must be registered BEFORE generic POST /:model/:id/:relation or "sync" is treated as a child relation name.
  router.post(
    '/source_system/:id/sync',
    authMiddleware,
    async (req: any, res: Response) => {
      const auth = req.context?.auth;
      if (!auth?.user?.org_id) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { id } = req.params;
      const result = await executeSourceSystemSync({
        connectionId: id,
        orgId: auth.user.org_id,
        userId: auth.user.id,
        syncModeRaw: req.body?.sync_mode,
      });
      return res.status(result.httpStatus).json(result.body);
    }
  );

  // Import run discard endpoint (must be before generic /:model/:id/:relation routes)
  router.post(
    '/import_run/:id/discard',
    authMiddleware,
    restService.discardImportRun.bind(restService)
  );

  // Setup routes for each model
  models.forEach(model => {
    const basePath = `/${model.toLowerCase()}`;

    // GET /model - Get all records
    router.get(basePath, authMiddleware, restService.getAll.bind(restService));

    // GET /model/search - Redirect to POST
    router.get(`${basePath}/search`, (req, res) => {
      res.status(405).json({
        error: 'Method Not Allowed',
        message: 'Search endpoint requires POST method. Please use POST /{model}/search instead.'
      });
    });

    // POST /model/search - Search records with complex filters
    router.post(
      `${basePath}/search`,
      authMiddleware,
      restService.search.bind(restService)
    );



    // GET /model/:id - Get record by ID
    router.get(`${basePath}/:id`, authMiddleware, restService.getById.bind(restService));

    // POST /model - Create new record
    router.post(basePath, authMiddleware, restService.create.bind(restService));

    // PUT /model/:id - Update record
    router.put(`${basePath}/:id`, authMiddleware, restService.update.bind(restService));

    // DELETE /model/:id - Delete record
    router.delete(`${basePath}/:id`, authMiddleware, restService.delete.bind(restService));

    // Attachment endpoints
    router.post(
      `${basePath}/:id/attachment`,
      authMiddleware,
      upload.single('file'),
      AttachmentController.upload
    );
    router.get(
      `${basePath}/:id/attachment`,
      authMiddleware,
      AttachmentController.list
    );
    router.delete(
      `${basePath}/:id/attachment/:attachmentId`,
      authMiddleware,
      AttachmentController.delete
    );

    // Download attachment endpoint
    router.get(
      `${basePath}/:id/attachment/:attachmentId`,
      authMiddleware,
      AttachmentController.download
    );

    // POST /model/:id/:relation - Add children to parent
    router.post(
      `${basePath}/:id/:relation`,
      authMiddleware,
      restService.addChildrenToParent.bind(restService)
    );

    // PUT /model/:id/:relation/:childId - Update a child
    router.put(
      `${basePath}/:id/:relation/:childId`,
      authMiddleware,
      restService.updateChild.bind(restService)
    );

    // DELETE /model/:id/:relation/:id - Delete relation
    router.delete(
      `${basePath}/:id/:relation/:childId`,
      authMiddleware,
      restService.deleteRelation.bind(restService)
    );


  });

  // Add report endpoint
  router.post(
    `/report/:id`,
    authMiddleware,
    restService.generateReport.bind(restService)
  );

  router.get(
    `/report/:id`,
    authMiddleware,
    restService.generateReport.bind(restService)
  );

  // Add PDF parsing routes
  router.post(
    '/parse-document/:modelName',
    authMiddleware,
    upload.single('file'),
    restService.parseDocument.bind(restService)
  );

  // Add workflow routes
  router.use('/workflow', authMiddleware, workflowRouter);

  // Add ERP connection test endpoint
  router.post(
    '/source_system/test-connection',
    authMiddleware,
    async (req: any, res: Response) => {
      try {
        const { system_type, oauth, connection_id } = req.body;

        if (!system_type || !oauth) {
          return res.status(400).json({
            success: false,
            message: 'Missing required fields: system_type and oauth credentials are required',
          });
        }

        const { testErpConnection } = await import('../lib/integrations/shared/test-connection');
        const result = await testErpConnection(system_type, oauth, connection_id);

        if (result.success) {
          res.status(200).json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        // Extract error information without circular references
        const errorInfo: any = {
          message: error.message || 'Unknown error',
        };

        if (error instanceof Error) {
          errorInfo.name = error.name;
          errorInfo.stack = error.stack;
        }

        // If it's an AxiosError, extract response info
        if (error.response) {
          errorInfo.status = error.response.status;
          errorInfo.statusText = error.response.statusText;
          errorInfo.responseData = error.response.data;
        }

        logger.error('Error testing ERP connection:', errorInfo);
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to test connection',
        });
      }
    }
  );

  // Add auth routes
  // Auth routes (login/register don't need auth middleware)
  // generate-api-key needs auth, so apply authMiddleware to that path
  router.post('/auth/generate-api-key', authMiddleware);
  router.post('/auth/change-password', authMiddleware);
  router.use('/auth', authRouter);

  return router;
}; 