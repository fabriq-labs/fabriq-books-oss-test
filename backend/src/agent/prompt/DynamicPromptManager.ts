import * as fs from 'fs';
import * as path from 'path';
import { ModelRegistry } from '../../services/registry/ModelRegistry';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';
import { TOOL_RESPONSE_HANDLING_GUIDELINE } from './constants';
import { applyDatePlaceholders, computeDatePlaceholders } from './datePlaceholders';
import {
    formatMissingPromptTemplatesError,
    parsePromptTemplateFileSuffix,
} from './promptTemplateFileMatch';

export interface PromptTemplate {
    id: string;
    view_id: string;
    prompt_type: string;
    prompt_text: string;
    is_default: boolean;
    version: number;
    priority: number;
    context: string | null;
    created_at: Date;
    modified_at: Date | null;
}

export interface View {
    id: string;
    name: string;
    model_name: string;
    description: string | null;
    data_graph: any;
}

/**
 * Metadata about the loaded prompt templates (for observability)
 */
export interface PromptMetadata {
    templateIds: string[];
    versions: number[];
    promptTypes: string[];
    viewId: string;
    viewName: string;
    modelName: string;
}

export class DynamicPromptManager {
    private org_id: string;
    private user_id: string;
    private modelName: string;
    private viewName?: string;
    private promptTypes?: string[];
    private context: {
        recordId?: string;
        stateId?: string;
        viewId?: string;
        modelContext?: Record<string, any>;  // Model-specific context (e.g., selectedAccountId for posting)
        focusModels?: string[];  // When set, only include these models in prompt descriptions
    };
    private readonly metadataBasePath: string;
    private readonly useLocalPrompt: boolean;

    constructor(
        org_id: string,
        user_id: string,
        modelName: string,
        viewName?: string,
        promptTypes?: string[],
        context?: {
            recordId?: string;
            stateId?: string;
            viewId?: string;
            modelContext?: Record<string, any>;
            focusModels?: string[];
        }
    ) {
        this.org_id = org_id;
        this.user_id = user_id;
        this.modelName = modelName;
        this.viewName = viewName;
        this.promptTypes = promptTypes;
        this.context = context || {};
        // Resolve metadata path relative to project root
        this.metadataBasePath = path.resolve(__dirname, '../../../prisma/metadata');
        this.useLocalPrompt = process.env.USE_LOCAL_PROMPT === 'true';
    }

    /**
 * Generate a dynamic prompt by fetching templates from the database
 */
    public async generateDynamicPrompt(permissions?: Record<string, any>): Promise<string> {
        try {
            // Get prompt templates directly using view relationship
            const templates = await this.getPromptTemplates();

            if (templates.length === 0) {
                throw new Error(this.missingPromptTemplatesMessage());
            }

            // Merge templates based on priority and type
            const mergedPrompt = this.mergeTemplates(templates);

            // Add model descriptions if permissions are provided
            let finalPrompt = mergedPrompt;
            if (permissions) {
                const accessibleModels = this.getAccessibleModels(permissions);
                const modelDescriptions = this.generateModelDescriptions(accessibleModels);

                // Replace {{accessibleModels}} placeholder if it exists
                if (finalPrompt.includes('{{accessibleModels}}')) {
                    finalPrompt = finalPrompt.replace(/\{\{accessibleModels\}\}/g, modelDescriptions);
                }

                // Add model descriptions for context if not already present
                if (!finalPrompt.includes('{{accessibleModels}}') && !finalPrompt.includes('AVAILABLE MODELS')) {
                    const modelsSection = `\n\nAVAILABLE MODELS FOR CONTEXT:\n${modelDescriptions}\n`;
                    finalPrompt = finalPrompt + modelsSection;
                }
            }

            // Replace all placeholders
            return this.replacePlaceholders(finalPrompt);
        } catch (error) {
            logger.error('Error generating dynamic prompt', { error, modelName: this.modelName, viewName: this.viewName });
            throw error;
        }
    }

    private missingPromptTemplatesMessage(): string {
        return formatMissingPromptTemplatesError({
            modelName: this.modelName,
            viewName: this.viewName || `${this.modelName}_view`,
            promptTypes: this.promptTypes,
            appName: process.env.APP_NAME || null,
        });
    }

