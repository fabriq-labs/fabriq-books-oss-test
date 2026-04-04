import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Master from '@/pages/Master';
import { AgentTemplatesList } from '@/components/forms/Masters/AgentTemplatesList';
import { appId } from '@/config/brand';

export const AITemplatesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'prompt';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">AI Templates</h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage prompt templates for views and agent templates for the workbench
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="prompt">Prompt Templates</TabsTrigger>
          <TabsTrigger value="agent">Agent Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt" className="mt-0">
          <Master
            type="prompt_template"
            view="prompt_template_view"
            displayName="Prompt Templates"
            defaultFilters={{ app_name: { eq: appId } }}
          />
        </TabsContent>

        <TabsContent value="agent" className="mt-0">
          <AgentTemplatesList />
        </TabsContent>
      </Tabs>
    </div>
  );
};
