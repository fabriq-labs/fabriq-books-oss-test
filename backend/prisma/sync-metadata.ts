/**
 * Sync views and prompt templates from JSON (+ matching .txt for prompts).
 * Currencies / agent templates: `npm run seed-sql-metadata` (terminal only).
 * Usage: npm run sync-metadata
 */
export { main, type SyncMetadataResult, type SyncMetadataCounts } from '../src/utils/setup/metadata/syncMetadataFromJson';

import { main } from '../src/utils/setup/metadata/syncMetadataFromJson';

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
