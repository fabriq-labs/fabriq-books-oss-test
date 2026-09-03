import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeSqlFile, splitSqlStatements } from '../executeSqlFile';

describe('splitSqlStatements', () => {
  it('splits on semicolons outside dollar quotes', () => {
    const sql = `
-- comment
INSERT INTO t VALUES (1);
DELETE FROM t WHERE id = 1;
`;
    expect(splitSqlStatements(sql)).toEqual([
      'INSERT INTO t VALUES (1)',
      'DELETE FROM t WHERE id = 1',
    ]);
  });

  it('does not split on semicolons inside $$ quotes', () => {
    const sql = "INSERT INTO t (p) VALUES ($$a; b; c$$);";
    expect(splitSqlStatements(sql)).toEqual([
      'INSERT INTO t (p) VALUES ($$a; b; c$$)',
    ]);
  });
});

describe('executeSqlFile', () => {
  it('runs each statement separately', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabriq-sql-'));
    const sqlPath = path.join(dir, 'seed.sql');
    fs.writeFileSync(sqlPath, '-- comment\nINSERT INTO t VALUES (1);\nDELETE FROM t;\n');

    const executeRawUnsafe = jest.fn().mockResolvedValue(2);
    const prisma = { $executeRawUnsafe: executeRawUnsafe };

    await expect(executeSqlFile(prisma as any, sqlPath)).resolves.toBe(4);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(executeRawUnsafe.mock.calls[0][0]).toBe('INSERT INTO t VALUES (1)');
    expect(executeRawUnsafe.mock.calls[1][0]).toBe('DELETE FROM t');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws when the file is missing', async () => {
    const prisma = { $executeRawUnsafe: jest.fn() };
    await expect(executeSqlFile(prisma as any, '/tmp/does-not-exist-fabriq.sql')).rejects.toThrow(
      /SQL file not found/
    );
  });
});
