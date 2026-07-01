import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowExecutor, HitlPauseError, FlowStopError } from '../executor/engine.js';
import type { FlowDefinition, FlowNode, FlowEdge } from 'core-agents-shared';
import type { ExecutionContext } from '../executor/engine.js';

vi.mock('../providers/index.js', () => ({
  callLLM: vi.fn(() => Promise.resolve({ text: 'mock LLM response' })),
}));

function makeNode(id: string, nodeType: string, overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: {
      type: nodeType,
      label: id,
      config: {},
      ...overrides,
    } as any,
  };
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<FlowEdge> = {}): FlowEdge {
  return { id, source, target, sourceHandle: null, targetHandle: null, ...overrides };
}

function makeFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowDefinition {
  return {
    id: 'test-flow',
    name: 'Test Flow',
    description: '',
    nodes,
    edges,
    version: 1,
    createdAt: '',
    updatedAt: '',
  };
}

function makeSubflowDef(id: string, triggerConfig: Record<string, unknown> = {}, outputConfig: Record<string, unknown> = {}): FlowDefinition {
  const nodes: FlowNode[] = [
    makeNode('sf-trigger', 'trigger', { config: { triggerType: 'subflow', ...triggerConfig } }),
    makeNode('sf-output', 'output', { config: { inputFields: [], ...outputConfig } }),
  ];
  return {
    id,
    name: `Subflow ${id}`,
    description: '',
    nodes,
    edges: [makeEdge('e1', 'sf-trigger', 'sf-output')],
    version: 1,
    createdAt: '',
    updatedAt: '',
  };
}

describe('compileFlow — subflow validation', () => {
  let executor: FlowExecutor;
  let onEvent: any;
  let context: ExecutionContext;

  beforeEach(() => {
    executor = new FlowExecutor();
    onEvent = vi.fn();
    context = {
      getEndpoint: vi.fn().mockResolvedValue({ providerType: 'anthropic' as const, apiKey: 'test-key', baseUrl: null }),
      getFlow: vi.fn().mockResolvedValue(makeSubflowDef('subflow-1', { inputSchema: '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}' })),
    };
  });

  it('passes when subflow node has valid config', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'subflow-1', inputMapping: { query: '{{input.trigger.message}}' } },
        }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );
    const result = await executor.execute(flow, { message: 'test' }, onEvent, context);
    expect(result.steps.some(s => s.nodeId === 'sub')).toBe(true);
  });

  it('fails when subflow node has no subflowId', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', { config: { subflowId: '', inputMapping: {} } }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );
    await expect(executor.execute(flow, { message: 'test' }, onEvent, context))
      .rejects.toThrow(/no subflow selected/);
  });

  it('fails when subflow references a non-existent flow', async () => {
    context.getFlow = vi.fn().mockResolvedValue(null);
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'nonexistent', inputMapping: { query: '{{input.trigger.message}}' } },
        }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );
    await expect(executor.execute(flow, { message: 'test' }, onEvent, context))
      .rejects.toThrow(/not found/);
  });
});

