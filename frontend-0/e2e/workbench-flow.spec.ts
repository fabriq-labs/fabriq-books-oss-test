import { test, expect } from '@playwright/test';

test.describe('Workbench Session Flow E2E', () => {
  test('complete analytical session flow: create → auto-send → execute → report', async ({ page, context }) => {
    console.log('\n' + '='.repeat(80));
    console.log('WORKBENCH FLOW E2E TEST');
    console.log('='.repeat(80) + '\n');

    // ────────────────────────────────────────────────────────────────
    // STEP 0: Authenticate
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 0: Authenticate with backend');
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
    const loginResponse = await context.request.post(`${backendUrl}/api/auth/login`, {
      data: {
        email: 'sanjay.gupta@demo-india.com',
        password: 'Metalimits@123',
      },
    });

    if (!loginResponse.ok()) {
      throw new Error(`Login failed: ${loginResponse.status()}`);
    }

    const { token } = await loginResponse.json() as any;
    if (!token) {
      throw new Error('No token returned from login');
    }

    // Set the auth cookie
    await context.addCookies([
      {
        name: '__session',
        value: token,
        domain: 'localhost',
        path: '/',
      },
    ]);
    console.log('✓ Authenticated and cookie set\n');

    // ────────────────────────────────────────────────────────────────
    // STEP 1: Navigate to workbench
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 1: Navigate to /workbench');
    await page.goto('/workbench');
    await page.waitForLoadState('networkidle');
    console.log('✓ Workbench loaded\n');

    // ────────────────────────────────────────────────────────────────
    // STEP 2: Click "New Session" button
    // ────────────────────────────────────────────────────────────────
    console.log('\nSTEP 2: Click "New Session" button');
    const newSessionBtn = page.locator('button[title="New Session"]');
    await expect(newSessionBtn).toBeVisible({ timeout: 5000 });
    await newSessionBtn.click();
    await page.waitForTimeout(500);
    console.log('✓ New Session clicked\n');

    // ────────────────────────────────────────────────────────────────
    // STEP 3: Fill goal and create session
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 3: Fill goal input and submit');

    // Find goal input - look for "What should the agent do?"
    const goalInput = page.locator('input[placeholder*="agent" i]').first();
    await expect(goalInput).toBeVisible({ timeout: 5000 });

    const testGoal = 'find the banking account with max spending and in that get me the max spending category';
    await goalInput.fill(testGoal);
    console.log(`  Goal entered: "${testGoal}"`);

    // Select supervised mode (should be default, but let's be explicit)
    const supervisedRadio = page.locator('input[type="radio"][value="supervised"]');
    if (await supervisedRadio.isVisible().catch(() => false)) {
      await supervisedRadio.check();
      console.log('  Mode: supervised');
    }

    // Submit - find the button in the input row (has Send icon, should be next to input)
    const inputContainer = goalInput.locator('..'); // parent div
    const submitBtn = inputContainer.locator('button').first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();
    console.log('  Form submitted\n');

    // ────────────────────────────────────────────────────────────────
    // STEP 4: Wait for session creation and navigation
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 4: Wait for session creation and URL change');
    await page.waitForURL(/\/workbench\/sessions\/.+/, { timeout: 10000 });
    const sessionUrl = page.url();
    const sessionId = sessionUrl.split('/').pop();
    console.log(`✓ Session created and navigated to session page`);
    console.log(`  Session ID: ${sessionId}\n`);

    // ────────────────────────────────────────────────────────────────
    // STEP 5: Wait for auto-send AND message to appear
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 5: Wait for goal message to auto-send');
    console.log('  Waiting for message to appear in conversation panel...');

    // The message should appear as a user message (right-aligned, blue)
    const goalMessage = page.locator('text=/find the banking account/i').first();
    await expect(goalMessage).toBeVisible({ timeout: 15000 });

    // Check browser console for errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
      if (msg.text().includes('[ConversationPanel]') || msg.text().includes('[Polling]')) {
        console.log(`  Browser: ${msg.text()}`);
      }
    });

    console.log('✓ Goal message visible in conversation\n');

    // ────────────────────────────────────────────────────────────────
    // STEP 6: Wait for planning state and watch for status changes
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 6: Monitor planning state');
    const planningText = page.locator('text=Agent is creating a plan');

    // Should show planning state initially
    const isPlanningVisible = await planningText.isVisible({ timeout: 5000 }).catch(() => false);
    if (isPlanningVisible) {
      console.log('✓ Planning state detected');
    } else {
      console.log('⚠ Planning loader not found (may have progressed too fast)');
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 7: Wait for execution to complete (up to 2 minutes)
    // ────────────────────────────────────────────────────────────────
    console.log('\nSTEP 7: Wait for execution to complete');
    console.log('  Polling for status transitions...');

    // Wait for "Agent is working..." OR completion
    const executingText = page.locator('text=Agent is working');
    const completedText = page.locator('text=Session completed');

    let statusDetected = 'unknown';
    try {
      await Promise.race([
        executingText.waitFor({ timeout: 30000 }).then(() => { statusDetected = 'executing'; }),
        completedText.waitFor({ timeout: 30000 }).then(() => { statusDetected = 'completed'; }),
      ]).catch(() => { /* timeout is ok, we check below */ });
    } catch { /* ignore */ }

    console.log(`  Status detected: ${statusDetected}`);

    // Debug: Check actual session status from API
    console.log('  DEBUG: Checking session status from API...');
    const sessionStatus = await context.request.get(`${backendUrl}/api/agent/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${(await context.cookies()).find(c => c.name === '__session')?.value || ''}`,
      },
    });
    const sessionData = await sessionStatus.json() as any;
    console.log(`  Current session status: ${sessionData.data?.status}`);
    console.log(`  Plan: ${sessionData.data?.plan ? 'present' : 'null'}`);
    console.log(`  Current step index: ${sessionData.data?.current_step_index}`);

    // Now wait for completion
    if (statusDetected !== 'completed') {
      console.log('  Waiting for session completion (this may take 30-60 seconds)...');
      await expect(completedText).toBeVisible({ timeout: 120000 });
    }

    console.log('✓ Session completed\n');

    // ────────────────────────────────────────────────────────────────
    // STEP 8: Verify no stale loaders
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 8: Verify no stale loaders');
    const planningLoaderStillVisible = await planningText.isVisible().catch(() => false);
    const executingLoaderStillVisible = await executingText.isVisible().catch(() => false);

    if (!planningLoaderStillVisible && !executingLoaderStillVisible) {
      console.log('✓ No stale loaders present\n');
    } else {
      console.log('✗ PROBLEM: Stale loaders still visible!');
      if (planningLoaderStillVisible) console.log('  - Planning loader: VISIBLE');
      if (executingLoaderStillVisible) console.log('  - Executing loader: VISIBLE');
      console.log();
    }

    // ────────────────────────────────────────────────────────────────
    // STEP 9: Verify conversation is in panel
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 9: Verify conversation panel content');
    const conversationHeader = page.locator('text=Conversation').first();
    await expect(conversationHeader).toBeVisible();

    // Count visible messages
    const messages = page.locator('[class*="flex"][class*="col"]')
      .filter({ hasText: /find the banking|Agent|max spending|category/ });
    const messageCount = await messages.count();
    console.log(`✓ Conversation panel visible with ${messageCount} message(s)\n`);

    // ────────────────────────────────────────────────────────────────
    // STEP 10: Verify plan and report
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 10: Verify plan steps and report');
    const reportKeywords = page.locator('text=/report|spending|category|account/i');
    const reportCount = await reportKeywords.count();
    console.log(`✓ Found ${reportCount} report-related text elements\n`);

    // ────────────────────────────────────────────────────────────────
    // STEP 11: Test conversation persistence
    // ────────────────────────────────────────────────────────────────
    console.log('STEP 11: Test conversation persistence across navigation');

    // Get initial message count
    const initialMessages = await messages.count();
    console.log(`  Messages before navigation: ${initialMessages}`);

    // Navigate away
    await page.goto('/');
    await page.waitForTimeout(1000);
    console.log('  Navigated away from session');

    // Navigate back
    await page.goto(`/workbench/sessions/${sessionId}`);
    await page.waitForLoadState('networkidle');

    // Wait a bit for messages to load
    await page.waitForTimeout(2000);

    // Check messages again
    const finalMessages = await messages.count();
    console.log(`  Messages after navigation: ${finalMessages}`);

    if (finalMessages > 0) {
      console.log('✓ Conversation persisted correctly\n');
    } else {
      console.log('✗ PROBLEM: Conversation was lost after navigation!\n');
    }

    // ────────────────────────────────────────────────────────────────
    // SUMMARY
    // ────────────────────────────────────────────────────────────────
    console.log('='.repeat(80));
    console.log('TEST COMPLETE');
    console.log('='.repeat(80) + '\n');
  });
});
