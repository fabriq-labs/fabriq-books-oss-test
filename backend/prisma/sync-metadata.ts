/**
 * Sync views and prompt templates from JSON (+ matching .txt for prompts).
 * Optional SQL seeds (agent templates, currencies, model tools): pass `{ targets }`
 * or use Super Admin → Sync metadata. CLI default remains views + prompt templates.
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
