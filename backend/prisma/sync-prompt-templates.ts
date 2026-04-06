import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Sync prompt templates from JSON files to local database
 * Usage: npm run sync-prompt-templates
 */
async function main() {
  try {
    console.log('🔄 Syncing prompt templates from JSON files to local database...');
    console.log('');

    const templatesDir = path.join(__dirname, 'metadata', 'prompt-templates');

    if (!fs.existsSync(templatesDir)) {
      console.error(`❌ Prompt templates directory not found: ${templatesDir}`);
      console.log('');
      console.log('Please run: npm run pull-prompt-templates (to pull from production)');
      console.log('Or create the directory and add JSON files manually');
      process.exit(1);
    }

    // Read all JSON files
    const files = fs.readdirSync(templatesDir).filter(file => file.endsWith('.json'));

    if (files.length === 0) {
      console.log(`⚠️  No JSON files found in ${templatesDir}`);
      console.log('');
      console.log('Please run: npm run pull-prompt-templates (to pull from production)');
      process.exit(0);
    }

    console.log(`Found ${files.length} prompt template files to sync`);
    console.log('');

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const file of files) {
      const filepath = path.join(templatesDir, file);

      try {
        // Read and parse JSON file
        const fileContent = fs.readFileSync(filepath, 'utf-8');
        const templateData = JSON.parse(fileContent);

        // Validate required fields
        if (!templateData.view_id || !templateData.prompt_type) {
          console.log(`  ⚠️  Skipping ${file}: missing view_id or prompt_type`);
          errorCount++;
          continue;
        }

        // Read prompt_text from corresponding .txt file
        const baseName = file.replace(/\.json$/, '');
        const txtFilepath = path.join(templatesDir, `${baseName}.txt`);

        let promptText = '';
        if (fs.existsSync(txtFilepath)) {
          promptText = fs.readFileSync(txtFilepath, 'utf-8');
        } else {
          console.log(`  ⚠️  Warning: ${baseName}.txt not found, using empty prompt_text`);
        }

        // Find existing template by view_id + prompt_type + app_name + org_id
        const whereClause: any = {
          view_id: templateData.view_id,
          prompt_type: templateData.prompt_type,
        };

        // Include app_name in match if it exists (for uniqueness)
        if (templateData.app_name) {
          whereClause.app_name = templateData.app_name;
        } else {
          whereClause.app_name = null;
        }

        // Include org_id in match if it exists
        if (templateData.org_id) {
          whereClause.org_id = templateData.org_id;
        } else {
          whereClause.org_id = null;
        }

        const existingTemplate = await prisma.prompt_template.findFirst({
          where: whereClause,
        });

        // Prepare data for upsert
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
          // Update existing template
          await prisma.prompt_template.update({
            where: { id: existingTemplate.id },
            data: upsertData,
          });
          updatedCount++;
          console.log(`  ✓ Updated: ${templateData.view_id}.${templateData.prompt_type}`);
        } else {
          // Create new template (use provided ID if available, otherwise let DB generate)
          if (templateData.id) {
            upsertData.id = templateData.id;
          }
          await prisma.prompt_template.create({
            data: upsertData,
          });
          createdCount++;
          console.log(`  ✓ Created: ${templateData.view_id}.${templateData.prompt_type}`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing ${file}:`, error);
        errorCount++;
      }
    }

    console.log('');
    console.log('✅ Sync complete!');
    console.log(`   Created: ${createdCount}`);
    console.log(`   Updated: ${updatedCount}`);
    if (errorCount > 0) {
      console.log(`   Errors: ${errorCount}`);
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error syncing prompt templates:', error);
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