describe('SubFlowExecutor — recursive execution', () => {
  let executor: FlowExecutor;
  let onEvent: any;
  let context: ExecutionContext;
  let subflowDef: FlowDefinition;

  beforeEach(() => {
    executor = new FlowExecutor();
    onEvent = vi.fn();
    subflowDef = makeSubflowDef('test-flow', {}, { inputFields: ['sf-trigger.message'] });
    context = {
      getEndpoint: vi.fn().mockResolvedValue({ providerType: 'anthropic' as const, apiKey: 'test-key', baseUrl: null }),
      getFlow: vi.fn().mockResolvedValue(subflowDef),
      onSubExecution: vi.fn().mockResolvedValue('sub-exec-1'),
      completeSubExecution: vi.fn().mockResolvedValue(undefined),
      currentExecutionId: 'parent-exec-1',
    };
  });

  it('executes a subflow and returns its output', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'subflow-1', inputMapping: { query: '{{input.trigger.message}}' } },
        }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );
    const result = await executor.execute(flow, { message: 'hello' }, onEvent, context);
    expect(result.output).toBeDefined();
    expect(context.getFlow).toHaveBeenCalledWith('subflow-1', []);
    // subflowId in onSubExecution is the subflow definition's own ID (test-flow from makeFlow)
    expect(context.onSubExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        parentExecutionId: 'parent-exec-1',
        subflowId: 'test-flow',
        depth: 1,
      }),
    );
  });

  it('propagates HitlPauseError from within subflow to parent', async () => {
    const subflowWithHitl: FlowDefinition = {
      id: 'subflow-hitl',
      name: 'Subflow HITL',
      description: '',
      nodes: [
        makeNode('sf-trigger', 'trigger', { config: { triggerType: 'subflow' } }),
        makeNode('sf-hitl', 'hitl', {
          config: {
            prompt: 'Approve subflow?',
            displayFields: [],
            forwardFields: [],
            buttons: [{ label: 'Approve', value: 'approved' }],
          },
        }),
        makeNode('sf-output', 'output', { config: { inputFields: [] } }),
      ],
      edges: [makeEdge('e1', 'sf-trigger', 'sf-hitl'), makeEdge('e2', 'sf-hitl', 'sf-output')],
      version: 1,
      createdAt: '',
      updatedAt: '',
    };
    context.getFlow = vi.fn().mockResolvedValue(subflowWithHitl);

    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'subflow-1', inputMapping: { query: '{{input.trigger.message}}' } },
        }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );

    await expect(executor.execute(flow, { message: 'hello' }, onEvent, context))
      .rejects.toThrow(HitlPauseError);
    // Sub-execution should be marked as failed when interrupted by HITL
    expect(context.completeSubExecution).toHaveBeenCalledWith('sub-exec-1', {}, 'failed', 'Interrupted by HITL/stop');
  });

  it('increments currentDepth when nesting subflows', async () => {
    const leafSubflow = makeSubflowDef('leaf-subflow');
    const midLevelSubflow: FlowDefinition = {
      id: 'mid-level',
      name: 'Mid Level',
      description: '',
      nodes: [
        makeNode('mid-trigger', 'trigger', { config: { triggerType: 'subflow' } }),
        makeNode('mid-sub', 'subflow', {
          config: { subflowId: 'leaf-subflow', inputMapping: {} },
        }),
        makeNode('mid-output', 'output', { config: { inputFields: [] } }),
      ],
      edges: [
        makeEdge('e1', 'mid-trigger', 'mid-sub'),
        makeEdge('e2', 'mid-sub', 'mid-output'),
      ],
      version: 1,
      createdAt: '',
      updatedAt: '',
    };

    const subCalls: any[] = [];
    context.getFlow = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'mid-level') return midLevelSubflow;
      if (id === 'leaf-subflow') return leafSubflow;
      return null;
    });
    context.onSubExecution = vi.fn().mockImplementation(async (data: any) => {
      subCalls.push(data);
      return `exec-${data.depth}`;
    });
    context.completeSubExecution = vi.fn();

    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'mid-level', inputMapping: {} },
        }),
        makeNode('out', 'code', { config: { code: 'return { parent: true };' } }),
      ],
      [
        makeEdge('e1', 'trigger', 'sub'),
        makeEdge('e2', 'sub', 'out'),
      ],
    );

    await executor.execute(flow, { message: 'hello' }, onEvent, context);

    // First subflow (mid-level) at depth 1, second (leaf) at depth 2
    const depths = subCalls.map((c: any) => c.depth);
    expect(depths).toContain(1);
    expect(depths).toContain(2);
    expect(depths.sort()).toEqual([1, 2]);
  });
});

describe('compileFlow — subflow requires output node', () => {
  let executor: FlowExecutor;
  let onEvent: any;
  let context: ExecutionContext;

  beforeEach(() => {
    executor = new FlowExecutor();
    onEvent = vi.fn();
    context = {
      getEndpoint: vi.fn().mockResolvedValue({ providerType: 'anthropic' as const, apiKey: 'test-key', baseUrl: null }),
    };
  });

  it('fails when a subflow flow has no output node', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger', { config: { triggerType: 'subflow' } }),
        makeNode('code', 'code', { config: { code: 'return input;' } }),
      ],
      [makeEdge('e1', 'trigger', 'code')],
    );

    await expect(executor.execute(flow, {}, onEvent, context))
      .rejects.toThrow(/requires an Output node/);
  });

  it('passes when a subflow flow has an output node', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger', { config: { triggerType: 'subflow' } }),
        makeNode('output', 'output', { config: { inputFields: [] } }),
      ],
      [makeEdge('e1', 'trigger', 'output')],
    );

    const result = await executor.execute(flow, {}, onEvent, context);
    expect(result.steps.some(s => s.nodeId === 'output')).toBe(true);
  });

  it('does not require an output node for non-subflow flows', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('code', 'code', { config: { code: 'return input;' } }),
      ],
      [makeEdge('e1', 'trigger', 'code')],
    );

    const result = await executor.execute(flow, {}, onEvent, context);
    expect(result.steps.some(s => s.nodeId === 'code')).toBe(true);
  });
});

