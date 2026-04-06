import { QueryOptions } from '../types';

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
        throw new Error('Invalid search format');
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

      // Handle logical operators at root level
      if (field.toLowerCase() === 'or' && operator.toLowerCase() === 'or') {
        where.OR = Array.isArray(value) ? value.map(v => this.convertObjectToFilters(v)) : [this.convertObjectToFilters(value)];
        return;
      }

      if (field.toLowerCase() === 'and' && operator.toLowerCase() === 'and') {
        where.AND = Array.isArray(value) ? value.map(v => this.convertObjectToFilters(v)) : [this.convertObjectToFilters(value)];
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

      switch (operator.toLowerCase()) {
        case 'eq':
          where[field] = value;
          break;
        case 'neq':
          where[field] = { not: value };
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
          where[field] = { notIn: Array.isArray(value) ? value : [value] };
          break;
        case 'contains':
        case 'icontains':
          where[field] = { contains: value, mode: 'insensitive' };
          break;
        case 'ncontains':
        case 'not_contains':
          where[field] = { not: { contains: value } };
          break;

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
          where.AND = Array.isArray(value) ? value.map(v => this.convertObjectToFilters(v)) : [this.convertObjectToFilters(value)];
          break;
        case 'or':
          where.OR = Array.isArray(value) ? value.map(v => this.convertObjectToFilters(v)) : [this.convertObjectToFilters(value)];
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

    return where;
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