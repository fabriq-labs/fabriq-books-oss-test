import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { runSeedAgentModelToolsSql } from './seedAgentModelToolsSql';
import { runSeedAgentTemplatesSql } from './seedAgentTemplatesSql';
import { runSeedCurrenciesSql } from './seedCurrenciesSql';
import { resolveSyncTargets, type SyncMetadataTarget } from './syncMetadataTargets';

const prisma = new PrismaClient();

function getBackendRootDir(): string {
  // dist/utils/setup/metadata/*.js or src/utils/setup/metadata/*.ts → backend root
  return path.resolve(__dirname, '..', '..', '..', '..');
}

export interface SyncMetadataCounts {
  created: number;
  updated: number;
  errors: number;
}

export interface SqlSeedCounts {
  rowsAffected: number;
  errors: number;
}

export interface SyncMetadataResult {
  views: SyncMetadataCounts;
  promptTemplates: SyncMetadataCounts;
  agentTemplates: SqlSeedCounts;
  currencies: SqlSeedCounts;
  agentModelTools: SqlSeedCounts;
}

export type { SyncMetadataTarget };

export async function main(
  filterType?: 'view' | 'prompttemplate' | { targets?: unknown }
): Promise<SyncMetadataResult> {
  const emptyCounts = (): SyncMetadataCounts => ({
    created: 0,
    updated: 0,
    errors: 0,
  });
  const emptySql = (): SqlSeedCounts => ({
    rowsAffected: 0,
    errors: 0,
  });

  const result: SyncMetadataResult = {
    views: emptyCounts(),
    promptTemplates: emptyCounts(),
    agentTemplates: emptySql(),
    currencies: emptySql(),
    agentModelTools: emptySql(),
  };

  try {
    const backendRoot = getBackendRootDir();
    const targets = resolveSyncTargets(filterType);
    const shouldSyncViews = targets.includes('views');
    const shouldSyncTemplates = targets.includes('promptTemplates');

    let viewsCreatedCount = 0;
    let viewsUpdatedCount = 0;
    let viewsErrorCount = 0;
    let templatesCreatedCount = 0;
    let templatesUpdatedCount = 0;
    let templatesErrorCount = 0;

    console.log('🔄 Syncing metadata from JSON files to local database...');
    console.log('');

    if (shouldSyncViews) {
      console.log('📋 Syncing views...');
      const viewsDir = path.join(backendRoot, 'prisma', 'metadata', 'views');

      if (fs.existsSync(viewsDir)) {
        const files = fs.readdirSync(viewsDir).filter((file) => file.endsWith('.json'));

        if (files.length > 0) {
          console.log(`Found ${files.length} view files to sync`);
          console.log('');

          for (const file of files) {
            const filepath = path.join(viewsDir, file);

            try {
              const fileContent = fs.readFileSync(filepath, 'utf-8');
              const viewData = JSON.parse(fileContent);

              if (!viewData.name || !viewData.model_name) {
                console.log(`  ⚠️  Skipping ${file}: missing name or model_name`);
                viewsErrorCount++;
                continue;
              }

              let existingView: any = null;
              if (viewData.id) {
                existingView = await prisma.view.findUnique({
                  where: { id: viewData.id },
                });
              }

              if (!existingView) {
                existingView = await prisma.view.findFirst({
                  where: {
                    name: viewData.name,
                    model_name: viewData.model_name,
                  },
                });
              }

              const upsertData: any = {
                name: viewData.name,
                model_name: viewData.model_name,
                description: viewData.description || null,
                data_graph: viewData.data_graph || null,
                org_id: viewData.org_id || null,
                created_by: viewData.created_by || null,
                modified_by: viewData.modified_by || null,
              };

              if (existingView) {
                await prisma.view.update({
                  where: { id: existingView.id },
                  data: upsertData,
                });
                viewsUpdatedCount++;
                console.log(`  ✓ Updated view: ${viewData.model_name}.${viewData.name}`);
              } else {
                if (viewData.id) {
                  upsertData.id = viewData.id;
                }
                await prisma.view.create({
                  data: upsertData,
                });
                viewsCreatedCount++;
                console.log(`  ✓ Created view: ${viewData.model_name}.${viewData.name}`);
              }
            } catch (error) {
              console.error(`  ❌ Error processing ${file}:`, error);
              viewsErrorCount++;
            }
          }
        } else {
          console.log('  ⚠️  No view JSON files found');
        }
      } else {
        console.log('  ⚠️  Views directory not found, skipping...');
      }

      console.log('');
      console.log(`✅ Views sync complete! Created: ${viewsCreatedCount}, Updated: ${viewsUpdatedCount}`);
      if (viewsErrorCount > 0) {
        console.log(`   Errors: ${viewsErrorCount}`);
      }
      console.log('');
    }

    if (shouldSyncTemplates) {
      console.log('📝 Syncing prompt templates...');
      const templatesDir = path.join(backendRoot, 'prisma', 'metadata', 'prompt-templates');

      if (fs.existsSync(templatesDir)) {
        const files = fs.readdirSync(templatesDir).filter((file) => file.endsWith('.json'));

        if (files.length > 0) {
          console.log(`Found ${files.length} prompt template files to sync`);
          console.log('');

          for (const file of files) {
            const filepath = path.join(templatesDir, file);

            try {
              const fileContent = fs.readFileSync(filepath, 'utf-8');
              const templateData = JSON.parse(fileContent);

              if (!templateData.view_id || !templateData.prompt_type) {
                console.log(`  ⚠️  Skipping ${file}: missing view_id or prompt_type`);
                templatesErrorCount++;
                continue;
              }

              const baseName = file.replace(/\.json$/, '');
              const txtFilepath = path.join(templatesDir, `${baseName}.txt`);

              let promptText = '';
              if (fs.existsSync(txtFilepath)) {
                promptText = fs.readFileSync(txtFilepath, 'utf-8');
              } else {
                console.log(`  ⚠️  Warning: ${baseName}.txt not found, using empty prompt_text`);
              }

              let existingTemplate: any = null;
              if (templateData.id) {
                existingTemplate = await prisma.prompt_template.findUnique({
                  where: { id: templateData.id },
                });
              }

              if (!existingTemplate) {
                const whereClause: any = {
                  view_id: templateData.view_id,
                  prompt_type: templateData.prompt_type,
                };
                if (templateData.app_name) {
                  whereClause.app_name = templateData.app_name;
                } else {
                  whereClause.app_name = null;
                }
                existingTemplate = await prisma.prompt_template.findFirst({
                  where: whereClause,
                });
              }

              const upsertData: any = {
                view_id: templateData.view_id,
                prompt_type: templateData.prompt_type,
                prompt_text: promptText,
                is_default: templateData.is_default ?? false,
                version: templateData.version ?? 1,
                priority: templateData.priority ?? 0,
                context: templateData.context || null,
                created_by: templateData.created_by || null,
                modified_by: templateData.modified_by || null,
                org_id: templateData.org_id || null,
                app_name: templateData.app_name || null,
              };

              if (existingTemplate) {
                await prisma.prompt_template.update({
                  where: { id: existingTemplate.id },
                  data: upsertData,
                });
                templatesUpdatedCount++;
                console.log(`  ✓ Updated template: ${templateData.view_id}.${templateData.prompt_type}`);
              } else {
                if (templateData.id) {
                  upsertData.id = templateData.id;
                }
                await prisma.prompt_template.create({
                  data: upsertData,
                });
                templatesCreatedCount++;
                console.log(`  ✓ Created template: ${templateData.view_id}.${templateData.prompt_type}`);
              }
            } catch (error) {
              console.error(`  ❌ Error processing ${file}:`, error);
              templatesErrorCount++;
            }
          }
        } else {
          console.log('  ⚠️  No prompt template JSON files found');
        }
      } else {
        console.log('  ⚠️  Prompt templates directory not found, skipping...');
      }

      console.log('');
      console.log(
        `✅ Prompt templates sync complete! Created: ${templatesCreatedCount}, Updated: ${templatesUpdatedCount}`
      );
      if (templatesErrorCount > 0) {
        console.log(`   Errors: ${templatesErrorCount}`);
      }
      console.log('');
    }

    if (targets.includes('agentTemplates')) {
      console.log('🤖 Seeding agent templates...');
      try {
        result.agentTemplates.rowsAffected = await runSeedAgentTemplatesSql(backendRoot, prisma);
        console.log(`  ✓ Agent templates upserted (${result.agentTemplates.rowsAffected} rows)`);
      } catch (error) {
        console.error('  ❌ Error seeding agent templates:', error);
        result.agentTemplates.errors = 1;
        throw error;
      }
      console.log('');
    }

    if (targets.includes('currencies')) {
      console.log('💱 Seeding currencies...');
      try {
        result.currencies.rowsAffected = await runSeedCurrenciesSql(backendRoot, prisma);
        console.log(`  ✓ Currencies upserted (${result.currencies.rowsAffected} rows)`);
      } catch (error) {
        console.error('  ❌ Error seeding currencies:', error);
        result.currencies.errors = 1;
        throw error;
      }
      console.log('');
    }

    if (targets.includes('agentModelTools')) {
      console.log('🧰 Seeding agent model tools...');
      try {
        result.agentModelTools.rowsAffected = await runSeedAgentModelToolsSql(backendRoot, prisma);
        console.log(`  ✓ Agent model tools upserted (${result.agentModelTools.rowsAffected} rows)`);
      } catch (error) {
        console.error('  ❌ Error seeding agent model tools:', error);
        result.agentModelTools.errors = 1;
        throw error;
      }
      console.log('');
    }

    result.views = {
      created: shouldSyncViews ? viewsCreatedCount : 0,
      updated: shouldSyncViews ? viewsUpdatedCount : 0,
      errors: shouldSyncViews ? viewsErrorCount : 0,
    };
    result.promptTemplates = {
      created: shouldSyncTemplates ? templatesCreatedCount : 0,
      updated: shouldSyncTemplates ? templatesUpdatedCount : 0,
      errors: shouldSyncTemplates ? templatesErrorCount : 0,
    };

    console.log('✅ Metadata sync complete!');
    if (shouldSyncViews) {
      console.log(`   Views: ${viewsCreatedCount} created, ${viewsUpdatedCount} updated`);
    }
    if (shouldSyncTemplates) {
      console.log(`   Prompt Templates: ${templatesCreatedCount} created, ${templatesUpdatedCount} updated`);
    }
    if (targets.includes('agentTemplates')) {
      console.log(`   Agent templates: ${result.agentTemplates.rowsAffected} rows upserted`);
    }
    if (targets.includes('currencies')) {
      console.log(`   Currencies: ${result.currencies.rowsAffected} rows upserted`);
    }
    if (targets.includes('agentModelTools')) {
      console.log(`   Agent model tools: ${result.agentModelTools.rowsAffected} rows upserted`);
    }
    const totalErrors =
      result.views.errors +
      result.promptTemplates.errors +
      result.agentTemplates.errors +
      result.currencies.errors +
      result.agentModelTools.errors;
    if (totalErrors > 0) {
      console.log(`   Total Errors: ${totalErrors}`);
    }
    console.log('');

    return result;
  } catch (error) {
    console.error('❌ Error syncing metadata:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}
