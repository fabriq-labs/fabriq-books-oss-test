/**
 * Dev-only harness to manually / Playwright-test ClarificationCard dropdown UX.
 * Route: /dev/clarification-preview
 */
import React, { useState } from 'react';
import { ClarificationCard } from '@/components/workbench/ClarificationCard';
import type { ClarificationRequest } from '@/contexts/AgentSessionContext';

const sampleClarification: ClarificationRequest = {
  question: 'Which Checking Account would you like to reconcile?',
  step_index: 0,
  context: { searched_for: 'checking account' },
  input_schema: {
    type: 'single_select',
    options: [
      { id: 'acco_org_indian_demo_1102', label: 'Checking Account (HQ)' },
      { id: 'acco_org_mumbai_branch_1102', label: 'Checking Account (Mumbai Branch)' },
      { id: 'acco_org_bangalore_office_1102', label: 'Checking Account (Bangalore Office)' },
      { id: 'acco_org_us_office_1102', label: 'Checking Account (US Office)' },
    ],
  },
};

const ClarificationCardPreview: React.FC = () => {
  const [submitted, setSubmitted] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-lg font-semibold text-gray-900">ClarificationCard preview</h1>
        <p className="text-sm text-gray-600">
          Expect a dropdown listing account name · id, then Continue submits the selected id.
        </p>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <ClarificationCard
            clarification={sampleClarification}
            onSubmit={async (answer) => {
              await new Promise((r) => setTimeout(r, 200));
              setSubmitted(answer);
            }}
          />
        </div>
        <div
          data-testid="clarification-submit-result"
          className="text-sm font-mono text-gray-800 break-all"
        >
          {submitted ? `submitted:${submitted}` : 'submitted:(none)'}
        </div>
      </div>
    </div>
  );
};

export default ClarificationCardPreview;
