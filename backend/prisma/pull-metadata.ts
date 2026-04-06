import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Pull views and prompt templates from production database and export to JSON files
 * Usage: PROD_DATABASE_URL="..." npm run pull-metadata
 * 
 * @param filterType - Optional filter: 'view' | 'prompttemplate' | undefined (both)
 */
async function main(filterType?: 'view' | 'prompttemplate') {
  const prodDatabaseUrl = process.env.PROD_DATABASE_URL;

  if (!prodDatabaseUrl) {
    console.error('❌ PROD_DATABASE_URL environment variable is not set');
    console.log('');
    console.log('Usage:');
    console.log('  PROD_DATABASE_URL="postgresql://user:password@host:port/database" npm run pull-metadata');
    process.exit(1);
  }

  console.log('📥 Pulling metadata from production database...');
  console.log('');

  // Create Prisma client with production database URL
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: prodDatabaseUrl,
      },
    },
  });

  try {
    const shouldPullViews = !filterType || filterType === 'view';
    const shouldPullTemplates = !filterType || filterType === 'prompttemplate';

    let viewsExportedCount = 0;
    let templatesExportedCount = 0;

    // ===== 1. PULL VIEWS =====
    if (shouldPullViews) {
      console.log('📋 Pulling views...');
      const views = await prisma.view.findMany({
        orderBy: [
          { model_name: 'asc' },
          { name: 'asc' },
        ],
      });

      console.log(`Found ${views.length} views in production database`);

      // Ensure views directory exists
      const viewsDir = path.join(__dirname, 'metadata', 'views');
      if (!fs.existsSync(viewsDir)) {
        fs.mkdirSync(viewsDir, { recursive: true });
      }

      for (const view of views) {
        // Generate filename: {model_name}_{view_name}.json
        const safeModelName = view.model_name.replace(/[^a-zA-Z0-9_]/g, '_');
        const safeViewName = view.name.replace(/[^a-zA-Z0-9_]/g, '_');
        const filename = `${safeModelName}_${safeViewName}.json`;
        const filepath = path.join(viewsDir, filename);

        // Prepare view data for export
        const viewData = {
          id: view.id,
          name: view.name,
          model_name: view.model_name,
          description: view.description || null,
          data_graph: view.data_graph,
          org_id: view.org_id || null,
          created_by: view.created_by || null,
          modified_by: view.modified_by || null,
        };

        // Write to file
        fs.writeFileSync(filepath, JSON.stringify(viewData, null, 2) + '\n');
        viewsExportedCount++;

        console.log(`  ✓ Exported view: ${filename}`);
      }

      console.log(`✅ Exported ${viewsExportedCount} views`);
      console.log('');
    }

    // ===== 2. PULL PROMPT TEMPLATES =====
    if (shouldPullTemplates) {
      console.log('📝 Pulling prompt templates...');
      const promptTemplates = await prisma.prompt_template.findMany({
        orderBy: [
          { view_id: 'asc' },
          { prompt_type: 'asc' },
        ],
      });

      console.log(`Found ${promptTemplates.length} prompt templates in production database`);

      // Ensure prompt-templates directory exists
      const templatesDir = path.join(__dirname, 'metadata', 'prompt-templates');
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
      }

      for (const template of promptTemplates) {
        // Generate filename: {view_id}_{prompt_type}_{app_name} (if app_name exists)
        const safeViewId = template.view_id.replace(/[^a-zA-Z0-9_]/g, '_');
        const safePromptType = template.prompt_type.replace(/[^a-zA-Z0-9_]/g, '_');
        const safeAppName = template.app_name ? template.app_name.replace(/[^a-zA-Z0-9_]/g, '_') : null;
        // Include app_name in filename if it exists to ensure uniqueness
        const baseName = safeAppName
          ? `${safeViewId}_${safePromptType}_${safeAppName}`
          : `${safeViewId}_${safePromptType}`;
        const jsonFilepath = path.join(templatesDir, `${baseName}.json`);
        const txtFilepath = path.join(templatesDir, `${baseName}.txt`);

        // Write prompt_text to separate .txt file for easy editing
        fs.writeFileSync(txtFilepath, template.prompt_text || '', 'utf-8');

        // Prepare template data for export (without prompt_text)
        const templateData = {
          id: template.id,
          view_id: template.view_id,
          prompt_type: template.prompt_type,
          is_default: template.is_default,
          version: template.version,
          priority: template.priority,
          context: template.context || null,
          created_by: template.created_by || null,
          modified_by: template.modified_by || null,
          org_id: template.org_id || null,
          app_name: template.app_name || null,
        };

        // Write JSON file (without prompt_text)
        fs.writeFileSync(jsonFilepath, JSON.stringify(templateData, null, 2) + '\n');
        templatesExportedCount++;

        console.log(`  ✓ Exported template: ${baseName}.json + ${baseName}.txt`);
      }

      console.log(`✅ Exported ${templatesExportedCount} prompt templates`);
      console.log('');
    }

    // Summary
    console.log('✅ Successfully exported metadata from production!');
    if (shouldPullViews) {
      console.log(`   Views: ${viewsExportedCount}`);
    }
    if (shouldPullTemplates) {
      console.log(`   Prompt Templates: ${templatesExportedCount}`);
    }
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the exported JSON files');
    console.log('  2. Run: npm run sync (to sync to local database)');
    console.log('  3. Commit changes to Git');

  } catch (error) {
    console.error('❌ Error pulling metadata from production:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { main };

