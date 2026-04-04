# Workbench E2E Test Guide

This test validates the entire workbench session flow including:
- Session creation
- Auto-send of goal message
- Plan execution through stages (planning → executing → completed)
- Conversation display
- Conversation persistence across navigation

## Prerequisites

✅ **You must have these running before starting the test:**

1. **Backend API** on `http://localhost:4000`
   ```bash
   cd backend
   npm run dev
   ```
   - Database must have demo data loaded
   - LLM configured (set in .env.test: OPENROUTER or similar)
   - Test user must exist: `sanjay.gupta@demo-india.com` / `Metalimits@123`

2. **Frontend** will be started automatically by Playwright (no manual start needed)

## Running the Test

### ✅ Quickstart (Most Common)

**Terminal 1 — Start Backend:**
```bash
cd backend
npm run dev
```
Wait for it to say "Server running on port 4000"

**Terminal 2 — Run E2E Test:**
```bash
cd frontend-1
npm run test:e2e
```

That's it! The test will:
1. ✓ Authenticate with default credentials
2. ✓ Start the frontend dev server automatically
3. ✓ Run the complete workbench flow
4. ✓ Print detailed logs to console
5. ✓ Generate HTML report in `playwright-report/`

---

### Option 2: Run with debug UI (watch execution in real-time)
```bash
npm run test:e2e:debug
```

This opens Playwright Inspector where you can:
- Watch the test run step-by-step
- Pause and inspect DOM
- See network requests in real-time
- Take screenshots at any point

---

### Option 3: Run with custom backend URL
If your backend is on a different port:
```bash
BACKEND_URL=http://localhost:5000 npm run test:e2e
```

---

### Option 4: Manual backend startup (for debugging)
```bash
# Terminal 1: Start frontend server
cd frontend-1
npm run dev

# Terminal 2: Run tests (will use your running server)
npm run test:e2e
```

## What the Test Does

| Step | Action | Expected Result |
|------|--------|-----------------|
| 0 | Authenticate with backend API | JWT token obtained and cookie set |
| 1 | Navigate to /workbench | Workbench loads (no redirect to login) |
| 2 | Click "New Session" | Goal setter form appears |
| 3 | Fill goal & submit | Session created, URL changes to `/workbench/sessions/{sessionId}` |
| 4 | Wait for auto-send | Goal message appears in conversation panel |
| 5 | Wait for status transition | Shows "Agent is creating a plan..." then progresses |
| 6 | Wait for completion | "Session completed" message appears (may take 30-60 sec) |
| 7 | Verify loaders are gone | No stale "Agent is working..." spinner |
| 8 | Check conversation | Messages visible in right panel |
| 9 | Test persistence | Navigate away and back → conversation still there |

## Expected Timeline

- Steps 1-4: ~5-10 seconds
- Steps 5-6: ~30-90 seconds (depends on LLM API latency)
- Steps 7-9: ~5 seconds
- **Total: ~1-2 minutes**

## Reading the Output

The test produces detailed console logs that tell you exactly what's happening:

```
================================================================================
WORKBENCH FLOW E2E TEST
================================================================================

STEP 1: Navigate to /workbench
✓ Workbench loaded

STEP 2: Click "New Session" button
✓ New Session clicked

STEP 3: Fill goal input and submit
  Goal entered: "find the banking account..."
  Mode: supervised
  Form submitted

STEP 4: Wait for session creation and URL change
✓ Session created and navigated to session page
  Session ID: ses_xxxx-xxxx-xxxx

STEP 5: Wait for goal message to auto-send
  Waiting for message to appear in conversation panel...
✓ Goal message visible in conversation

STEP 6: Monitor planning state
✓ Planning state detected

STEP 7: Wait for execution to complete
  Polling for status transitions...
  Status detected: executing
  Waiting for session completion (this may take 30-60 seconds)...
✓ Session completed

STEP 8: Verify no stale loaders
✓ No stale loaders present

STEP 9: Verify conversation panel content
✓ Conversation panel visible with 4 message(s)

STEP 10: Verify plan steps and report
✓ Found 12 report-related text elements

STEP 11: Test conversation persistence across navigation
  Messages before navigation: 4
  Navigated away from session
  Messages after navigation: 4
✓ Conversation persisted correctly

================================================================================
TEST COMPLETE
================================================================================
```

## If the Test Fails

The test will show which step failed and why. Common failure points:

### ❌ "Goal message visible in conversation" fails
- **Likely cause**: Auto-send not working
- **Check**: Look at browser console logs for `[ConversationPanel] Auto-sending initial goal message`
- **Diagnosis**: The useEffect dependency array might be missing something

### ❌ "Session completed" never appears
- **Likely cause**: LLM not responding or status not updating
- **Check**:
  - Backend logs for LLM errors
  - Check `npm run dev` in backend for error output
  - Verify LLM_PROVIDER and LLM_MODEL are set in .env

### ❌ "No stale loaders present" fails
- **Cause**: Loader is still showing after session completed
- **Check**: Status transition might not be triggering UI update
- **Diagnosis**: Polling might not be updating activeSession in context

### ❌ "Conversation persisted" fails
- **Cause**: Messages disappeared after navigation
- **Check**: sessionAPI.getMessages() might not be fetching from DB
- **Diagnosis**: Backend might not be saving messages, or frontend not loading them

## Debugging Tips

### 1. Check Backend Logs
```bash
# In backend terminal
tail -f logs/agent.log
```

Look for:
- Message received: `"Handling agent request"`
- LLM calls: `"Calling generateText with..."`
- Session updates: `"Updated session..."`

### 2. Check Network Tab
In Playwright Inspector:
1. Run test in debug mode: `npm run test:e2e:debug`
2. Click "pause" at each step
3. Switch to "Network" tab
4. Look for API calls:
   - `POST /api/agent/sessions` — session creation
   - `POST /api/agent/chat/stream` — message sending
   - `GET /api/agent/sessions/{id}` — status polling
   - `GET /api/agent/sessions/{id}/messages` — message loading

### 3. Enable Verbose Logging
Add to playwright.config.ts:
```typescript
use: {
  // ... other options
  launchOptions: {
    args: ['--enable-features=NetworkService,NetworkServiceInProcess'],
  },
  logger: new ConsoleLogger(),
}
```

### 4. Screenshot on Failure
The test already saves screenshots in `test-results/` when failures occur.

## Updating the Test

If the workbench UI changes:
1. Update selectors in `e2e/workbench-flow.spec.ts`
2. Run test again
3. Check what locators no longer match

Common changes:
- Button text: `button:has-text("Old Text")` → `button:has-text("New Text")`
- Input labels: `[placeholder="old"]` → `[placeholder="new"]`
- Status messages: `text=/Agent is working/` → `text=/different message/`

## CI/CD Integration

To run on GitHub Actions:
```yaml
- name: Run E2E tests
  run: npm run test:e2e
```

The test handles:
- Headless mode automatically
- Waits with generous timeouts
- Screenshots on failure
- HTML report generation

## Files

- `playwright.config.ts` — Test configuration
- `e2e/workbench-flow.spec.ts` — Main test
- `playwright-report/` — HTML report (generated after test run)
- `test-results/` — Screenshots and traces on failures
