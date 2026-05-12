import { Request, Response } from 'express';
import prismaClient from '../../../lib/prisma';
import { customActionRegistry } from '../../../rest/customActionRegistry';
import { SystemDataLayer } from '../../dal/SystemDataLayer';
import { createMigrationJournal, deleteMigrationJournal, getMigrationJournalStatus } from './MigrationJournalService';
import { importMigrationJournalFromCsv } from './MigrationJournalCsvParser';
import logger from '../../../utils/logger';

function makeSDL(req: Request): SystemDataLayer | null {
  const context = (req as any).context?.auth;
  if (!context?.user) return null;
  return new SystemDataLayer(prismaClient, context.user.org_id, context.user.id);
}

// POST /api/setup/custom/migration-journal
customActionRegistry.register('setup', 'migration-journal', async (req: Request, res: Response) => {
  const sdl = makeSDL(req);
  if (!sdl) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const { legal_entity_id, migration_date, rows, replace = false } = req.body ?? {};

    if (!legal_entity_id) { res.status(400).json({ error: 'legal_entity_id is required' }); return; }
    if (!migration_date) { res.status(400).json({ error: 'migration_date is required (YYYY-MM-DD)' }); return; }
    if (!Array.isArray(rows) || !rows.length) {
      res.status(400).json({ error: 'rows must be a non-empty array of {account_id, balance}' });
      return;
    }

    const result = await createMigrationJournal(sdl, { legal_entity_id, migration_date, rows, replace });
    res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error('migration-journal create error', { error: err?.message });
    const status = err?.message?.includes('already exist') ? 409 : 400;
    res.status(status).json({ error: err?.message ?? 'Unexpected error' });
  }
});

// POST /api/setup/custom/migration-journal-csv
customActionRegistry.register('setup', 'migration-journal-csv', async (req: Request, res: Response) => {
  const sdl = makeSDL(req);
  if (!sdl) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const files = (req as any).files as Express.Multer.File[] | undefined;
  const file: Express.Multer.File | undefined = files?.[0] ?? (req as any).file;
  if (!file) { res.status(400).json({ error: 'file is required (CSV)' }); return; }

  const { legal_entity_id, migration_date, replace } = req.body ?? {};
  if (!legal_entity_id || !migration_date) {
    res.status(400).json({ error: 'legal_entity_id and migration_date are required' });
    return;
  }

  try {
    const csvText = file.buffer.toString('utf-8');
    const result = await importMigrationJournalFromCsv(
      sdl,
      csvText,
      legal_entity_id,
      migration_date,
      replace === 'true' || replace === true
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error('migration-journal-csv error', { error: err?.message });
    res.status(400).json({ error: err?.message ?? 'Unexpected error' });
  }
});

// POST /api/setup/custom/migration-journal-status
customActionRegistry.register('setup', 'migration-journal-status', async (req: Request, res: Response) => {
  const sdl = makeSDL(req);
  if (!sdl) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { legal_entity_id } = req.body ?? {};
  if (!legal_entity_id) { res.status(400).json({ error: 'legal_entity_id is required' }); return; }

  try {
    const status = await getMigrationJournalStatus(sdl, { legal_entity_id });
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Unexpected error' });
  }
});

// POST /api/setup/custom/migration-journal-delete
customActionRegistry.register('setup', 'migration-journal-delete', async (req: Request, res: Response) => {
  const sdl = makeSDL(req);
  if (!sdl) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { legal_entity_id, migration_date } = req.body ?? {};
  if (!legal_entity_id || !migration_date) {
    res.status(400).json({ error: 'legal_entity_id and migration_date are required' });
    return;
  }

  try {
    const result = await deleteMigrationJournal(sdl, { legal_entity_id, migration_date });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Unexpected error' });
  }
});
