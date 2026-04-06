import { readFileSync } from 'fs';
import { join } from 'path';
import * as fs from 'fs';

function generateTypes() {
  // Read the Prisma schema file
  const schemaPath = join(process.cwd(), 'prisma', 'schema', 'data.prisma');
  const schemaContent = readFileSync(schemaPath, 'utf-8');

  let typesOutput = '// Generated TypeScript types from Prisma schema\n\n';

  // Parse models
  const modelRegex = /model\s+(\w+)\s*{([^}]+)}/g;
  let modelMatch;

  while ((modelMatch = modelRegex.exec(schemaContent)) !== null) {
    const modelName = modelMatch[1];
    const modelContent = modelMatch[2];
    const fields = new Map<string, string>();

    // Parse scalar fields first
    const lines = modelContent.split('\n');
    for (const line of lines) {
      const scalarMatch = line.match(/^\s*(\w+)\s+(\w+)(\?)?\s*(@[^@\n]+)?/);
      if (scalarMatch) {
        const [_, name, type, optional, attributes] = scalarMatch;
        
        // Skip relation fields
        if (attributes?.includes('@relation')) continue;
        
        const tsType = mapPrismaTypeToTS(type);
        // Correct optional syntax: '?: type' instead of 'type?'
        fields.set(name, optional ? `?: ${tsType}` : `: ${tsType}`);
      }

      // Parse relationship fields
      const relationMatch = line.match(/^\s*(\w+)\s+(\w+)(\[\])?\s*@relation/);
      if (relationMatch) {
        const [_, name, type, isArray] = relationMatch;
        fields.set(name, isArray ? `: ${type}[]` : `: ${type}`);
      }
    }

    typesOutput += `export interface ${modelName} {\n`;
    
    // Write fields in sorted order
    Array.from(fields.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([name, type]) => {
        typesOutput += `  ${name}${type};\n`;
      });

    typesOutput += '}\n\n';
  }

  // Parse enums
  const enumRegex = /enum\s+(\w+)\s*{([^}]+)}/g;
  let enumMatch;

  while ((enumMatch = enumRegex.exec(schemaContent)) !== null) {
    const enumName = enumMatch[1];
    const enumContent = enumMatch[2];

    typesOutput += `export enum ${enumName} {\n`;
    
    // Parse enum values
    const enumValues = enumContent.match(/^\s*(\w+)/gm) || [];
    enumValues.forEach(value => {
      typesOutput += `  ${value.trim()} = '${value.trim()}',\n`;
    });

    typesOutput += '}\n\n';
  }

  // Ensure the output directory exists
  const outputDir = join(process.cwd(), 'frontend', 'src', 'types');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write the generated types
  fs.writeFileSync(join(outputDir, 'prisma-types.ts'), typesOutput);
  console.log('Types generated successfully!');
}

function mapPrismaTypeToTS(prismaType: string): string {
  switch (prismaType.toLowerCase()) {
    case 'string':
    case 'text':
      return 'string';
    case 'int':
    case 'float':
    case 'decimal':
    case 'bigint':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'datetime':
      return 'Date';
    case 'json':
      return 'any';
    default:
      return prismaType;
  }
}

generateTypes(); 