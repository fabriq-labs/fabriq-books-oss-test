import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, ChevronDown, ArrowLeft, BookOpen, BarChart2, Tag, RefreshCw, Pencil, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgentSession } from '@/contexts/AgentSessionContext';
import { agentTemplateAPI, type AgentTemplate } from '@/api/api';
import { cn } from '@/lib/utils';

const TAX_PACKAGE_TEMPLATE_ID = 'atpl_tax_package_ca_t1';

// Fallback icon map for templates without icon metadata
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  atpl_book_transactions: <BookOpen className="h-5 w-5" />,
  atpl_reconcile: <RefreshCw className="h-5 w-5" />,
  atpl_spending_analysis: <BarChart2 className="h-5 w-5" />,
  atpl_categorise: <Tag className="h-5 w-5" />,
  atpl_custom: <Pencil className="h-5 w-5" />,
  [TAX_PACKAGE_TEMPLATE_ID]: <FileSpreadsheet className="h-5 w-5" />,
};

const MODES = [
  { value: 'supervised', label: 'Supervised', desc: 'All actions require your approval' },
  { value: 'semi_auto', label: 'Semi-Auto', desc: 'High-confidence actions auto-execute' },
  { value: 'autonomous', label: 'Autonomous', desc: 'All actions auto-execute' },
];

export const GoalSetter: React.FC = () => {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState('supervised');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taxYear, setTaxYear] = useState('2025');
  const [recipient, setRecipient] = useState('Meera Patel CPA');
  const [basementPct, setBasementPct] = useState('');
  const [includeForeign, setIncludeForeign] = useState('yes');
  const { createSession } = useAgentSession();
  const navigate = useNavigate();

  useEffect(() => {
    agentTemplateAPI.list().then(setTemplates).catch(() => {});
  }, []);

  const selectedMode = MODES.find(m => m.value === mode) || MODES[0];
  const isTaxPackage = selectedTemplate?.id === TAX_PACKAGE_TEMPLATE_ID;

  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setGoal('');
    if (template.id === TAX_PACKAGE_TEMPLATE_ID) {
      setMode('supervised');
    } else if (template.default_mode) {
      setMode(template.default_mode);
    }
  };

  const handleBack = () => {
    setSelectedTemplate(null);
    setGoal('');
  };

  const handleSubmit = async (goalOverride?: string) => {
    if (isSubmitting) return;
    const intake = isTaxPackage
      ? {
          tax_year: Number(taxYear),
          recipient: recipient.trim() || 'Meera Patel CPA',
          include_foreign: includeForeign !== 'no',
          basement_pct: basementPct.trim() ? Number(basementPct) : null,
        }
      : undefined;
    const assembledGoal = isTaxPackage
      ? `Prepare Canadian T1 package for TY ${taxYear} for ${intake!.recipient}.`
        + (intake!.basement_pct != null ? ` Basement rentable share ${intake!.basement_pct}%.` : ' Basement rentable share unknown.')
        + (intake!.include_foreign ? ' Include India foreign income.' : ' Canada-source only.')
      : (goalOverride ?? goal);
    if (!assembledGoal.trim()) return;
    setIsSubmitting(true);
    try {
      const sessionId = await createSession({
        goal: assembledGoal.trim(),
        mode: isTaxPackage ? 'supervised' : mode,
        goalModel: selectedTemplate?.goal_model || 'posting',
        templateId: selectedTemplate?.id === 'atpl_custom' ? undefined : selectedTemplate?.id,
        intake,
      });
      navigate(`/workbench/${sessionId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Template grid ──────────────────────────────────────────────
  if (!selectedTemplate) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="w-full max-w-xl">
          <h1 className="text-2xl font-semibold text-gray-800 text-center mb-2">
            Agent Workbench
          </h1>
          <p className="text-sm text-gray-500 text-center mb-8">
            Pick a task type to get started. The agent will create a plan and work through it step by step.
          </p>

          {templates.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={cn(
                    'flex flex-col items-start gap-2 p-4 rounded-xl border bg-white',
                    'text-left transition-all hover:border-primary/40 hover:shadow-sm hover:bg-primary/5',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
                  )}
                >
                  <span className="text-primary">
                    {TEMPLATE_ICONS[t.id] || <Pencil className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 rounded-xl border bg-gray-50 animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Goal input (after template selected) ──────────────────────
  const isCustom = selectedTemplate.id === 'atpl_custom';
  const canSubmit = isTaxPackage
    ? Boolean(taxYear && recipient.trim())
    : Boolean(goal.trim());

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <div className="w-full max-w-lg">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-6 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All task types
        </button>

        <div className="flex items-center gap-3 mb-6">
          <span className="text-primary p-2 rounded-lg bg-primary/8 border border-primary/15">
            {TEMPLATE_ICONS[selectedTemplate.id] || <Pencil className="h-5 w-5" />}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{selectedTemplate.name}</h2>
            {selectedTemplate.description && (
              <p className="text-xs text-gray-500">{selectedTemplate.description}</p>
            )}
          </div>
        </div>

        {isTaxPackage ? (
          <div className="space-y-3 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor="tax-year">Canadian tax year</Label>
              <Select value={taxYear} onValueChange={setTaxYear}>
                <SelectTrigger id="tax-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025 (calendar)</SelectItem>
                  <SelectItem value="2024">2024 (calendar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipient">Send package to</Label>
              <Input
                id="recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Meera Patel CPA"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="basement-pct">Milton basement rentable % (optional)</Label>
              <Input
                id="basement-pct"
                type="number"
                min={0}
                max={100}
                value={basementPct}
                onChange={(e) => setBasementPct(e.target.value)}
                placeholder="Leave blank if unknown"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="include-foreign">India foreign income</Label>
              <Select value={includeForeign} onValueChange={setIncludeForeign}>
                <SelectTrigger id="include-foreign">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Include (worldwide T1)</SelectItem>
                  <SelectItem value="no">Canada-source only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              className="w-full h-11"
            >
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Starting…' : 'Prepare T1 package'}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-3">
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={
                selectedTemplate.user_hint ||
                (isCustom ? 'Describe what the agent should do' : 'Provide any specifics')
              }
              className="flex-1 h-11"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
              disabled={isSubmitting}
              autoFocus
            />
            <Button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              className="h-11 px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-gray-500">Mode:</span>
          {isTaxPackage ? (
            <span className="text-xs font-medium text-gray-700">Supervised (locked)</span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs h-7">
                  {selectedMode.label}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {MODES.map((m) => (
                  <DropdownMenuItem key={m.value} onClick={() => setMode(m.value)}>
                    <div>
                      <div className="font-medium text-sm">{m.label}</div>
                      <div className="text-xs text-gray-500">{m.desc}</div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {selectedTemplate.user_hint && (
          <p className="text-xs text-gray-400 text-center">
            <span className="font-medium">Tip:</span> {selectedTemplate.user_hint}
          </p>
        )}
      </div>
    </div>
  );
};
