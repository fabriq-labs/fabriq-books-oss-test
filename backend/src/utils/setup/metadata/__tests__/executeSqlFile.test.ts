import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeSqlFile } from '../executeSqlFile';

describe('executeSqlFile', () => {
  it('sends the file contents as one raw statement', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabriq-sql-'));
    const sqlPath = path.join(dir, 'seed.sql');
    fs.writeFileSync(sqlPath, '-- comment\nINSERT INTO t VALUES (1);\n');

    const executeRawUnsafe = jest.fn().mockResolvedValue(3);
    const prisma = { $executeRawUnsafe: executeRawUnsafe };

    await expect(executeSqlFile(prisma as any, sqlPath)).resolves.toBe(3);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(executeRawUnsafe.mock.calls[0][0]).toContain('INSERT INTO t VALUES (1);');
    expect(executeRawUnsafe.mock.calls[0]).toHaveLength(1);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws when the file is missing', async () => {
    const prisma = { $executeRawUnsafe: jest.fn() };
    await expect(executeSqlFile(prisma as any, '/tmp/does-not-exist-fabriq.sql')).rejects.toThrow(
      /SQL file not found/
    );
  });
});
