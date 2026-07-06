import { QueryOptions } from '../types';
import { SearchDateBounds } from './searchDateBounds';

export interface SearchFilter {
  field: string;
  operator: string;
  value: any;
}

export class SearchQueryBuilder {
  static buildQueryOptions(query: any): QueryOptions {
    const options: QueryOptions = {};

    // Handle filter (simple case)
    if (query.filter) {
      try {
        options.where = typeof query.filter === 'string'
          ? JSON.parse(query.filter)
          : query.filter;
      } catch (error) {
        throw new Error('Invalid filter format');
      }
    }

    // Handle search (complex case)
    if (query.search) {

      // ----- to support legacy search format -----
      if (query.search.filters) {
        // Convert object format to array of filter objects
        if (typeof query.search.filters === 'object' && !Array.isArray(query.search.filters)) {
          const filters = this.extractFiltersFromObject(query.search.filters);
          query.search = filters;
        } else if (Array.isArray(query.search.filters)) {
          // Handle case where filters is already an array
          query.search = query.search.filters;
        }
      }
      //--------- end legacy search format support -----------------------

      try {
        const searchFilters = typeof query.search === 'string'
          ? JSON.parse(query.search)
          : query.search;

        if (Array.isArray(searchFilters)) {
          options.where = this.buildSearchWhereClause(searchFilters);
        } else if (typeof searchFilters === 'object' && searchFilters !== null) {
          // Check if search has a filters property (new format)
          if (searchFilters.filters) {
            if (Array.isArray(searchFilters.filters)) {
              // Handle case where search.filters is an array
              options.where = this.buildSearchWhereClause(searchFilters.filters);
            } else if (typeof searchFilters.filters === 'object') {
              // Handle case where search.filters contains the actual filters as object
              const filters = this.extractFiltersFromObject(searchFilters.filters);
              options.where = this.buildSearchWhereClause(filters);
            }
          } else {
            // Handle case where search is directly the filters object (legacy format)
            const filters = this.extractFiltersFromObject(searchFilters);
            options.where = this.buildSearchWhereClause(filters);
          }
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid search format: ${detail}`);
      }
    }

    // Handle sort
    if (query.sort) {
      const orderBy = this.parseSort(query.sort);
      if (orderBy) {
        options.orderBy = orderBy;
      }
    }

    // Handle sortOption (alternative sort field)
    if (query.sortOption) {
      const orderBy = this.parseSort(query.sortOption);
      if (orderBy) {
        options.orderBy = orderBy;
      }
    }

    // Handle pagination using page and pageSize
    if (query.page || query.size || query.pageSize) {
      const page = parseInt(query.page) || 1;
      const size = parseInt(query.size) || parseInt(query.pageSize) || 10;

      if (page < 1) {
        throw new Error('Page number must be greater than 0');
      }
      if (size < 1) {
        throw new Error('Page size must be greater than 0');
      }

      options.skip = (page - 1) * size;
      options.take = size;
    }

    // Handle includes
    if (query.include) {
      options.include = this.parseInclude(query.include);
    }

    // Handle select
    if (query.select) {
      options.select = this.parseSelect(query.select);
    }

    return options;
  }

  private static parseSort(sort: string | string[] | any): any {
    // Handle empty object or null/undefined
    if (!sort || (typeof sort === 'object' && Object.keys(sort).length === 0)) {
      return undefined;
    }

    // Handle string
    if (typeof sort === 'string') {
      sort = sort.split(',');
    }

    // Handle array
    if (Array.isArray(sort)) {
      return sort.map(field => {
        const isDesc = field.startsWith('-');
        const fieldName = isDesc ? field.substring(1) : field;
        return {
          [fieldName]: isDesc ? 'desc' : 'asc'
        };
      });
    }

    // Handle object (direct Prisma orderBy format)
    if (typeof sort === 'object') {
      return sort;
    }

    return undefined;
  }

  private static parseInclude(include: string | string[]): any {
    if (typeof include === 'string') {
      include = include.split(',');
    }

    return include.reduce((acc: any, field: string) => {
      acc[field] = true;
      return acc;
    }, {});
  }

  private static parseSelect(select: string | string[]): any {
    if (typeof select === 'string') {
      select = select.split(',');
    }

    return select.reduce((acc: any, field: string) => {
      acc[field] = true;
      return acc;
    }, {});
  }

  private static buildSearchWhereClause(filters: SearchFilter[]): any {
    const where: any = {};

    filters.forEach(filter => {
      const { field, operator, value } = filter;
      const op = operator.toLowerCase();

      // is_null / is_not_null are valid with a null payload (e.g. { account_id: { is_null: null } })
      if (
        (value === undefined || value === null || value === '') &&
        op !== 'is_null' &&
        op !== 'is_not_null'
      ) {
        return;
      }

      // Handle logical operators at root level
      if (field.toLowerCase() === 'or' && operator.toLowerCase() === 'or') {
        where.OR = Array.isArray(value)
          ? value.map((v) => this.normalizeFilterEntry(v))
          : [this.convertObjectToFilters(value)];
        return;
      }

      if (field.toLowerCase() === 'and' && operator.toLowerCase() === 'and') {
        where.AND = Array.isArray(value)
          ? value.map((v) => this.normalizeFilterEntry(v))
          : [this.convertObjectToFilters(value)];
        return;
      }

      if (field.toLowerCase() === 'not' && operator.toLowerCase() === 'not') {
        where.NOT = this.convertObjectToFilters(value);
        return;
      }

      // Initialize field object if it doesn't exist or if it's not an object
      if (!where[field] || typeof where[field] !== 'object' || Array.isArray(where[field])) {
        where[field] = {};
      }

      switch (op) {
        case 'eq':
          where[field] = value;
          break;
        case 'neq':
        case 'ne': // LLMs often emit SQL-style ne; treat as neq
          // Prisma { not: X } excludes NULL; SQL "<> X" / IS DISTINCT FROM keeps NULL rows
          where.AND = where.AND || [];
          where.AND.push({
            OR: [{ [field]: null }, { [field]: { not: value } }],
          });
          break;
        case 'gt':
          where[field] = { ...where[field], gt: value };
          break;
        case 'gte':
          where[field] = { ...where[field], gte: value };
          break;
        case 'lt':
          where[field] = { ...where[field], lt: value };
          break;
        case 'lte':
          where[field] = { ...where[field], lte: value };
          break;
        case 'in':
          where[field] = { in: Array.isArray(value) ? value : [value] };
          break;
        case 'nin':
          // Prisma { notIn: [...] } excludes NULL; SQL NOT IN drops NULL rows
          where.AND = where.AND || [];
          where.AND.push({
            OR: [{ [field]: null }, { [field]: { notIn: Array.isArray(value) ? value : [value] } }],
          });
          break;
        case 'contains':
        case 'icontains':
        case 'ilike':
        case 'iLike':
        case 'like':
          // LLMs often use SQL-style ILIKE/LIKE; normalize to Prisma icontains
          where[field] = {
            contains: typeof value === 'string' ? value.replace(/^%|%$/g, '') : value,
            mode: 'insensitive',
          };
          break;
        case 'ncontains':
        case 'not_contains': {
          // (col IS NULL OR col NOT ILIKE '%x%') — field.not.contains does not support mode in Prisma
          const needle =
            typeof value === 'string' ? value.replace(/^%|%$/g, '') : value;
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { [field]: null },
              { NOT: { [field]: { contains: needle, mode: 'insensitive' } } },
            ],
          });
          break;
        }

        case 'is_null':
          where[field] = null;
          break;
        case 'is_not_null':
          where[field] = { not: null };
          break;

        case 'startsWith':
          where[field] = { startsWith: value };
          break;
        case 'endsWith':
          where[field] = { endsWith: value };
          break;
        case 'and':
          where.AND = Array.isArray(value)
            ? value.map((v) => this.normalizeFilterEntry(v))
            : [this.convertObjectToFilters(value)];
          break;
        case 'or':
          where.OR = Array.isArray(value)
            ? value.map((v) => this.normalizeFilterEntry(v))
            : [this.convertObjectToFilters(value)];
          break;
        case 'not':
          where.NOT = this.convertObjectToFilters(value);
          break;
        case 'some':
        case 'every':
        case 'none':
          // Prisma relationship filters: pass value through as nested object
          // These operators are used for filtering on related records
          // e.g., { supplier_items: { some: { item_id: "value" } } }
          where[field] = { [operator]: value };
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }
    });

    for (const key of Object.keys(where)) {
      const v = where[key];
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
        delete where[key];
      }
    }

    SearchDateBounds.finalizeWhereDateBounds(where);

    return where;
  }

  /** Accepts legacy nested objects or searchRecords array items { field, operator, value }. */
  private static normalizeFilterEntry(entry: any): any {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof entry.field === 'string' &&
      typeof entry.operator === 'string' &&
      'value' in entry
    ) {
      return this.buildSearchWhereClause([entry as SearchFilter]);
    }
    return this.convertObjectToFilters(entry);
  }

  private static convertObjectToFilters(filterObject: any): any {
    const filters = this.extractFiltersFromObject(filterObject);
    return this.buildSearchWhereClause(filters);
  }

  private static extractFiltersFromObject(filterObject: any): SearchFilter[] {
    if (typeof filterObject !== 'object' || filterObject === null) {
      return [];
    }

    const filters = [];
    for (const [field, conditions] of Object.entries(filterObject)) {
      // Handle logical operators (or, and, not) at root level - case insensitive
      if (field.toLowerCase() === 'or' || field.toLowerCase() === 'and' || field.toLowerCase() === 'not') {
        filters.push({
          field: field.toLowerCase(),
          operator: field.toLowerCase(),
          value: conditions
        });
      } else if (conditions === null) {
        // Direct null value: field IS NULL (e.g. { "reconciliation_status": null } in OR branches)
        filters.push({ field, operator: 'is_null', value: true });
      } else if (typeof conditions === 'object' && !Array.isArray(conditions)) {
        // Object with operator keys (e.g. { "eq": "UNMATCHED" }, { "ncontains": "Closing" })
        for (const [operator, value] of Object.entries(conditions)) {
          filters.push({
            field,
            operator,
            value
          });
        }
      } else {
        // Primitive value: treat as equality (e.g. { "reconciliation_status": "UNMATCHED" } in OR branches)
        filters.push({ field, operator: 'eq', value: conditions });
      }
    }
    return filters;
  }
} 