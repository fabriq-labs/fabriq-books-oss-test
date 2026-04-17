import prisma from '../lib/prisma';
import { AuthContext } from '../auth/types';
import { PermissionService } from './permissions/PermissionService';
import logger from '../utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * The selectProps shape as stored in a view's data_graph field.
 * Only the fields needed for resolution are required; the rest are ignored.
 */
interface SelectProps {
  instanceType: string;   // model to look up (e.g. "account")
  searchParams: string;   // field to search by (e.g. "code")
  instanceKey: string;    // field whose value becomes the resolved ID (e.g. "id")
  instanceSourceKey: string; // target field in the row (e.g. "account_id")
}

/**
 * One resolution spec extracted from the data_graph — describes how to resolve
 * a single relationship field in the data.
 */
export interface RelationshipSpec {
  /** The field in each data row that currently holds a code/name to be resolved */
  rowField: string;
  /** Prisma model name to search in */
  instanceType: string;
  /** The column in that model to match against the raw value */
  searchField: string;
  /** The column in that model to use as the resolved value (always "id") */
  resolvedField: string;
}

export interface ResolveOptions {
  /** Rows to resolve in-place. Returned with relationship fields rewritten to IDs. */
  data: Record<string, any>[];
  /** View name to read selectProps from */
  viewName: string;
  /** Model name (used to fetch the view) */
  modelName: string;
  /** Auth context — needed for org_id scoping of DB lookups */
  context: AuthContext;
}

export interface ResolveResult {
  data: Record<string, any>[];
  /** Number of relationship fields that were resolved */
  resolvedFieldCount: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Generic relationship resolver.
 *
 * Reads `selectProps` from a view's data_graph and batch-resolves code/name
 * values to database IDs before the data reaches UploadService.
 *
 * Behaviour:
 *  - One batch DB query per distinct instanceType (not one per row)
 *  - Empty / null values in a row are left untouched (field is optional)
 *  - Non-empty values that cannot be resolved throw immediately with the
 *    offending row, so callers get actionable feedback without processing
 *    the whole dataset
 *
 * This service has no knowledge of the posting domain — it works with any
 * view whose data_graph uses the selectProps convention.
 */
export class RelationshipResolverService {
  private static instance: RelationshipResolverService;

  private constructor() {}

