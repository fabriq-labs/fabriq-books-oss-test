import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, ChevronDown, ArrowLeft, BookOpen, BarChart2, Tag, RefreshCw, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAgentSession } from '@/contexts/AgentSessionContext';
import { agentTemplateAPI, type AgentTemplate } from '@/api/api';
import { cn } from '@/lib/utils';

// Fallback icon map for templates without icon metadata
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  atpl_book_transactions: <BookOpen className="h-5 w-5" />,
  atpl_reconcile: <RefreshCw className="h-5 w-5" />,
  atpl_spending_analysis: <BarChart2 className="h-5 w-5" />,
  atpl_categorise: <Tag className="h-5 w-5" />,
  atpl_custom: <Pencil className="h-5 w-5" />,
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
  const { createSession } = useAgentSession();
  const navigate = useNavigate();

  useEffect(() => {
    agentTemplateAPI.list().then(setTemplates).catch(() => {});
  }, []);

  const selectedMode = MODES.find(m => m.value === mode) || MODES[0];

  const handleSelectTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setGoal('');
    // Use template's default mode if set
    if (template.default_mode) setMode(template.default_mode);
  };

  const handleBack = () => {
    setSelectedTemplate(null);
    setGoal('');
  };

  const handleSubmit = async (goalOverride?: string) => {
    const finalGoal = goalOverride ?? goal;
    if (!finalGoal.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sessionId = await createSession({
        goal: finalGoal.trim(),
        mode,
        goalModel: selectedTemplate?.goal_model || 'posting',
        templateId: selectedTemplate?.id === 'atpl_custom' ? undefined : selectedTemplate?.id,
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
            // Fallback while templates load
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

        {/* Goal input */}
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
            disabled={!goal.trim() || isSubmitting}
            className="h-11 px-4"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-gray-500">Mode:</span>
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
        </div>

        {/* Hint text */}
        {selectedTemplate.user_hint && (
          <p className="text-xs text-gray-400 text-center">
            <span className="font-medium">Tip:</span> {selectedTemplate.user_hint}
          </p>
        )}
      </div>
    </div>
  );
};
