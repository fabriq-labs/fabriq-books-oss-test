/**
 * LLMService — Unified LLM interface for non-agent use cases.
 *
 * Delegates all calls to Vercel AI SDK via the shared model provider factory.
 * Supports financial analysis, text generation, and binary (PDF/image) extraction.
 *
 * Public API is unchanged from the original Vertex-direct implementation so that
 * callers (rest/routes.ts, base-extractor.ts) require zero changes.
 */

import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { getModel, getModelId } from './ai/modelProvider';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Schema for analyzeFinancialData structured output
// ---------------------------------------------------------------------------
const financialAnalysisSchema = z.object({
  summary: z.string().describe('Summary of the financial position'),
  strengths: z.array(z.string()).describe('Key financial strengths'),
  weaknesses: z.array(z.string()).describe('Key financial weaknesses'),
  recommendations: z.array(z.string()).describe('Actionable recommendations'),
  immediateActions: z.array(z.string()).describe('Immediate actions to take'),
});

export class LLMService {
  private static instance: LLMService;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  // -------------------------------------------------------------------------
  // Financial analysis (structured output)
  // -------------------------------------------------------------------------
  public async analyzeFinancialData(financialData: any) {
    const startTime = performance.now();
    const modelId = getModelId('analysis');

    try {
      const userData = `user_data = ${JSON.stringify(financialData, null, 4)}`;

      const systemInstruction = `You are an expert financial analyst. Your task is to analyze a user's financial data and provide: 

**Summary Insights:** A concise overview of the user's financial position, highlighting key strengths and areas for improvement. 
**Next Steps and Immediate Actions:** Specific, actionable recommendations based on the analysis. 

**User Profile:** 
	* **Age:** [User's Age]

**Financial Data:** 
	* **Net Worth:** [Net Worth Amount] 
	* **Assets:** 
	* Bank and Cash (Term Deposits): [Amount] 
	* Liquid and Equivalents (Treasury Bills): [Amount] 
	* Fixed, Personal, and Large (Real Estate, Physical Gold): [Amount] 
	* Investments (Equity Instruments): [Amount] 
	* Retirement (Debt Instruments): [Amount] 
* **Liabilities:** 
	* Secured (Mortgage): [Amount] 
	* Unsecured (Personal Loan): [Amount]

**Financial Ratios:** 

* **Saving Rate (%):** [Saving Rate Value] 
* **Analysis:** (Total Income - Total Expenses) / Total Income 
* **Condition:** Target > 25% for single income
* **Details:** 
* Lower savings rate of < 25% impacts long-term financial goals. 
* Check for budgeting, discretionary expenses > 25% of income, financial obligations > 35% of income. 
* Suggest debt management plan if the financial obligations are > 35% and leverage > 50% needed. 
* Check for clear financial goals and automated savings. 

* **Liquid Assets and Equivalents Ratio (%):** [Liquid Assets Ratio Value] 
	* **Analysis:** (Bank and Cash + Liquid and Equivalents) / Total Net Worth 
	* **Condition:** Target < 8% (excluding emergency fund). 
	* **Details:** 
* Liquid asset ratio > 8% (excluding 6 months emergency) is detrimental to long-term growth. 
	* Suggest moving money to long-term debt to reduce the ratio to 7-8%. 
* The user's age is [User's Age] and emergency fund covers [Emergency Fund Months] months. 

* **Preparedness (Retirement Readiness):** [Preparedness Value] 
	* **Analysis:** (Total Assets - Fixed, Personal, and Large) / Total Expenses 
	* **Condition:** Target > 35. 
* **Details:** Uses modified 25x and 60%-40% stock-bond allocation retirement rule for retirement readiness determination. 

* **Financial Assets Ratio (%):** [Financial Assets Ratio Value] 
	* **Analysis:** (Total Assets - Fixed, Personal, and Large) / Total Assets 
	* **Condition:** Target > 70%. 
* **Details:** 
	* Fixed assets (real estate & gold) assumed to be 30%. 
* Suggest asset rebalancing or future investment in financial assets to improve ratio. 

* **Leverage (%):** [Leverage Value] 
	* **Analysis:** Total Liabilities / (Total Assets - Automobiles - Home Furnishings) 
	* **Condition:** Target < 50%. 
* **Solvency (%):** [Solvency Value] 
	* **Analysis:** 1 - Leverage 
	* **Condition:** 
	* > 30% for coverage ratio > 3. 
	* > 50% for coverage ratio > 2. 
* **Details:** 
	* Suggest debt management plan if conditions not met. 
	* Consider selling non-essential assets or refinancing debt. 

* **Coverage Ratio:** [Coverage Ratio Value] 
	* **Analysis:** Monthly Income / Sum of Financial Obligations 
	* **Condition:** Target > 1.5. 
	* **Details:** 
	* Ratio < 2 requires debt reduction or restructuring. 
	* Solvency < 30% with low coverage needs immediate action. 

* **Liquid / Emergency Fund (Months):** [Emergency Fund Months Value] 
	* **Analysis:** (Bank and Cash + Liquid and Equivalents) x 12 / Total Expenses
	* **Condition:** 
	* 6 months for ages < 35. 
	* 24 months for ages > 50. 
	* 12 months for age > 35. 

**Instructions:** 

Analyze the provided financial data and ratios. 
Provide a clear and concise summary of the user's financial position, highlighting strengths and weaknesses. 
Offer specific, actionable next steps and immediate actions to improve the user's financial situation, based on the analysis and provided conditions. 
Ensure the output is well-structured and easy to understand. 
Focus on providing practical and realistic advice.`;

      const result = await generateObject({
        model: getModel('analysis'),
        schema: financialAnalysisSchema,
        system: systemInstruction,
        prompt: userData,
      });

      const duration = performance.now() - startTime;
      logger.info('LLM Call Completed', {
        method: 'analyzeFinancialData',
        model: modelId,
        duration_ms: Math.round(duration),
        tokens: {
          prompt_tokens: result.usage?.promptTokens || 0,
          completion_tokens: result.usage?.completionTokens || 0,
          total_tokens: (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0),
        },
      });

      return result.object;
    } catch (error: any) {
      const duration = performance.now() - startTime;
      logger.error('Error in analyzeFinancialData:', {
        error: error.message,
        duration_ms: Math.round(duration),
        method: 'analyzeFinancialData',
        model: modelId,
      });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Generic text generation with usage metadata
  // -------------------------------------------------------------------------
  public async generateContentWithUsage(request: {
    systemInstruction: string;
    userData: string;
    model?: string; // kept for interface compat; provider/model resolved via env config
  }): Promise<{ text: string; usage?: { promptTokens?: number; completionTokens?: number } }> {
    const startTime = performance.now();
    const modelId = getModelId('extraction');

    try {
      const result = await generateText({
        model: getModel('extraction'),
        system: request.systemInstruction,
        prompt: request.userData,
      });

      const duration = performance.now() - startTime;
      logger.info('LLM Call Completed', {
        method: 'generateContentWithUsage',
        model: modelId,
        duration_ms: Math.round(duration),
        tokens: {
          prompt_tokens: result.usage?.promptTokens || 0,
          completion_tokens: result.usage?.completionTokens || 0,
          total_tokens: (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0),
        },
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
        },
      };
    } catch (error: any) {
      this.logError('generateContentWithUsage', modelId, startTime, error);
      throw error;
    }
  }

  /**
   * Backward-compatible wrapper — returns text only.
   */
  public async generateContent(request: {
    systemInstruction: string;
    userData: string;
    model?: string;
  }): Promise<string> {
    const result = await this.generateContentWithUsage(request);
    return result.text;
  }

  // -------------------------------------------------------------------------
  // Binary (PDF / image) content generation with usage metadata
  // -------------------------------------------------------------------------
  public async generateContentFromBinaryWithUsage(request: {
    systemInstruction: string;
    userData: string;
    binaryData: Buffer;
    mimeType: string;
    model?: string; // kept for interface compat; provider/model resolved via env config
    maxOutputTokens?: number;
  }): Promise<{ text: string; usage?: { promptTokens?: number; completionTokens?: number } }> {
    const startTime = performance.now();
    const modelId = getModelId('extraction');
    const maxTokens = request.maxOutputTokens || parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '65535');

    try {
      const result = await generateText({
        model: getModel('extraction'),
        system: request.systemInstruction,
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: request.userData },
              {
                type: 'file' as const,
                data: request.binaryData,
                mimeType: request.mimeType,
              },
            ],
          },
        ],
        maxTokens,
      });

      const duration = performance.now() - startTime;
      logger.info('LLM Call Completed', {
        method: 'generateContentFromBinaryWithUsage',
        model: modelId,
        duration_ms: Math.round(duration),
        maxOutputTokens: maxTokens,
        tokens: {
          prompt_tokens: result.usage?.promptTokens || 0,
          completion_tokens: result.usage?.completionTokens || 0,
          total_tokens: (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0),
        },
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
        },
      };
    } catch (error: any) {
      this.logError('generateContentFromBinaryWithUsage', modelId, startTime, error);
      throw error;
    }
  }

  /**
   * Backward-compatible wrapper — returns text only.
   */
  public async generateContentFromBinary(request: {
    systemInstruction: string;
    userData: string;
    binaryData: Buffer;
    mimeType: string;
    model?: string;
    maxOutputTokens?: number;
  }): Promise<string> {
    const result = await this.generateContentFromBinaryWithUsage(request);
    return result.text;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  private logError(methodName: string, modelId: string, startTime: number, error: any): void {
    const duration = performance.now() - startTime;
    logger.error(`Error in ${methodName}:`, {
      error: error.message,
      duration_ms: Math.round(duration),
      method: methodName,
      model: modelId,
    });
  }
}
