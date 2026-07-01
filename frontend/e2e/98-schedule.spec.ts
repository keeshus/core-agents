import { test, expect } from '@playwright/test';
import { createFlow, deleteFlow, uniqueFlowName } from './helpers/api';
import { debugExecute } from './helpers/stream';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

test.describe('Schedule trigger', () => {
  test('schedule-triggered flow executes correctly', async ({ request }) => {
    const name = uniqueFlowName('ScheduleTest');
    const res = await createFlow(request, {
      name,
      nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Scheduler', type: 'trigger', config: { triggerType: 'schedule', cronExpression: '* * * * *', inputMessage: '{"message":"scheduled run"}' } } },
        { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Echo', type: 'code', config: { code: 'return { result: input.message, triggered: input.triggerType };' } } },
        { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields: ['echo.result', 'echo.triggered'] } } },
      ],
      edges: [
        { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
        { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
      ],
    });
    const flow = await res.json();
    const events = await debugExecute(flow.id, { triggerType: 'schedule', timestamp: new Date().toISOString(), message: 'cron job run' }, cookie);
    const completed = events.find(e => e.type === 'execution.completed');
    expect(completed).toBeDefined();
    // Verify the code node's output includes the scheduled input
    expect(completed!.data?.output?.c1?.result).toBe('cron job run');
    await deleteFlow(request, flow.id);
  });
});
