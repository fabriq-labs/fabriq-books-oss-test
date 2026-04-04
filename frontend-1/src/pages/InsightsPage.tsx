
import React from 'react';
import { InsightsConversation } from '@/components/insights/InsightsConversation';

const InsightsPage = () => {
  return (
    
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
          <h2 className="text-lg font-medium">Procurement Insights Assistant</h2>
          <p className="text-gray-600 text-sm">
            Ask questions about your procurement data to get insights with interactive charts and downloadable reports
          </p>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <InsightsConversation />
        </div>
      </div>
    
  );
};

export default InsightsPage;
