import React from 'react';
import { useChat } from '@/contexts/ChatContext';
import { ChatShell } from '@/components/chat/ChatShell';
import { ActionCards } from '@/components/dashboard/ActionCards';
import { TodoCard } from '@/components/dashboard/TodoCard';
import { FeedCard } from '@/components/dashboard/FeedCard';
import {
  CategorySpendChart,
  CycleTimeChart,
  CostSavingsChart,
  RecentPurchasesCard
} from '@/components/dashboard/ChartCards';

const Dashboard: React.FC = () => {
  const { isChatOpen } = useChat();

  return (
    <>
      {isChatOpen ? (
        <ChatShell className="h-full" fullPage />
      ) : (
        <div className="space-y-8 pt-6">
          {/* Quick Actions */}
          <section className="mt-4">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <ActionCards />
          </section>

          {/* To Dos and Feed */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Status Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TodoCard />
              <FeedCard />
            </div>
          </section>

          {/* Charts - First Row */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Procurement Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <CategorySpendChart />
              <CycleTimeChart />
            </div>

            {/* Charts - Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CostSavingsChart />
              <RecentPurchasesCard />
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default Dashboard;
