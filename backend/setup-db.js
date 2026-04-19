#!/usr/bin/env node

/**
 * Cross-platform database setup script for Fabriq Base
 * This script initializes the database and loads essential metadata and demo data
 */

const { execSync } = require("child_process");
const path = require("path");
const os = require("os");
const readline = require("readline");
const fs = require("fs");
require("dotenv").config();

const isWindows = os.platform() === "win32";

function runPrismaSqlFile(sqlFilePath, label) {
  const schemaPath = path.join("prisma", "schema");
  const command = `npx prisma db execute --schema "${schemaPath}" --file "${sqlFilePath}"`;
  console.log(`Command: ${command}`);
  execSync(command, {
    stdio: "inherit",
    cwd: __dirname,
  });
  if (label) {
    console.log(`✅ ${label}`);
  }
}

function runPrismaSqlText(sqlText, label) {
  const tempSqlPath = path.join(
    os.tmpdir(),
    `fabriq-setup-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`
  );

  try {
    fs.writeFileSync(tempSqlPath, sqlText, "utf8");
    runPrismaSqlFile(tempSqlPath, label);
  } finally {
    try {
      fs.unlinkSync(tempSqlPath);
    } catch {
      // Ignore cleanup failures for temp files
    }
  }
}

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    runTests: true, // Default: run tests
    demoData: null, // null means prompt interactively
    demoDataOnly: false, // If true, skip steps 1-3 and only run demo data setup
    resetTransactions: false, // If true, only reset transaction/session data (no schema changes, no re-seed)
    envFile: null, // e.g. '.env.test' — load this instead of default .env
  };

  for (const arg of args) {
    if (arg.startsWith('--run-tests=')) {
      const value = arg.split('=')[1];
      config.runTests = value !== '0';
    } else if (arg === '--skip-tests' || arg === '--no-tests') {
      config.runTests = false;
    } else if (arg === '--reset-transactions' || arg === '--reset-tx') {
      config.resetTransactions = true;
      config.demoDataOnly = true; // implies no schema changes
      config.runTests = false;
    } else if (arg.startsWith('--env=') || arg.startsWith('--env-file=')) {
      const val = arg.split('=').slice(1).join('=');
      // Accept shorthands: 'test' → '.env.test'
      config.envFile = val.startsWith('.') ? val : `.env.${val}`;
    } else if (arg === '--demo-data-only' || arg === '--org-only') {
      config.demoDataOnly = true;
    } else if (arg.startsWith('--demo-data=')) {
      const value = arg.split('=')[1].toLowerCase();
      // Map various input formats to numeric choice
      if (value === '1' || value === 'indian-demo' || value === 'indian' || value === 'in') {
        config.demoData = '1';
      } else if (value === '2' || value === 'us-ca-demo' || value === 'us-ca' || value === 'usca') {
        config.demoData = '2';
      } else if (value === '3' || value === 'perfin-demo' || value === 'perfin' || value === 'personal-finance') {
        config.demoData = '3';
      } else if (value === '4' || value === 'both' || value === 'indian-and-us' || value === 'indian-us') {
        config.demoData = '4';
      } else if (value === '5' || value === 'nri' || value === 'nri-demo' || value === 'rajesh') {
        config.demoData = '5';
      } else if (value === '0' || value === 'skip' || value === 'none') {
        config.demoData = '0';
      } else {
        console.log(`⚠️  Unknown demo data option: ${value}`);
        console.log('   Valid options: indian-demo, us-ca-demo, perfin-demo, both, nri, skip');
        console.log('   Falling back to interactive prompt...');
      }
    }
  }

  return config;
}

/** Host, port (if non-default), and database name — safe to log (no user/password). */
function describeDatabaseTarget(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    const host = u.hostname || "(unknown)";
    const port = u.port ? `:${u.port}` : "";
    const path = (u.pathname || "").replace(/^\//, "");
    const database = path ? decodeURIComponent(path.split("/")[0]) : "(default)";
    return `${host}${port} / ${database}`;
  } catch {
    return "(could not parse DATABASE_URL)";
  }
}