    /**
     * Generate a dynamic prompt with metadata for observability
     * Returns both the prompt and metadata about which templates were used
     */
    public async generateDynamicPromptWithMetadata(permissions?: Record<string, any>): Promise<{
        prompt: string;
        metadata: PromptMetadata;
    }> {
        try {
            // Get prompt templates directly using view relationship
            const templates = await this.getPromptTemplates();
          
            if (templates.length === 0) {
                throw new Error(this.missingPromptTemplatesMessage());
            }

            // Build metadata from templates for observability
            const metadata: PromptMetadata = {
                templateIds: templates.map(t => t.id),
                versions: templates.map(t => t.version),
                promptTypes: [...new Set(templates.map(t => t.prompt_type))],
                viewId: templates[0].view_id,
                viewName: this.viewName || `${this.modelName}_view`,
                modelName: this.modelName,
            };

            // Merge templates based on priority and type
            const mergedPrompt = this.mergeTemplates(templates);

            // Add model descriptions if permissions are provided
            let finalPrompt = mergedPrompt;
            if (permissions) {
                const accessibleModels = this.getAccessibleModels(permissions);
                const modelDescriptions = this.generateModelDescriptions(accessibleModels);

                if (finalPrompt.includes('{{accessibleModels}}')) {
                    finalPrompt = finalPrompt.replace(/\{\{accessibleModels\}\}/g, modelDescriptions);
                }

                if (!finalPrompt.includes('{{accessibleModels}}') && !finalPrompt.includes('AVAILABLE MODELS')) {
                    const modelsSection = `\n\nAVAILABLE MODELS FOR CONTEXT:\n${modelDescriptions}\n`;
                    finalPrompt = finalPrompt + modelsSection;
                }
            }

            // Replace all placeholders
            const prompt = this.replacePlaceholders(finalPrompt);

            return { prompt, metadata };
        } catch (error) {
            logger.error('Error generating dynamic prompt with metadata', { error, modelName: this.modelName, viewName: this.viewName });
            throw error;
        }
    }

    /**
     * Get prompt templates from database or JSON files based on USE_LOCAL_PROMPT
     */
    private async getPromptTemplates(): Promise<PromptTemplate[]> {
        if (this.useLocalPrompt) {
            return await this.getPromptTemplatesFromFiles();
        } else {
            return await this.getPromptTemplatesFromDatabase();
        }
    }

