import { DocumentExtractor, DocumentExtractionRequest, DocumentExtractionResult, ExtractionContext } from './types';
import { LLMService } from '../llm';
import logger from '../../utils/logger';
import { aiActivityLogger } from '../../agent/utils/aiActivityLogger';
import { llmTraceLogger } from '../llm-trace-logger';

export abstract class BaseDocumentExtractor implements DocumentExtractor {
  protected llmService: LLMService;
  protected config: any;

  constructor(config?: any) {
    this.llmService = LLMService.getInstance();
    this.config = config || {};
  }

  // Abstract methods that subclasses must implement
  abstract getSupportedTypes(): string[];
  abstract getTargetModel(): string; // New: Each extractor maps to one model
  abstract getExtractionPrompt(): string;
  abstract getExpectedSchema(): Record<string, any>;

  // Hook methods for subclasses to augment prompts and schemas with additional context
  protected augmentPromptWithContext(basePrompt: string, options?: any): string {
    return basePrompt;
  }

  protected augmentSchemaWithContext(baseSchema: Record<string, any>, options?: any): Record<string, any> {
    return baseSchema;
  }

  async extract(context: ExtractionContext, request: DocumentExtractionRequest): Promise<DocumentExtractionResult> {
    const startTime = Date.now();
    
    try {
      logger.debug(`Starting document extraction for type: ${request.documentType}`, context.user);

      // Validate document content
      if (!this.validateDocument(request.documentContent)) {
        throw new Error('Invalid document content');
      }

      // For binary documents (PDFs, images), send directly to LLM
      // For text documents, use LLM with text content
      let extractedData: Record<string, any>;

      if (Buffer.isBuffer(request.documentContent)) {
        logger.debug('Processing binary document directly with LLM');
        extractedData = await this.extractWithLLM(context, request.documentContent, request.options, request.documentType);
      } else {
        logger.debug('Processing text document with LLM');
        extractedData = await this.extractWithLLM(context, request.documentContent, request.options, request.documentType);
      }

      // Get the augmented schema (includes any context added by subclasses)
      const augmentedSchema = this.augmentSchemaWithContext(
        this.getExpectedSchema(),
        request.options
      );

      // Validate extracted data against augmented schema
      const validatedData = this.validateExtractedData(extractedData, augmentedSchema);

      // Calculate confidence score
      const confidence = Buffer.isBuffer(request.documentContent) 
        ? this.calculateConfidence(extractedData, 'binary_document')
        : this.calculateConfidence(extractedData, request.documentContent);

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: validatedData,
        confidence,
        metadata: {
          documentType: request.documentType,
          extractionTimestamp: new Date(),
          processingTime,
          pageCount: this.getPageCount(request.documentContent)
        }
      };

    } catch (error: any) {
      logger.error(`Document extraction failed: ${error.message}`, context.user);
      
      return {
        success: false,
        data: {},
        confidence: 0,
        errors: [error.message],
        metadata: {
          documentType: request.documentType,
          extractionTimestamp: new Date(),
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  validateDocument(documentContent: string | Buffer): boolean {
    if (!documentContent) {
      return false;
    }

    if (typeof documentContent === 'string') {
      return documentContent.trim().length > 0;
    }

    if (Buffer.isBuffer(documentContent)) {
      return documentContent.length > 0;
    }

    return false;
  }


  protected async extractWithLLM(
    context: ExtractionContext,
    documentContent: string | Buffer,
    options?: any,
    documentType?: string
  ): Promise<Record<string, any>> {
    const startTime = Date.now();
    const basePrompt = this.getExtractionPrompt();
    const baseSchema = this.getExpectedSchema();
    const targetModel = this.getTargetModel();
    const llmModel = process.env.LLM_MODEL || (Buffer.isBuffer(documentContent) ? 'gemini-2.5-flash' : 'gemini-2.0-flash-001');

    // Allow subclasses to augment with additional context
    const prompt = this.augmentPromptWithContext(basePrompt, options);
    const schema = this.augmentSchemaWithContext(baseSchema, options);

    const systemInstruction = `You are an expert document extraction AI. Your task is to extract structured data from the provided document.

${prompt}

Expected output schema:
${JSON.stringify(schema, null, 2)}

Instructions:
1. Extract only the information that is clearly present in the document
2. Use null for missing fields
3. Ensure all extracted values match the expected data types
4. Be precise and accurate in your extraction
5. Return the result as valid JSON matching the schema exactly
6. IMPORTANT: Return ONLY raw JSON without any markdown formatting or code fences - no \`\`\`json or \`\`\` wrappers

Return ONLY the raw JSON object, nothing else.`;

    try {
      let response: string;
      let promptTokens: number | undefined;
      let completionTokens: number | undefined;

      // If it's a Buffer (PDF/image), send it directly to the LLM
      if (Buffer.isBuffer(documentContent)) {
        logger.debug('Sending binary document directly to LLM');
        const mimeType = this.detectMimeType(documentContent);
        logger.debug(`Detected MIME type: ${mimeType}`);
        
        const result = await this.llmService.generateContentFromBinaryWithUsage({
          systemInstruction,
          userData: prompt,
          binaryData: documentContent,
          mimeType: mimeType
        });
        response = result.text;
        promptTokens = result.usage?.promptTokens;
        completionTokens = result.usage?.completionTokens;
      } else {
        // For text content, use the existing text-based approach
        const userData = `Document text to extract from:
${documentContent}`;
        
        const result = await this.llmService.generateContentWithUsage({
          systemInstruction,
          userData,
          model: 'gemini-2.0-flash-001'
        });
        response = result.text;
        promptTokens = result.usage?.promptTokens;
        completionTokens = result.usage?.completionTokens;
      }

      const durationMs = Date.now() - startTime;
      const extractedData = this.parseLLMResponse(response);

      // Log to ai_activity_log
      if (context.user?.org_id) {
        try {
          // Determine activity type based on document type and whether categorization is included
          const activityType = documentType?.includes('categorization') || documentType?.includes('categorized')
            ? 'extract_document_with_categorization'
            : 'extract_document';

          // Calculate confidence from extracted data completeness
          const confidence = this.calculateConfidence(
            extractedData,
            Buffer.isBuffer(documentContent) ? 'binary_document' : String(documentContent)
          );

          await aiActivityLogger.log({
            orgId: context.user.org_id,
            userId: context.user.id,
            activityType,
            modelName: targetModel,
            recordId: undefined, // Document extraction doesn't target a specific record
            llmModel,
            promptTokens,
            completionTokens,
            durationMs,
            stepsCount: 1,
            toolsUsed: [],
            confidenceScore: confidence / 100, // Convert to 0-1 range
            prediction: {
              documentType,
              extractedFields: Object.keys(extractedData),
              transactionCount: extractedData.transactions?.length || 0,
              categorizationCount: extractedData.categorizations?.length || 0,
            },
            applied: false, // Extraction doesn't apply changes directly
            inputSummary: `Document type: ${documentType || 'unknown'}, Content type: ${Buffer.isBuffer(documentContent) ? 'binary' : 'text'}`,
            reasoning: `Extracted ${Object.keys(extractedData).length} top-level fields from document`,
          });
        } catch (logError: any) {
          logger.warn('Failed to log extraction activity to ai_activity_log', {
            error: logError.message,
            documentType,
          });
        }
      }

      if (context.user?.org_id) {
        llmTraceLogger.logTrace({
          orgId: context.user.org_id,
          userId: context.user.id,
          modelName: targetModel,
          queryType: documentType?.includes('categorization') ? 'extract_document_with_categorization' : 'extract_document',
          question: `Extract ${documentType || 'document'}: ${Buffer.isBuffer(documentContent) ? 'binary' : String(documentContent).substring(0, 200)}`,
          llmModel,
          result: {
            text: response.substring(0, 500),
            steps: [],
            usage: { promptTokens: promptTokens ?? 0, completionTokens: completionTokens ?? 0 },
          },
          durationMs,
          status: 'success',
        }).catch(() => {});
      }

      return extractedData;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      // Log failed extraction attempt
      if (context.user?.org_id) {
        try {
          const activityType = documentType?.includes('categorization') || documentType?.includes('categorized')
            ? 'extract_document_with_categorization'
            : 'extract_document';

          await aiActivityLogger.log({
            orgId: context.user.org_id,
            userId: context.user.id,
            activityType,
            modelName: targetModel,
            llmModel,
            durationMs,
            stepsCount: 1,
            toolsUsed: [],
            applied: false,
            error: error.message,
            inputSummary: `Document type: ${documentType || 'unknown'}, Content type: ${Buffer.isBuffer(documentContent) ? 'binary' : 'text'}`,
          });
        } catch (logError: any) {
          logger.warn('Failed to log failed extraction activity', { error: logError.message });
        }
        llmTraceLogger.logTrace({
          orgId: context.user.org_id,
          userId: context.user.id,
          modelName: targetModel,
          queryType: documentType?.includes('categorization') ? 'extract_document_with_categorization' : 'extract_document',
          question: `Extract ${documentType || 'document'}`,
          llmModel,
          result: { text: '', steps: [], usage: { promptTokens: 0, completionTokens: 0 } },
          durationMs,
          status: 'error',
          errorMessage: error.message,
        }).catch(() => {});
      }

      logger.error('LLM extraction failed:', error);
      
      // Preserve token limit error messages
      if (error.message && error.message.includes('token limit')) {
        throw error;
      }
      
      // Preserve truncation error messages
      if (error.message && error.message.includes('truncated')) {
        throw error;
      }
      
      throw new Error(`Failed to extract data using LLM: ${error.message || 'Unknown error'}`);
    }
  }

  private detectMimeType(content: Buffer): string {
    // Check file signatures to determine MIME type
    if (content.length < 4) return 'application/octet-stream';
    
    const header = content.subarray(0, 4);
    
    // PDF signature
    if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
      return 'application/pdf';
    }
    
    // PNG signature
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
      return 'image/png';
    }
    
    // JPEG signature
    if (header[0] === 0xFF && header[1] === 0xD8) {
      return 'image/jpeg';
    }
    
    // Default to PDF if we can't determine
    return 'application/pdf';
  }

  protected parseLLMResponse(response: string): Record<string, any> {
    try {
      // Step 1: Try to extract JSON from markdown code fence (complete)
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1].trim());
      }

