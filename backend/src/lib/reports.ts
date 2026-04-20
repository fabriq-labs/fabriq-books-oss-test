import { AuthContext } from "../auth/types";
import logger from '../utils/logger';
import { get_my_feed } from './reports/zeiv';
import { getIncomeStatement, getTrialBalance, getNetworthForAssets, getNetworthForLiabilities, getSavingRatio, getFinancialRatios, getAssetsTotal, getClassificationBreakdown, getIncomeByType, getIncomeTotal, getLiabilitiesBreakdown, getLiabilitiesTotal, getAssetsBreakdown } from './reports/perfin';

export const run_report = async (context: AuthContext, report_id: any, filters: any) => {
  logger.debug(`Running report ${report_id} with filters: ${JSON.stringify(filters)}`, context.user);
  if (report_id === "test") {
    return { message: "Report run successfully with filters: " + JSON.stringify(filters) };
  }
  else if (report_id === "trial_balance") {
    return await getTrialBalance(
      filters.from_date,
      filters.to_date,
      context.user.org_id,
      filters.account_id,
      filters.currency_id ?? filters.currency,
      filters.legal_entity_ids
    );
  } else if (report_id === "income_statement") {

    return await getIncomeStatement(
      filters.from_date,
      filters.to_date,
      context.user.org_id,
      filters.account_id,
      filters.legal_entity_ids,
      filters.currency_id ?? filters.currency
    );
  } else if (report_id === "personal_income") {
    const entityId = filters.legal_entity_id;
    return await getIncomeStatement(
      filters.from_date,
      filters.to_date,
      context.user.org_id,
      undefined,
      entityId ? [entityId] : undefined,
      filters.currency_id ?? filters.currency,
      2 // cap at level 2 (3 levels: 0, 1, 2)
    );
  }
  else if (report_id === "networth") {
    const assets = await getNetworthForAssets(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );
    const liabilities = await getNetworthForLiabilities(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );
    return { success: true, assets, liabilities };
  }
  else if (report_id === "financial_ratios") {
    return await getFinancialRatios(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );
  }
  else if (report_id === "my_feed") {
    return await get_my_feed(
      context.user.id,
      context.user.org_id
    );
  }
  else if (report_id === "assets") {
    const assets = await getAssetsTotal(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );
    const breakdown = await getAssetsBreakdown(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );
    return { assets, breakdown };
  } else if (report_id === "liabilities") {
    const metrics = await getLiabilitiesTotal(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );

    const breakdown = await getLiabilitiesBreakdown(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );
    return { metrics, breakdown };
  } else if (report_id === "income_summary_by_category") {
    const summary = await getIncomeTotal(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );
    return { summary };
  } else if (report_id === "income_analysis_by_type") {
    const analysis = await getIncomeByType(
      filters.from_date,
      filters.to_date,
      context.user.org_id
    );
    return { analysis };
  } else if (report_id === "classification_breakdown") {
    const classification = filters.classification as 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
    if (!classification) {
      throw new Error("Classification is required for classification_breakdown report");
    }
    const breakdown = await getClassificationBreakdown(
      context.user.org_id,
      classification
    );
    return { breakdown };
  }
  else {
    throw new Error(`Report not found: ${report_id}`);
  }
}

