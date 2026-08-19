import { ToolManager } from '../ToolManager';
import { getOptionChainTool } from '../tools/getOptionChain';
import { createTestContext } from '../../__tests__/agent/agent-service-test-fixtures';

describe('holding model — getOptionChain wiring', () => {
  const context = createTestContext('user_test_123', 'org_test_company');

  it('exposes a getOptionChain agent tool factory', () => {
    const tool = getOptionChainTool(context);
    expect(tool).toBeDefined();
    expect(typeof (tool as { execute?: unknown }).execute).toBe('function');
  });

  it('includes getOptionChain when holding is configured in agent_model_tool_config', async () => {
    const tools = await ToolManager.getInstance().getToolsForModel('holding', context);
    if (!tools.getOptionChain) {
      console.warn('Skipping: no holding row in test DB agent_model_tool_config');
    }
    expect(tools.getOptionChain).toBeDefined();
  });
});
