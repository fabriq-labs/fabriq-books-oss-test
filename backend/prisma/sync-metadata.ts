/**
 * Sync views and prompt templates from JSON (+ matching .txt for prompts).
 * Optional SQL seeds (agent templates, currencies, model tools): pass `{ targets }`
 * or use Super Admin → Sync metadata. CLI default remains views + prompt templates.
 *
 * Sync only named views (skips prompt templates):
 *   npm run sync-metadata -- --views account_view,invoice_view
 */
export { main, type SyncMetadataResult, type SyncMetadataCounts } from '../src/utils/setup/metadata/syncMetadataFromJson';

import { parseSyncMetadataCliArgs } from '../src/utils/setup/metadata/syncMetadataTargets';
import { main } from '../src/utils/setup/metadata/syncMetadataFromJson';

if (require.main === module) {
  let request: { targets: ['views']; viewNames: string[] } | undefined;
  try {
    const { viewNames } = parseSyncMetadataCliArgs(process.argv.slice(2));
    if (viewNames) {
      request = { targets: ['views'], viewNames };
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  main(request)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
