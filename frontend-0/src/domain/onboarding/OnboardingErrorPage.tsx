import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { OnboardingStatus } from '@/api/superAdminApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

const DOCS_PATH = 'docs/domain/ONBOARDING_REQUIREMENTS.md';

const REASON_TEXT: Record<string, string> = {
  org_renamed: 'The organization name is no longer the default.',
  password_changed: 'The administrator password was changed outside setup.',
  accounts_exist: 'Accounts already exist in the chart of accounts.',
  business_rows_exist: 'Business records (entities, postings, parties, or invoices) already exist.',
  onboarding_flags_incomplete: 'The first-run setup record is missing or incomplete.',
};

function describeReason(reason: string): string {
  if (REASON_TEXT[reason]) return REASON_TEXT[reason];
  if (/\s/.test(reason)) return reason;
  const words = reason.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** R-ONBOARD-ERR: the database shows real use without onboarding flags. Offers no data-changing actions. */
export function OnboardingInconsistentPage({ status }: { status: OnboardingStatus }) {
  const { logout } = useAuth();
  const reasons = Array.from(new Set((status.inconsistencyReasons ?? []).map(describeReason)));

  return (
    <Card>
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-gray-900">Setup can't continue on this database</h1>
            <p className="text-sm leading-relaxed text-gray-600">
              This organization already has data, but no record that first-run setup was finished.
              To avoid overwriting anything, the app has stopped here.
            </p>
          </div>
        </div>

        {reasons.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-gray-900">What was found</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-gray-900">What to do</h2>
          <p className="text-sm leading-relaxed text-gray-600">
            Recovery needs someone with access to the server and database. The server log has an
            error entry with the same findings. What triggers this check is described under
            <span className="whitespace-nowrap">R-ONBOARD-ERR</span> in <code className="rounded bg-muted px-1 py-0.5 text-xs break-all">{DOCS_PATH}</code>.
          </p>
        </section>

        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-md border bg-gray-50 px-4 py-3 text-xs">
          <dt className="text-gray-500">Organization</dt>
          <dd className="truncate text-gray-900">{status.org.name}</dd>
          <dt className="text-gray-500">Org ID</dt>
          <dd className="truncate font-mono text-gray-900">{status.org.id}</dd>
        </dl>

        <div className="flex justify-end">
          <Button variant="outline" onClick={logout} className="w-full sm:w-auto">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Status request failed (network or 5xx). Retrying only re-reads status. */
export function OnboardingStatusUnavailable({ message, onRetry, retrying }: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-gray-900">Couldn't check setup status</h1>
            <p className="text-sm leading-relaxed text-gray-600">
              The server did not answer the setup check, so the app can't tell whether first-run setup is
              finished.
            </p>
            <p className="text-xs text-gray-500">{message}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onRetry} disabled={retrying} className="w-full sm:w-auto">
            <RefreshCw className={retrying ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            Check again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