      // Step 2: Handle markdown fence without closing (might be truncated)
      const truncatedMatch = response.match(/```json\n([\s\S]+)/);
      if (truncatedMatch && truncatedMatch[1]) {
        let jsonContent = truncatedMatch[1].trim();
        // Remove trailing ``` if present without newline
        jsonContent = jsonContent.replace(/```\s*$/, '');
        
        try {
          return JSON.parse(jsonContent);
        } catch (parseError: any) {
          // Check if this looks like a token limit truncation
          if (this.isTokenLimitError(jsonContent, parseError)) {
            throw new Error(
              'Response truncated due to token limit. ' +
              'The document contains too many transactions to extract in a single call. ' +
              'Consider using pagination or increasing maxOutputTokens. ' +
              `Response length: ${response.length} characters.`
            );
          }
          throw parseError;
        }
      }

      // Step 3: Try direct JSON parsing (no markdown fence)
      return JSON.parse(response.trim());
    } catch (error: any) {
      logger.error('Failed to parse LLM response as JSON:', error);
      logger.error('Raw response (first 500 chars):', response.substring(0, 500));
      logger.error('Response length:', response.length);
      
      // If the LLM says it can't process the content, return a structured error response
      if (response.toLowerCase().includes('sorry') || response.toLowerCase().includes('cannot')) {
        return {
          error: 'LLM unable to process document content',
          reason: 'Document text may be garbled or unreadable',
          extractedText: response.substring(0, 200) + '...'
        };
      }
      
      // Re-throw with better context if it's already a token limit error
      if (error.message && error.message.includes('token limit')) {
        throw error;
      }
      
      // Check if the raw response suggests truncation
      if (this.isLikelyTruncated(response)) {
        throw new Error(
          'Response appears to be truncated, likely due to token limit. ' +
          'The document may contain too many transactions. ' +
          'Consider using pagination or increasing maxOutputTokens. ' +
          `Response length: ${response.length} characters.`
        );
      }
      
      throw new Error(`Invalid JSON response from LLM: ${error.message}`);
    }
  }

  /**
   * Detects if a JSON parsing error is likely due to token limit truncation.
   */
  protected isTokenLimitError(jsonContent: string, parseError: any): boolean {
    const errorMessage = parseError?.message || '';
    
    // Common truncation indicators:
    // 1. JSON ends abruptly (incomplete structure)
    // 2. Error mentions unexpected end of input
    // 3. Error mentions incomplete property/value
    const truncationIndicators = [
      'Unexpected end of JSON input',
      'Unexpected end of',
      'Expected \',\' or \'}\'',
      'Expected \',\' or \']\'',
      'Unexpected token',
    ];
    
    const hasTruncationError = truncationIndicators.some(indicator => 
      errorMessage.includes(indicator)
    );
    
    // Also check if JSON structure is incomplete
    const isIncomplete = this.isIncompleteJsonStructure(jsonContent);
    
    return hasTruncationError || isIncomplete;
  }

  /**
   * Checks if JSON structure appears incomplete (likely truncated).
   */
  protected isIncompleteJsonStructure(json: string): boolean {
    const trimmed = json.trim();
    
    // If it ends with incomplete patterns, likely truncated
    const incompletePatterns = [
      /,\s*$/,           // Ends with comma
      /:\s*$/,           // Ends with colon (incomplete value)
      /:\s*"[^"]*$/,     // Ends with unclosed string
      /:\s*\{[^}]*$/,    // Ends with unclosed object
      /:\s*\[[^\]]*$/,   // Ends with unclosed array
    ];
    
    // Check if it ends with any incomplete pattern
    const endsIncomplete = incompletePatterns.some(pattern => pattern.test(trimmed));
    
    // Count brackets/braces to see if structure is balanced
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;
    const openBrackets = (trimmed.match(/\[/g) || []).length;
    const closeBrackets = (trimmed.match(/\]/g) || []).length;
    
    const unbalanced = (openBraces !== closeBraces) || (openBrackets !== closeBrackets);
    
    return endsIncomplete || unbalanced;
  }

  /**
   * Checks if response is likely truncated based on heuristics.
   */
  protected isLikelyTruncated(response: string): boolean {
    // Very long responses (>50k chars) that fail to parse are likely truncated
    if (response.length > 50000) {
      return true;
    }
    
    // Check if response ends abruptly (common in truncation)
    const lastChars = response.trim().slice(-50);
    const abruptEndPatterns = [
      /,\s*$/,           // Ends with comma
      /:\s*$/,           // Ends with colon
      /:\s*"[^"]*$/,     // Ends with unclosed string
    ];
    
    return abruptEndPatterns.some(pattern => pattern.test(lastChars));
  }

  protected validateExtractedData(
    data: Record<string, any>,
    schema?: Record<string, any>
  ): Record<string, any> {
    const effectiveSchema = schema || this.getExpectedSchema();
    const validatedData: Record<string, any> = {};

    for (const [key, expectedType] of Object.entries(effectiveSchema)) {
      if (data.hasOwnProperty(key)) {
        validatedData[key] = this.validateFieldType(data[key], expectedType);
      } else {
        validatedData[key] = null;
      }
    }

    return validatedData;
  }

  protected validateFieldType(value: any, expectedType: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    // Basic type validation - can be extended based on needs
    if (expectedType === 'string' && typeof value === 'string') {
      return value;
    }
    if (expectedType === 'number' && typeof value === 'number') {
      return value;
    }
    if (expectedType === 'boolean' && typeof value === 'boolean') {
      return value;
    }
    if (expectedType === 'date' && (typeof value === 'string' || value instanceof Date)) {
      return value;
    }

    // For complex types, return as-is for now
    return value;
  }

  protected calculateConfidence(extractedData: Record<string, any>, documentText: string): number {
    // Simple confidence calculation based on data completeness
    const schema = this.getExpectedSchema();
    const totalFields = Object.keys(schema).length;
    const filledFields = Object.values(extractedData).filter(value => 
      value !== null && value !== undefined && value !== ''
    ).length;

    const completenessScore = filledFields / totalFields;

    // Additional factors could include:
    // - Text length vs extracted data ratio
    // - Presence of key indicators
    // - Data consistency checks

    return Math.min(completenessScore * 100, 100);
  }

  protected getPageCount(documentContent: string | Buffer): number | undefined {
    // Simple page count estimation - can be enhanced for specific document types
    if (typeof documentContent === 'string') {
      const pageBreaks = documentContent.split('\f').length;
      return pageBreaks > 1 ? pageBreaks : undefined;
    }
    return undefined;
  }
}
