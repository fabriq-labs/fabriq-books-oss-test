// Entity-branching dashboard shell.
// Company (is_individual=false): Period Snapshot → Workload Radar → Agent Inbox → Activity & Trust
// Individual (is_individual=true): Personal Finance layout (manages its own period state)

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEntity } from '@/contexts/EntityContext';
import { useChat } from '@/contexts/ChatContext';
import { ChatShell } from '@/components/chat/ChatShell';
import { buildDefaultPostingChatContext } from '@/utils/postingChatContext';
import {
  FinancialYearSelector,
  getPreviousFYOption,
  buildMonthOptions,
  type FinancialYearOption,
  type MonthOption,
} from '@/components/Reports/FinancialYearSelector';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Layer1, Layer2, Layer4 } from './company/CompanyWidgets';
import { AgentInbox } from './company/AgentInbox';
import { PersonalDashboard } from './individual/PersonalDashboard';
import { C } from './design-system';

// TODO: lift AgentSessionProvider to App.tsx to enable createSession() here.

const FabriqDashboard: React.FC = () => {
  const { currentEntity, entities } = useEntity();
  const { isChatOpen, setPageContext } = useChat();
  const navigate = useNavigate();

  const isIndividual = currentEntity?.is_individual === true;

  useEffect(() => {
    setPageContext({
      ...buildDefaultPostingChatContext(currentEntity, entities),
      currentPath: '/',
    });
    return () => setPageContext(null);
  }, [setPageContext, currentEntity, entities]);

  // Period state for the company layout only (individual manages its own internally)
  const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() =>
    getPreviousFYOption(currentEntity?.financial_year_type ?? 'JAN_DEC')
  );
  const [selectedMonth, setSelectedMonth] = useState<MonthOption | null>(null);

  useEffect(() => {
    setSelectedFY(getPreviousFYOption(currentEntity?.financial_year_type ?? 'JAN_DEC'));
    setSelectedMonth(null);
  }, [currentEntity?.id, currentEntity?.financial_year_type]);

  const monthOptions = useMemo(() => buildMonthOptions(selectedFY), [selectedFY]);
  const handleFYChange = (opt: FinancialYearOption) => { setSelectedFY(opt); setSelectedMonth(null); };

  const handleLaunchAgent = (_goal: string) => { navigate('/workbench'); };

  if (isChatOpen) {
    return <ChatShell className="h-full" fullPage />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 600, fontSize: 16, color: C.gray900 }}>
            {isIndividual ? 'Personal Finance' : 'Bookkeeping dashboard (Demo Data)'}
          </div>
          {currentEntity && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{currentEntity.legal_name}</div>
          )}
        </div>

        {/* Period selectors for company only — individual positions them inside its own BandHeader */}
        {!isIndividual && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <FinancialYearSelector
              fyType={currentEntity?.financial_year_type}
              value={selectedFY.value}
              onChange={handleFYChange}
              className="w-[130px] h-9 border-slate-300 text-sm shrink-0"
            />
            <Select
              value={selectedMonth?.value ?? '__all__'}
              onValueChange={(v) => {
                setSelectedMonth(v === '__all__' ? null : (monthOptions.find((m) => m.value === v) ?? null));
              }}
            >
              <SelectTrigger className="w-[150px] h-9 border-slate-300 text-sm shrink-0">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Months</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isIndividual ? (
        <PersonalDashboard
          fyType={currentEntity?.financial_year_type}
          onLaunchAgent={handleLaunchAgent}
        />
      ) : (
        <>
          <Layer1 />
          <Layer2 onLaunchAgent={handleLaunchAgent} />
          <AgentInbox onLaunchAgent={handleLaunchAgent} />
          <Layer4 />
        </>
      )}
    </div>
  );
};

export default FabriqDashboard;
