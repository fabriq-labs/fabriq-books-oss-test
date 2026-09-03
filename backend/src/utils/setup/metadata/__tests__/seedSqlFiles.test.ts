import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.resolve(__dirname, '../../../../../');

describe('SQL seed files for Super Admin sync', () => {
  const files = [
    'prisma/seed-currencies.sql',
    'prisma/seed-agent-templates.sql',
    'prisma/seed-tax-package-template.sql',
    'prisma/seed-agent-model-tools.sql',
  ];

  it.each(files)('%s exists, upserts, and splits cleanly', (rel) => {
    const sql = fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
    expect(sql).toMatch(/INSERT INTO/i);
    expect(sql).toMatch(/ON CONFLICT/i);
    const { splitSqlStatements } = require('../executeSqlFile');
    const stmts = splitSqlStatements(sql);
    expect(stmts.length).toBeGreaterThanOrEqual(1);
    expect(stmts[0]).toMatch(/INSERT INTO/i);
  });
});