// Function to get user input
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const config = parseArgs();

  // Override DATABASE_URL from an alternate env file (e.g. .env.test) if requested.
  // Must happen before any process.env.DATABASE_URL read below.
  if (config.envFile) {
    const envFilePath = path.resolve(__dirname, config.envFile);
    if (!fs.existsSync(envFilePath)) {
      console.error(`❌ Env file not found: ${envFilePath}`);
      process.exit(1);
    }
    require("dotenv").config({ path: envFilePath, override: true });
    console.log(`🔧 Loaded env from: ${config.envFile}`);
  }

  try {
    // Update header message based on mode
    if (config.demoDataOnly) {
      console.log("🚀 Fabriq Base - Demo Data Setup Only");
      console.log("=====================================");
    } else {
      console.log("🚀 Fabriq Base Database Setup");
      console.log("==============================");
    }
    console.log(`Running on: ${os.platform()} (${os.arch()})`);
    console.log(`Node.js version: ${process.version}`);
    console.log("");

    // Get database URL for SQL file execution
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const databaseTargetLog = describeDatabaseTarget(databaseUrl);

    // Skip steps 1-3 if --demo-data-only flag is set
    if (!config.demoDataOnly) {
      // Step 0.5: Validate Prisma schema before pushing
      console.log("🔍 Step 0.5: Validating Prisma schema...");
      console.log("Command: npx prisma validate");

      try {
        execSync("npx prisma validate", {
          stdio: "inherit",
          cwd: __dirname,
        });
        console.log("✅ Schema validation passed");
      } catch (error) {
        console.error("❌ Schema validation failed!");
        console.error("   Please fix schema errors before continuing");
        throw error;
      }
      console.log("");

      // Step 1: Reset database schema
      console.log("📊 Step 1: Resetting database schema...");
      console.log(
        "Command: npx prisma db push --force-reset --accept-data-loss"
      );

      execSync(
        "npx prisma db push --force-reset --accept-data-loss",
        {
          stdio: "inherit",
          cwd: __dirname,
        }
      );

      console.log("✅ Database schema reset complete");
      console.log("");

      // Step 1.25: Generate Prisma Client to ensure it's in sync with the database schema
      console.log("🔧 Step 1.25: Generating Prisma Client...");
      console.log("Command: npx prisma generate");

      execSync("npx prisma generate", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ Prisma Client generated successfully");
      console.log("");

      // Step 1.5: Load database functions
      console.log("⚙️  Step 1.5: Loading database functions...");
      const functionsSqlPath = path.join(
        __dirname,
        "prisma",
        "functions.sql"
      );

      if (fs.existsSync(functionsSqlPath)) {
        console.log(`Target: ${databaseTargetLog}`);
        try {
          runPrismaSqlFile(functionsSqlPath, "Database functions loaded successfully");
          console.log("✅ Database functions loaded successfully");
        } catch (error) {
          console.error("⚠️  Error loading database functions:", error.message);
          console.log("   Continuing setup...");
        }
      } else {
        console.log(`⚠️  Functions SQL file not found at: ${functionsSqlPath}`);
        console.log("   Skipping functions loading...");
      }
      console.log("");

      // Step 1.6: Setup Fabriq source system
      console.log("🔗 Step 1.6: Setting up Fabriq source system...");
      const fabriqSourceSystemSqlPath = path.join(
        __dirname,
        "prisma",
        "setup-fabriq-source-system.sql"
      );

      if (fs.existsSync(fabriqSourceSystemSqlPath)) {
        console.log(`Target: ${databaseTargetLog}`);
        try {
          runPrismaSqlFile(
            fabriqSourceSystemSqlPath,
            "Fabriq source system setup complete"
          );
          console.log("✅ Fabriq source system setup complete");
        } catch (error) {
          console.error("⚠️  Error setting up Fabriq source system:", error.message);
          console.log("   Continuing setup...");
        }
      } else {
        console.log(`⚠️  Fabriq source system SQL file not found at: ${fabriqSourceSystemSqlPath}`);
        console.log("   Skipping Fabriq source system setup...");
      }
      console.log("");

      // Step 1.7: Seed global currencies
      console.log("💱 Step 1.7: Seeding global currencies...");
      const seedCurrenciesSqlPath = path.join(
        __dirname,
        "prisma",
        "seed-currencies.sql"
      );

      if (fs.existsSync(seedCurrenciesSqlPath)) {
        console.log(`Target: ${databaseTargetLog}`);
        try {
          runPrismaSqlFile(seedCurrenciesSqlPath, "Global currencies seeded");
          console.log("✅ Global currencies seeded successfully");
        } catch (error) {
          console.error("⚠️  Error seeding currencies:", error.message);
          console.log("   Continuing setup...");
        }
      } else {
        console.log(`⚠️  Currency SQL file not found at: ${seedCurrenciesSqlPath}`);
        console.log("   Skipping currency seed...");
      }
      console.log("");

      // Step 2: Setup metadata (roles, views, permissions)
      console.log("👥 Step 2: Setting up metadata...");
      console.log("Command: npx ts-node prisma/setup-metadata.ts");

      execSync("npx ts-node prisma/setup-metadata.ts", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ Metadata setup complete");
      console.log("");

      // Step 3: Setup workflows
      console.log("🔄 Step 3: Setting up workflows...");
      console.log("Command: npx ts-node prisma/setup-workflows.ts");

      execSync("npx ts-node prisma/setup-workflows.ts", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ Workflow setup complete");
      console.log("");

      // Step 3.5: Seed system agent templates (metadata; ON CONFLICT upsert in SQL)
      console.log("🤖 Step 3.5: Seeding system agent templates...");
      const seedAgentTemplatesSqlPath = path.join(
        __dirname,
        "prisma",
        "seed-agent-templates.sql"
      );

      if (fs.existsSync(seedAgentTemplatesSqlPath)) {
        console.log(`Target: ${databaseTargetLog}`);
        try {
          runPrismaSqlFile(
            seedAgentTemplatesSqlPath,
            "Agent templates seeded successfully"
          );
          console.log("✅ Agent templates seeded successfully");
        } catch (error) {
          console.error("⚠️  Error seeding agent templates:", error.message);
          console.log("   Continuing setup...");
        }
      } else {
        console.log(
          `⚠️  Agent templates SQL file not found at: ${seedAgentTemplatesSqlPath}`
        );
        console.log("   Skipping agent template seed...");
      }
      console.log("");

      console.log("🎉 Core database setup completed successfully!");
      console.log("");
    } else {
      console.log("⏭️  Skipping core database setup (--demo-data-only mode)");
      console.log("");
      console.log("🔒 SAFETY: No DDL changes will be made to the database");
      console.log("   - No schema changes (tables, columns, constraints)");
      console.log("   - No database functions will be modified");
      console.log("   - Only data operations (INSERT/UPDATE) will be performed");
      console.log("");

      // In demo-data-only mode, ensure Prisma Client is in sync with existing database
      // NOTE: prisma generate only generates TypeScript code - it does NOT modify the database
      console.log("🔧 Generating Prisma Client to sync with existing database...");
      console.log("   (This only generates TypeScript code - no database changes)");
      console.log("Command: npx prisma generate");

      execSync("npx prisma generate", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ Prisma Client generated successfully");
      console.log("");
    }

    // ── Reset transactions mode ────────────────────────────────────────────
    // Clears AI categorisation state, agent session data, and (for Indian demo)
    // reconciliation state on demo postings. Does NOT re-seed or change schema.
    if (config.resetTransactions) {
      console.log("🔄 Reset Transaction Data");
      console.log("=========================");
      console.log("This will:");
      console.log("  - Clear ai_cat_score / ai_categorized_at on all postings");
      console.log("  - Delete all agent sessions (messages, traces, pending actions)");
      console.log("  - For Indian demo: restore reconciliation demo postings to seeded state");
      console.log("");

      // Resolve which demo(s) to reset — prompt if not specified
      let resetChoice = config.demoData;
      if (resetChoice === null) {
        console.log("Which demo dataset do you want to reset?");
        console.log("1. Indian Demo  2. US-CA Demo  3. Personal Finance  4. Both Indian & US-CA  5. NRI");
        console.log("0. Skip (only clear AI fields + agent sessions)");
        console.log("");
        while (true) {
          const answer = await askQuestion('Enter choice (0-5): ');
          if (['0', '1', '2', '3', '4', '5'].includes(answer)) { resetChoice = answer; break; }
          console.log('Invalid choice.');
        }
      }

      // 1. Clear AI categorisation fields on all postings
      console.log("\n🤖 Clearing AI categorisation state on all postings...");
      try {
        runPrismaSqlText(
          "UPDATE posting SET ai_cat_score = NULL, ai_categorized_at = NULL WHERE ai_cat_score IS NOT NULL OR ai_categorized_at IS NOT NULL;",
          "AI categorisation fields cleared"
        );
        console.log("  ✓ AI categorisation fields cleared");
      } catch (e) {
        console.warn("  ⚠️  Could not clear AI fields:", e.message);
      }

      // 2. Delete all agent session data (cascading)
      console.log("\n🗑️  Deleting agent session data...");
      try {
        runPrismaSqlText(
          "DELETE FROM pending_action WHERE session_id IN (SELECT id FROM agent_session); DELETE FROM agent_message WHERE session_id IN (SELECT id FROM agent_session); DELETE FROM llm_trace WHERE session_id IN (SELECT id FROM agent_session); DELETE FROM agent_session;",
          "Agent sessions cleared"
        );
        console.log("  ✓ Agent sessions cleared");
      } catch (e) {
        console.warn("  ⚠️  Could not delete agent sessions:", e.message);
      }

      // 3. For Indian demo: drop ALL postings and re-create from CSV (uncategorized, unreconciled)
      if (resetChoice === '1' || resetChoice === '4') {
        console.log("\n🇮🇳 Dropping and re-creating Indian demo postings from CSV...");
        execSync("cd prisma/setup-IN && npx ts-node setup-indian-demo.ts --reset-postings-full", {
          stdio: "inherit",
          cwd: __dirname,
        });
      }

      console.log("\n✅ Transaction data reset complete.");
      console.log("");
      process.exit(0);
    }
    // ── End reset transactions mode ────────────────────────────────────────

    // Step 4: Demo data selection (from args or interactive)
    let choice = config.demoData;

    if (choice === null) {
      // Interactive prompt if not provided via command line
      console.log("📦 Demo Data Setup");
      console.log("==================");
      console.log("Choose demo data to load:");
      console.log("1. Indian Demo Data (₹ INR, Mumbai/Bangalore companies)");
      console.log("2. US-CA Demo Data ($ USD, San Francisco tech companies)");
      console.log(
        "3. Personal Finance Demo Data ($ USD, Personal finance management)"
      );
      console.log("4. Both Indian and US-CA Demo Data");
      console.log("5. NRI Personal Finance (CAD/INR, Canada & India)");
      console.log("0. Skip demo data (setup complete)");
      console.log("");

      while (true) {
        const answer = await askQuestion('Enter your choice (1, 2, 3, 4, 5, or 0): ');

        if (answer === '1' || answer === '2' || answer === '3' || answer === '4' || answer === '5' || answer === '0') {
          choice = answer;
          break;
        } else {
          console.log('❌ Invalid choice. Please enter 1, 2, 3, 4, 5, or 0.');
        }
      }
    } else {
      console.log('📦 Demo Data Setup');
      console.log('==================');
      console.log(`Using demo data from command line: ${config.demoData}`);
      console.log('');
    }

    const stepNumber = config.demoDataOnly ? "1" : "4";

    if (choice === "1") {
      console.log("");
      console.log(`🇮🇳 Step ${stepNumber}: Setting up Indian demo data...`);
      console.log(
        "Command: cd prisma/setup-IN && npx ts-node setup-indian-demo.ts"
      );

      execSync("cd prisma/setup-IN && npx ts-node setup-indian-demo.ts", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ Indian demo data setup complete");
    } else if (choice === "2") {
      console.log("");
      console.log(`🇺🇸 Step ${stepNumber}: Setting up US-CA demo data...`);
      console.log(
        "Command: cd prisma/setup-US_CA && npx ts-node setup-us-ca-demo.ts"
      );

      execSync("cd prisma/setup-US_CA && npx ts-node setup-us-ca-demo.ts", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ US-CA demo data setup complete");
    } else if (choice === "3") {
      console.log("");
      console.log(`💰 Step ${stepNumber}: Setting up Personal Finance demo data...`);
      console.log(
        "Command: cd prisma/setup-PERFIN && npx ts-node setup-perfin-demo.ts"
      );

      execSync("cd prisma/setup-PERFIN && npx ts-node setup-perfin-demo.ts", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ Personal Finance demo data setup complete");
    } else if (choice === "4") {
      console.log("");
      console.log(`🌍 Step ${stepNumber}: Setting up both Indian and US-CA demo data...`);

      // Setup Indian demo data
      console.log("");
      console.log(`🇮🇳 Setting up Indian demo data...`);
      console.log(
        "Command: cd prisma/setup-IN && npx ts-node setup-indian-demo.ts"
      );

      execSync("cd prisma/setup-IN && npx ts-node setup-indian-demo.ts", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ Indian demo data setup complete");

      // Setup US-CA demo data
      console.log("");
      console.log(`🇺🇸 Setting up US-CA demo data...`);
      console.log(
        "Command: cd prisma/setup-US_CA && npx ts-node setup-us-ca-demo.ts"
      );

      execSync("cd prisma/setup-US_CA && npx ts-node setup-us-ca-demo.ts", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ US-CA demo data setup complete");
      console.log("");
      console.log("✅ Both Indian and US-CA demo data setup complete");
    } else if (choice === "5") {
      console.log("");
      console.log(`🏠 Step ${stepNumber}: Setting up NRI Personal Finance demo data...`);
      console.log(
        "Command: cd prisma/setup-NRI && npx ts-node setup-nri-demo.ts"
      );

      execSync("cd prisma/setup-NRI && npx ts-node setup-nri-demo.ts", {
        stdio: "inherit",
        cwd: __dirname,
      });

      console.log("✅ NRI Personal Finance demo data setup complete");
    } else {
      console.log("");
      console.log("⏭️  Skipping demo data setup");
    }

    // Step 5: Run test cases from src/__tests__ (skip in demo-data-only mode)
    if (!config.demoDataOnly && config.runTests) {
      console.log("");
      console.log("🧪 Step 5: Running test cases...");
      console.log("Command: npm test -- src/__tests__");
      console.log("");

      try {
        execSync('npm test -- src/__tests__', {
          stdio: 'inherit',
          cwd: __dirname
        });
        console.log('');
        console.log('✅ All tests passed!');
      } catch (error) {
        console.log('');
        console.log('⚠️  Some tests failed. This is normal if the database needs additional configuration.');
        console.log('   You can run tests manually later with: npm test -- src/__tests__');
      }
    } else if (!config.demoDataOnly && !config.runTests) {
      console.log('');
      console.log('⏭️  Skipping test execution (--run-tests=0 specified)');
    }

    console.log("");
    console.log("🎉 Setup completed successfully!");
    console.log("");
    if (!config.demoDataOnly) {
      console.log("🚀 Start the application:");
      console.log("npm run dev");
      console.log("");
      console.log("🌐 Access points:");
      console.log("- Frontend: http://localhost:3000");
      console.log("- API: http://localhost:4000");
      console.log("");
      console.log("🧪 Run tests manually:");
      console.log("- All tests: npm test");
      console.log("- Tests in src/__tests__: npm test -- src/__tests__");
    }
  } catch (error) {
    console.error("❌ Database setup failed!");
    console.error("Error:", error.message);
    console.log("");
    console.log("🔧 Troubleshooting:");
    console.log("1. Ensure PostgreSQL is running and DATABASE_URL is set");
    console.log(
      "2. Check that all required Node.js dependencies are installed"
    );
    console.log(
      "3. Verify that TypeScript compilation works: npx tsc --noEmit"
    );
    console.log(
      '4. Check database connection: npx prisma db execute --file <(echo "SELECT 1")'
    );
    console.log("");
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});