    /**
     * Get prompt templates from JSON files in metadata folder
     */
    private async getPromptTemplatesFromFiles(): Promise<PromptTemplate[]> {
        const viewName = this.viewName || `${this.modelName}_view`;

        // First, find the view JSON file that matches model_name and view name
        const viewsDir = path.join(this.metadataBasePath, 'views');
        if (!fs.existsSync(viewsDir)) {
            throw new Error(`Views directory not found: ${viewsDir}`);
        }

        // Find view file matching model_name and view name
        const viewFiles = fs.readdirSync(viewsDir).filter(file => file.endsWith('.json'));
        let viewId: string | null = null;

        for (const file of viewFiles) {
            const viewFilePath = path.join(viewsDir, file);
            try {
                const viewData = JSON.parse(fs.readFileSync(viewFilePath, 'utf-8'));
                if (viewData.model_name === this.modelName && viewData.name === viewName) {
                    viewId = viewData.id;
                    break;
                }
            } catch (error) {
                logger.warn(`Error reading view file ${file}`, { error });
            }
        }

        if (!viewId) {
            throw new Error(`View not found for model: ${this.modelName}, view: ${viewName}`);
        }

        // Now find prompt template files matching this view_id
        const templatesDir = path.join(this.metadataBasePath, 'prompt-templates');
        if (!fs.existsSync(templatesDir)) {
            throw new Error(`Prompt templates directory not found: ${templatesDir}`);
        }

        // Normalize view_id for filename matching (replace hyphens with underscores)
        // Remove 'view_' prefix from viewId if it exists, since we'll add it back in the file prefix
        const viewIdWithoutPrefix = viewId.startsWith('view_') ? viewId.substring(5) : viewId;
        const normalizedViewId = viewIdWithoutPrefix.replace(/-/g, '_');

        // Filter prompt type
        const requestedTypes = (this.promptTypes && this.promptTypes.length > 0)
            ? this.promptTypes
            : ['default'];

        // Filter files by view_id and prompt_type
        // Support both formats:
        // - Old: view_{view_id}_{prompt_type}.json
        // - New: view_{view_id}_{prompt_type}_{app_name}.json
        // prompt_type may contain underscores (invoice_extractor); match longest requested type.
        // App filter uses JSON app_name (exact match to APP_NAME), not the filename token.
        const filePrefix = `view_${normalizedViewId}_`;
        const envAppName = process.env.APP_NAME || null;

        const templateFiles = fs.readdirSync(templatesDir).filter((file) => {
            if (!file.endsWith('.json')) return false;
            const normalizedFile = file.replace(/-/g, '_');
            if (!normalizedFile.startsWith(filePrefix)) return false;

            const suffix = normalizedFile.replace(filePrefix, '').replace(/\.json$/, '');
            return parsePromptTemplateFileSuffix(suffix, requestedTypes) !== null;
        });

        if (templateFiles.length === 0) {
            throw new Error(this.missingPromptTemplatesMessage());
        }

        // Read all matching template files
        const templates: PromptTemplate[] = [];

        for (const file of templateFiles) {
            const jsonFilePath = path.join(templatesDir, file);
            const baseName = file.replace(/\.json$/, '');
            const txtFilePath = path.join(templatesDir, `${baseName}.txt`);

            try {
                // Read JSON metadata
                const templateData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));

                // Read prompt text from corresponding .txt file
                let promptText = '';
                if (fs.existsSync(txtFilePath)) {
                    promptText = fs.readFileSync(txtFilePath, 'utf-8');
                } else {
                    logger.warn(`Prompt text file not found: ${txtFilePath}, using empty text`);
                }

                // Filter by app_name if specified (exact match; JSON is source of truth)
                if (envAppName && templateData.app_name && templateData.app_name !== envAppName) {
                    continue;
                }

                templates.push({
                    ...templateData,
                    prompt_text: promptText,
                    created_at: new Date(),
                    modified_at: null
                });
            } catch (error) {
                logger.warn(`Error reading template file ${file}`, { error });
            }
        }

        return templates;
    }

    /**
     * Get prompt templates from database
     */
    private async getPromptTemplatesFromDatabase(): Promise<PromptTemplate[]> {
        const viewName = this.viewName || `${this.modelName}_view`;
       
        const whereClause: any = {
            view: {
                model_name: this.modelName,
                name: viewName
            }
        };
       
        // Handle prompt type filtering
        if (this.promptTypes && this.promptTypes.length > 0) {
            // If specific prompt types are requested, use IN operator to find all matching types
            whereClause.prompt_type = { in: this.promptTypes };
        } else {
            // If no specific type, get default type
            whereClause.prompt_type = 'default';
        }

        return await prisma.prompt_template.findMany({
            where: {
                ...whereClause,
                // Add app name filter from environment variable
                ...(process.env.APP_NAME && {
                    app_name: process.env.APP_NAME
                })
            },
            orderBy: [
                { is_default: 'desc' }, // Default templates first
                { priority: 'asc' },    // Lower priority first (as per your example)
                { version: 'desc' }     // Latest version first
            ]

        });
    }

    /**
     * Merge multiple templates into a single prompt
     */
    private mergeTemplates(templates: PromptTemplate[]): string {
        if (templates.length === 0) {
            throw new Error('No prompt templates found');
        }

        // If we have specific prompt types, merge all matching templates
        if (this.promptTypes && this.promptTypes.length > 0 && templates.length > 0) {
            // Sort templates by priority and merge them
            const sortedTemplates = templates.sort((a, b) => {
                // Default templates first
                if (a.is_default && !b.is_default) return -1;
                if (!a.is_default && b.is_default) return 1;
                // Then by priority (higher first)
                if (a.priority !== b.priority) {
                    return b.priority - a.priority;
                }
                // Then by version (newer first)
                return b.version - a.version;
            });

            // Merge all templates
            const mergedParts: string[] = [];
            for (const template of sortedTemplates) {
                if (template.prompt_text.trim()) {
                    mergedParts.push(template.prompt_text);
                }
            }
            return mergedParts.join('\n\n');
        }

        // For default behavior, merge templates based on priority
        const sortedTemplates = templates.sort((a, b) => {
            // Default templates first
            if (a.is_default && !b.is_default) return -1;
            if (!a.is_default && b.is_default) return 1;

            // Then by priority (higher first)
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }

            // Then by version (newer first)
            return b.version - a.version;
        });

        // If we have multiple templates, merge them
        if (sortedTemplates.length > 1) {
            const mergedParts: string[] = [];

            for (const template of sortedTemplates) {
                if (template.prompt_text.trim()) {
                    mergedParts.push(template.prompt_text);
                }
            }

            return mergedParts.join('\n\n');
        }

        return sortedTemplates[0].prompt_text;
    }
    
    /**
     * Get accessible models for the user, optionally filtered by focusModels
     */
    public getAccessibleModels(permissions: Record<string, any>): any[] {
        logger.debug('Getting accessible models for dynamic prompt', { permissions });
        let models = ModelRegistry.getInstance().getAccessibleModels(permissions);

        // If focusModels is specified in context, only include those models
        const focusModels = this.context?.focusModels as string[] | undefined;
        if (focusModels && focusModels.length > 0) {
            models = models.filter((m: any) => focusModels.includes(m.name));
            logger.debug('Filtered models by focusModels', {
                focusModels,
                filteredCount: models.length,
            });
        }

        return models;
    }

    /**
     * Generate model descriptions for the prompt
     */
    private generateModelDescriptions(accessibleModels: any[]): string {
        return accessibleModels.map(m => {
            const requiredFieldsInfo = m.requiredFields.length > 0
                ? `\n      Required fields: ${m.requiredFields.join(', ')}`
                : '';

            const fieldDescriptions = m.fields
                .map((f: { name: string; type: string; isRequired: boolean }) =>
                    `${f.name} (${f.type}${f.isRequired ? ', required' : ''})`)
                .join(', ');

            return `
    - ${m.name}: ${m.description}
      Fields: ${fieldDescriptions}${requiredFieldsInfo}
      Examples: ${m.examples.join(', ')}
      Common terms: ${m.synonyms.join(', ')}`;
        }).join('\n');
    }

    /**
     * Expand {{#if context.modelContext.KEY}}...{{/if}} for any modelContext key.
     */
    private processModelContextConditionals(prompt: string): string {
        const modelContext = this.context.modelContext || {};
        let result = prompt;
        const keysInPrompt = [...result.matchAll(/\{\{#if context\.modelContext\.(\w+)\}\}/g)].map((m) => m[1]);
        const keys = [...new Set([...Object.keys(modelContext), ...keysInPrompt])];

        for (let pass = 0; pass < 5; pass++) {
            let changed = false;
            for (const key of keys) {
                const value = modelContext[key];
                const hasValue =
                    value !== null && value !== undefined && String(value).trim() !== '';
                const pattern = new RegExp(
                    `\\{\\{#if context\\.modelContext\\.${key}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`,
                    'g'
                );
                const next = hasValue
                    ? result.replace(pattern, '$1')
                    : result.replace(pattern, '');
                if (next !== result) {
                    changed = true;
                    result = next;
                }
            }
            if (!changed) break;
        }
        return result;
    }

    /**
     * Replace placeholders in the prompt text
     */
    private replacePlaceholders(prompt: string): string {
        let processedPrompt = prompt;

        // Replace basic placeholders
        const now = new Date();
        processedPrompt = applyDatePlaceholders(processedPrompt, computeDatePlaceholders(now));
        processedPrompt = processedPrompt.replace(/\{\{userId\}\}/g, this.user_id);
        processedPrompt = processedPrompt.replace(/\{\{modelName\}\}/g, this.modelName);
        const viewName = this.viewName || `${this.modelName}_views`;
        processedPrompt = processedPrompt.replace(/\{\{viewName\}\}/g, viewName);
        const promptTypeValue = this.promptTypes && this.promptTypes.length > 0
            ? this.promptTypes.join(', ')
            : 'default';
        processedPrompt = processedPrompt.replace(/\{\{promptType\}\}/g, promptTypeValue);

        // Replace org_id placeholder in SQL examples2 (both single brace {org_id} and double brace {{orgId}})
        processedPrompt = processedPrompt.replace(/\{org_id\}/g, this.org_id);
        processedPrompt = processedPrompt.replace(/\{\{orgId\}\}/g, this.org_id);

        // Replace context placeholders
        if (this.context.recordId) {
            processedPrompt = processedPrompt.replace(/\{\{context\.recordId\}\}/g, this.context.recordId);
        }
        if (this.context.stateId) {
            processedPrompt = processedPrompt.replace(/\{\{context\.stateId\}\}/g, this.context.stateId);
        }
        if (this.context.viewId) {
            processedPrompt = processedPrompt.replace(/\{\{context\.viewId\}\}/g, this.context.viewId);
        }

        // Replace modelContext placeholders (e.g., {{context.modelContext.selectedAccountId}})
        if (this.context.modelContext) {
            for (const [key, value] of Object.entries(this.context.modelContext)) {
                if (value !== null && value !== undefined) {
                    const placeholder = new RegExp(`\\{\\{context\\.modelContext\\.${key}\\}\\}`, 'g');
                    processedPrompt = processedPrompt.replace(placeholder, String(value));
                }
            }
        }

        processedPrompt = this.processModelContextConditionals(processedPrompt);

        // Handle conditional blocks for recordId
        if (this.context.recordId) {
            // Remove {{#if context.recordId}} and {{else}} blocks, keep content between {{#if}} and {{else}}
            processedPrompt = processedPrompt.replace(/\{\{#if context\.recordId\}\}(.*?)\{\{else\}\}.*?\{\{\/if\}\}/gs, '$1');
        } else {
            // Remove {{#if context.recordId}} and content before {{else}}, keep content after {{else}}
            processedPrompt = processedPrompt.replace(/\{\{#if context\.recordId\}\}.*?\{\{else\}\}(.*?)\{\{\/if\}\}/gs, '$1');
        }

        // Handle conditional blocks for modelContext.selectedAccountId
        if (this.context.modelContext?.selectedAccountId) {
            // Keep content inside {{#if context.modelContext.selectedAccountId}}...{{/if}}
            processedPrompt = processedPrompt.replace(
                /\{\{#if context\.modelContext\.selectedAccountId\}\}(.*?)\{\{\/if\}\}/gs, 
                '$1'
            );
        } else {
            // Remove the entire conditional block if no selectedAccountId
            processedPrompt = processedPrompt.replace(
                /\{\{#if context\.modelContext\.selectedAccountId\}\}.*?\{\{\/if\}\}/gs, 
                ''
            );
        }

        // Add common tool response handling guideline (product-level, applies to all prompts)
        // Only add if not already present (to avoid duplicates)
        if (!processedPrompt.includes('TOOL RESPONSE HANDLING - STRUCTURED DATA DISPLAY')) {
            processedPrompt = processedPrompt + TOOL_RESPONSE_HANDLING_GUIDELINE;
        }

        return processedPrompt;
    }

    /**
     * Get model info for a specific model
     */
    public getModelInfo(modelName: string): any {
        const allModels = ModelRegistry.getInstance().getAllModels();
        return allModels.find(model => model.name === modelName);
    }

    /**
     * Create or update a prompt template
     */
    public async createPromptTemplate(
        promptType: string,
        promptText: string,
        isDefault: boolean = false,
        priority: number = 0,
        context?: string
    ): Promise<PromptTemplate> {
        // First, get or create the view
        const view = await this.getOrCreateView();

        return await prisma.prompt_template.create({
            data: {
                view_id: view.id,
                prompt_type: promptType,
                prompt_text: promptText,
                is_default: isDefault,
                priority: priority,
                context: context
            }
        });
    }

    /**
     * Get or create a view for the current model and view name
     */
    private async getOrCreateView(): Promise<View> {
        const viewName = this.viewName || `${this.modelName}_views`;

        const whereClause: any = {
            model_name: this.modelName,
            name: viewName
        };

        let view = await prisma.view.findFirst({
            where: whereClause
        });

        if (!view) {
            // Create the view if it doesn't exist
            view = await prisma.view.create({
                data: {
                    name: viewName,
                    model_name: this.modelName,
                    description: `View for ${this.modelName} - ${viewName}`,
                    data_graph: {
                        id: {
                            dataType: 'string',
                            permission: 'read',
                            displayName: 'ID',
                            isColumnShow: true,
                        },
                    },
                }
            });
        }

        return view;
    }

    /**
     * Update an existing prompt template
     */
    public async updatePromptTemplate(
        templateId: string,
        updates: Partial<{
            prompt_text: string;
            is_default: boolean;
            priority: number;
            context: string;
        }>
    ): Promise<PromptTemplate> {
        return await prisma.prompt_template.update({
            where: { id: templateId },
            data: {
                ...updates,
                modified_at: new Date()
            }
        });
    }
} 