describe('compileFlow — subflow input mapping validation', () => {
  let executor: FlowExecutor;
  let onEvent: any;
  let context: ExecutionContext;

  beforeEach(() => {
    executor = new FlowExecutor();
    onEvent = vi.fn();
    context = {
      getEndpoint: vi.fn().mockResolvedValue({ providerType: 'anthropic' as const, apiKey: 'test-key', baseUrl: null }),
    };
  });

  it('fails when subflow input mapping references a non-upstream node', async () => {
    context.getFlow = vi.fn().mockResolvedValue(makeSubflowDef('sf', { inputSchema: '{"type":"object","properties":{"x":{"type":"string"}},"required":["x"]}' }));

    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'sf', inputMapping: { x: '{{input.nonexistent.field}}' } },
        }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );

    await expect(executor.execute(flow, { message: 'test' }, onEvent, context))
      .rejects.toThrow(/references.*nonexistent/);
  });

  it('fails when getFlow is not available in context', async () => {
    delete context.getFlow;
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'sf', inputMapping: {} },
        }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );
    await expect(executor.execute(flow, { message: 'test' }, onEvent, context))
      .rejects.toThrow(/getFlow/);
  });

  it('permits empty inputMapping when subflow has no inputSchema', async () => {
    context.getFlow = vi.fn().mockResolvedValue(makeSubflowDef('sf'));

    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'sf', inputMapping: {} },
        }),
        makeNode('after', 'code', { config: { code: 'return input;' } }),
      ],
      [
        makeEdge('e1', 'trigger', 'sub'),
        makeEdge('e2', 'sub', 'after'),
      ],
    );

    const result = await executor.execute(flow, { message: 'test' }, onEvent, context);
    expect(result.steps.some(s => s.nodeId === 'after')).toBe(true);
  });
});

describe('SubFlowExecutor — depth limit', () => {
  let executor: FlowExecutor;
  let onEvent: any;
  let context: ExecutionContext;

  beforeEach(() => {
    executor = new FlowExecutor();
    onEvent = vi.fn();
    const tinySubflow = makeFlow(
      [makeNode('t', 'trigger'), makeNode('c', 'code', { config: { code: 'return input;' } })],
      [makeEdge('e1', 't', 'c')],
    );
    // All IDs resolve to the same tiny subflow, creating infinite recursion
    context = {
      getFlow: vi.fn().mockResolvedValue(tinySubflow),
      onSubExecution: vi.fn().mockResolvedValue('sub-exec'),
      completeSubExecution: vi.fn(),
      currentExecutionId: 'parent',
    };
  });

  it('throws when subflow exceeds max recursion depth', async () => {
    // A subflow that references itself through getFlow (always returns the same flow)
    context.getFlow = vi.fn().mockImplementation(async (id: string, ancestry?: string[]) => {
      // First call returns a subflow that also has a subflow node
      if (ancestry && ancestry.length >= 10) {
        throw new Error('Max subflow recursion depth (10) exceeded');
      }
      const nestedSubflow = makeFlow(
        [
          makeNode('inner-trigger', 'trigger'),
          makeNode('inner-sub', 'subflow', {
            config: { subflowId: 'recursive', inputMapping: {} },
          }),
        ],
        [makeEdge('e', 'inner-trigger', 'inner-sub')],
      );
      return nestedSubflow;
    });
    context.onSubExecution = vi.fn().mockImplementation(async (data: any) => `sub-${data.depth}`);

    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'recursive', inputMapping: {} },
        }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );

    await expect(executor.execute(flow, { message: 'test' }, onEvent, context))
      .rejects.toThrow(/depth/);
  });
});

describe('compileFlow — subflow id must exist in flow list', () => {
  let executor: FlowExecutor;
  let onEvent: any;
  let context: ExecutionContext;

  beforeEach(() => {
    executor = new FlowExecutor();
    onEvent = vi.fn();
    // getFlow returns null (not found)
    context = { getFlow: vi.fn().mockResolvedValue(null), getEndpoint: vi.fn() };
  });

  it('fails when the referenced subflow does not exist', async () => {
    const flow = makeFlow(
      [
        makeNode('trigger', 'trigger'),
        makeNode('sub', 'subflow', {
          config: { subflowId: 'ghost', inputMapping: { x: '{{input.trigger.message}}' } },
        }),
      ],
      [makeEdge('e1', 'trigger', 'sub')],
    );

    await expect(executor.execute(flow, { message: 'test' }, onEvent, context))
      .rejects.toThrow(/not found/);
  });
});
