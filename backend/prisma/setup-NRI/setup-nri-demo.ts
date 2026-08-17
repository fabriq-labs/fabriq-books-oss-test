/**
 * CLI entry for `npx ts-node prisma/setup-NRI/setup-nri-demo.ts`.
 * Implementation lives under src/utils/setup so it shares prod schema types.
 */
export {
  setupNriDemo,
  ORG_ID,
  ENT_CA,
  ENT_IN,
  RAJESH_EMAIL,
} from '../../src/utils/setup/setupNriDemo';

if (require.main === module) {
  const { setupNriDemo } = require('../../src/utils/setup/setupNriDemo');
  setupNriDemo()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
