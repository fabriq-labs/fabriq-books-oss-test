/**
 * Sync views and prompt templates from JSON files, then apply prisma/seed-agent-templates.sql
 * (same order as setup-db after JSON metadata).
 * Usage: npm run sync-metadata
 */
export { main, type SyncMetadataResult, type SyncMetadataCounts } from '../src/metadata/syncMetadataFromJson';

import { main } from '../src/metadata/syncMetadataFromJson';

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
