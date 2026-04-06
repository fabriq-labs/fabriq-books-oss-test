interface DataGraphField {
  datatype?: string;
  permission?: string;
  required?: boolean;
  type?: string;
  select?: {
    [field: string]: DataGraphField;
  };
}

interface DataGraph {
  [field: string]: DataGraphField;
}

export class LegacyDataGraphParser {
  /**
   * Converts a legacy dataGraph structure into Prisma select options
   * @param dataGraph The dataGraph structure from the view
   * @returns Prisma select options
   */
  static parseToSelect(dataGraph: DataGraph | any): any {
    if (!dataGraph) return undefined;

    const select: any = {};

    Object.entries(dataGraph).forEach(([field, config]) => {
      // Handle relationship fields (type: 'table' with nested select)
      if (
        config &&
        typeof config === 'object' &&
        'type' in config &&
        config.type === 'table' &&
        'select' in config
      ) {
        const configWithSelect = config as { type: string; select: any };
        if (configWithSelect.select) {
          select[field] = {
            select: this.parseToSelect(configWithSelect.select as DataGraph)
          };
        }
      } else {
        // Handle all other cases: string values (like "read") or regular object fields
        // Both result in selecting the field
        select[field] = true;
      }
    });

    return select;
  }
} 