  public static getInstance(): RelationshipResolverService {
    if (!RelationshipResolverService.instance) {
      RelationshipResolverService.instance = new RelationshipResolverService();
    }
    return RelationshipResolverService.instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Extract RelationshipSpecs from a view's data_graph.
   * Returns one spec per field that has columnType "select" + selectProps.
   */
  async extractSpecs(viewName: string, modelName: string): Promise<RelationshipSpec[]> {
    const view = await PermissionService.getView(viewName, modelName);
    if (!view?.data_graph) return [];

    const dataGraph = view.data_graph as Record<string, any>;
    const specs: RelationshipSpec[] = [];

    for (const [fieldName, fieldDef] of Object.entries(dataGraph)) {
      if (!fieldDef || typeof fieldDef !== 'object') continue;
      const tableProps = fieldDef.tableProps as Record<string, any> | undefined;
      if (!tableProps) continue;
      if (tableProps.columnType !== 'select') continue;

      const sp = tableProps.selectProps as SelectProps | undefined;
      if (!sp?.instanceType || !sp?.searchParams || !sp?.instanceKey || !sp?.instanceSourceKey) continue;

      specs.push({
        rowField: fieldName,           // e.g. "account_id" / "credit_account_id"
        instanceType: sp.instanceType, // e.g. "account"
        searchField: sp.searchParams,  // e.g. "code"
        resolvedField: sp.instanceKey, // e.g. "id"
      });
    }

    return specs;
  }

  /**
   * Resolve relationship fields in the data rows.
   *
   * For each spec:
   *   1. Collect all unique non-null raw values across the dataset
   *   2. Single batch query to the target model filtered by org_id
   *   3. Build lookup map: rawValue → resolvedId
   *   4. Rewrite each row; throw on first unresolvable non-null value
   */
  async resolve(options: ResolveOptions): Promise<ResolveResult> {
    const { data, viewName, modelName, context } = options;
    const orgId = context.user?.org_id;
    if (!orgId) throw new Error('Auth context missing org_id — cannot scope relationship lookups');

    const specs = await this.extractSpecs(viewName, modelName);

    if (specs.length === 0) {
      logger.debug('RelationshipResolverService: no selectProps specs found', { viewName, modelName });
      return { data, resolvedFieldCount: 0 };
    }

    logger.debug('RelationshipResolverService: resolving', {
      viewName, modelName, specCount: specs.length, rowCount: data.length,
    });

    const resolved = data.map((row) => ({ ...row })); // shallow clone each row
    let totalFieldsResolved = 0;

    // Group specs by instanceType to batch queries per model
    const byModel = new Map<string, RelationshipSpec[]>();
    for (const spec of specs) {
      const list = byModel.get(spec.instanceType) ?? [];
      list.push(spec);
      byModel.set(spec.instanceType, list);
    }

    for (const [instanceType, modelSpecs] of byModel) {
      // Collect all unique raw values for every spec targeting this model
      const allRawValues = new Set<string>();
      for (const spec of modelSpecs) {
        for (const row of resolved) {
          const val = row[spec.rowField];
          if (val != null && val !== '') {
            allRawValues.add(String(val));
          }
        }
      }

      if (allRawValues.size === 0) continue;

      // Each spec can have a different searchField — group by searchField
      const bySearchField = new Map<string, RelationshipSpec[]>();
      for (const spec of modelSpecs) {
        const list = bySearchField.get(spec.searchField) ?? [];
        list.push(spec);
        bySearchField.set(spec.searchField, list);
      }

      for (const [searchField, fieldSpecs] of bySearchField) {
        // Collect values needed for this searchField
        const valuesToLookup = new Set<string>();
        for (const spec of fieldSpecs) {
          for (const row of resolved) {
            const val = row[spec.rowField];
            if (val != null && val !== '') valuesToLookup.add(String(val));
          }
        }
        if (valuesToLookup.size === 0) continue;

        // Single batch query — one query per (instanceType, searchField) pair
        const resolvedField = fieldSpecs[0].resolvedField; // always "id"
        const lookupResult = await this.batchLookup(
          instanceType,
          searchField,
          resolvedField,
          Array.from(valuesToLookup),
          orgId
        );

        // Rewrite rows — fail fast on first unresolvable value
        for (const row of resolved) {
          for (const spec of fieldSpecs) {
            const rawVal = row[spec.rowField];
            if (rawVal == null || rawVal === '') continue;

            const rawStr = String(rawVal);
            const resolvedId = lookupResult.get(rawStr);

            if (!resolvedId) {
              throw new RelationshipResolutionError(
                `Cannot resolve ${spec.rowField} value "${rawStr}": ` +
                `no ${instanceType} found with ${searchField} = "${rawStr}"`,
                row,
                spec
              );
            }

            row[spec.rowField] = resolvedId;
            totalFieldsResolved++;
          }
        }
      }
    }

    logger.debug('RelationshipResolverService: done', {
      viewName, modelName, totalFieldsResolved,
    });

    return { data: resolved, resolvedFieldCount: totalFieldsResolved };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async batchLookup(
    modelName: string,
    searchField: string,
    resolvedField: string,
    values: string[],
    orgId: string
  ): Promise<Map<string, string>> {
    const model = (prisma as any)[modelName];
    if (!model) {
      throw new Error(`RelationshipResolverService: unknown model "${modelName}"`);
    }

    const rows: Record<string, any>[] = await model.findMany({
      where: {
        [searchField]: { in: values },
        org_id: orgId,
      },
      select: {
        [searchField]: true,
        [resolvedField]: true,
      },
    });

    const map = new Map<string, string>();
    for (const row of rows) {
      const key = String(row[searchField]);
      const val = String(row[resolvedField]);
      map.set(key, val);
    }
    return map;
  }
}

// ── Error type ─────────────────────────────────────────────────────────────────

export class RelationshipResolutionError extends Error {
  constructor(
    message: string,
    /** The full data row that triggered the failure */
    public readonly row: Record<string, any>,
    /** The spec that was being resolved when the failure occurred */
    public readonly spec: RelationshipSpec
  ) {
    super(message);
    this.name = 'RelationshipResolutionError';
  }
}
