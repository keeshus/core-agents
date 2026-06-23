import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { executions, executionSteps, flows, llmEndpoints, mcpServers, embeddingProviders, vectorStores } from '../db/schema.js';
import { FlowExecutor, HitlPauseError, FlowStopError } from '../../../worker/src/executor/engine.js';
import { getStore } from '../vector-stores/index.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { SSEEvent, FlowDefinition, ExecutionStep } from 'core-agents-shared';

const router = Router();

// In-memory registry of active executors for cancellation
const activeExecutors = new Map<string, FlowExecutor>();

// GET /api/executions/pending — list executions awaiting approval (for approvals page)
router.get('/executions/pending', requirePermission('execution:approve'), asyncHandler(async (_req, res) => {
  const result = await db
    .select()
    .from(executions)
    .where(eq(executions.status, 'awaiting_approval'))
    .orderBy(desc(executions.created_at));
  res.json(result);
}));

// GET /api/executions — global list of all executions across all flows (admin only)
router.get('/executions', requirePermission('admin'), asyncHandler(async (_req, res) => {
  const result = await db
    .select()
    .from(executions)
    .orderBy(desc(executions.created_at))
    .limit(100);
  res.json(result);
}));

// POST /api/executions/:executionId/cancel — cancel a running execution
router.post('/executions/:executionId/cancel', requirePermission('flow:edit'), asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;

  // Abort in-process if available
  const executor = activeExecutors.get(executionId);
  if (executor) {
    executor.abort();
    activeExecutors.delete(executionId);
  }

  // Mark as cancelled in DB
  await db
    .update(executions)
    .set({ status: 'cancelled', completed_at: new Date() })
    .where(eq(executions.id, executionId));

  res.json({ status: 'cancelled' });
}));

// ── POST /api/flows/:flowId/execute — SSE-streamed execution ───────────────────

router.post(
  '/flows/:flowId/execute',
  requirePermission('flow:create'),
  asyncHandler(async (req, res) => {
    const flowId = req.params.flowId as string;
    const { input = {} } = req.body;

    // SSE headers ------------------------------------------------
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Helper to emit SSE data frames ------------------------------
    const emitSSE = (data: SSEEvent) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Load flow from DB ------------------------------------------
    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (!flow) {
      emitSSE({
        type: 'execution.failed',
        executionId: '',
        data: { error: 'Flow not found' },
        timestamp: new Date().toISOString(),
      });
      res.end();
      return;
    }

    // Create execution record ------------------------------------
    const [exec] = await db
      .insert(executions)
      .values({
        flow_id: flowId,
        status: 'running',
        input,
        started_at: new Date(),
      })
      .returning();

    // Emit started event
    emitSSE({
      type: 'execution.started',
      executionId: exec.id,
      data: { flowId, flowName: flow.name },
      timestamp: new Date().toISOString(),
    });

    // Build execution context: resolve LLM endpoints from DB ------
    const executionContext: import('../../../worker/src/executor/engine.js').ExecutionContext = {
      getEndpoint: async (endpointId: string) => {
        const [endpoint] = await db
          .select()
          .from(llmEndpoints)
          .where(eq(llmEndpoints.id, endpointId));
        if (!endpoint) return null;
        return {
          providerType: endpoint.provider_type as 'anthropic' | 'openai' | 'litellm',
          apiKey: endpoint.api_key,
          baseUrl: endpoint.base_url ?? null,
        };
      },
      getMCPServer: async (serverId: string) => {
        const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId));
        if (!server) return null;
        return {
          id: server.id,
          name: server.name,
          url: server.url,
          tools: server.tools as any[],
          enabled: server.enabled,
        };
      },
      getEmbeddingProvider: async (providerId: string) => {
        const [ep] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, providerId));
        if (!ep) return null;
        return { providerType: ep.provider_type, apiKey: ep.api_key, baseUrl: ep.base_url, model: ep.model };
      },
      getVectorStore: async (storeId: string) => {
        const [vs] = await db.select().from(vectorStores).where(eq(vectorStores.id, storeId));
        if (!vs) return null;
        return { name: vs.name, url: vs.url, apiKey: vs.api_key };
      },
    };

    // Map Drizzle row (snake_case) to FlowDefinition (camelCase) BEFORE building context
    const flowDef: FlowDefinition = {
      id: flow.id,
      name: flow.name,
      description: flow.description || '',
      nodes: flow.nodes as any,
      edges: flow.edges as any,
      version: flow.version,
      createdAt: flow.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: flow.updated_at?.toISOString() || new Date().toISOString(),
    };

    // Add flowNodes/flowEdges to context now that flowDef exists
    executionContext.flowNodes = flowDef.nodes as any;
    executionContext.flowEdges = flowDef.edges as any;
    executionContext.searchSimilar = async (collectionName, queryEmbedding, topK, minScore) => {
      const store = getStore('qdrant') || getStore('pgvector');
      if (!store) return [];
      return store.search(collectionName, queryEmbedding, topK, minScore);
    };

    const executor = new FlowExecutor();
    activeExecutors.set(exec.id, executor);

    req.on('close', () => {
      executor.abort();
      activeExecutors.delete(exec.id);
    });

    try {
      const result = await executor.execute(
        flowDef,
        input as Record<string, unknown>,
        // onEvent: persist steps + stream to client ---------------
        async (nodeId, event) => {
          // Attach the execution ID (the engine sets it to '' initially)
          const richEvent: SSEEvent = {
            ...event,
            executionId: exec.id,
          };

          // Persist step lifecycle to the database
          const data = event.data;
          const resolvedNodeId = (data.nodeId as string) || nodeId;
          const resolvedNodeType = (data.nodeType as string) || '';
          const iter = (data as any).iteration ?? 0;

          if (event.type === 'step.started') {
            await db.insert(executionSteps).values({
              execution_id: exec.id, node_id: resolvedNodeId, node_type: resolvedNodeType,
              node_label: data.nodeLabel as string | null, iteration: iter,
              status: 'running', input: data.input as any, started_at: new Date(),
            });
          } else if (event.type === 'step.completed') {
            await db.update(executionSteps).set({
              status: 'completed', output: data.output as any, completed_at: new Date(),
            }).where(and(eq(executionSteps.execution_id, exec.id), eq(executionSteps.node_id, resolvedNodeId)));
          } else if (event.type === 'step.failed') {
            await db.update(executionSteps).set({
              status: 'failed', error: data.error as string, completed_at: new Date(),
            }).where(and(eq(executionSteps.execution_id, exec.id), eq(executionSteps.node_id, resolvedNodeId)));
          }

          // Stream event to the SSE client
          emitSSE(richEvent);
        },
        executionContext,
      );

      // Mark execution as completed in DB
      await db
        .update(executions)
        .set({
          status: 'completed',
          output: result.output as any,
          completed_at: new Date(),
        })
        .where(eq(executions.id, exec.id));

      activeExecutors.delete(exec.id);
      emitSSE({
        type: 'execution.completed',
        executionId: exec.id,
        data: { output: result.output },
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      // Handle FlowStop — terminate execution immediately
      if (err instanceof FlowStopError) {
        activeExecutors.delete(exec.id);
        await db
          .update(executions)
          .set({
            status: err.status as any,
            error: err.message,
            completed_at: new Date(),
          })
          .where(eq(executions.id, exec.id));

        emitSSE({
          type: 'execution.stopped',
          executionId: exec.id,
          data: { status: err.status, message: err.message },
          timestamp: new Date().toISOString(),
        });
        res.end();
        return;
      }

      // Handle HITL pause — save partial outputs and await approval
      if (err instanceof HitlPauseError) {
        activeExecutors.delete(exec.id);
        const hitlCfg = (flowDef.nodes || []).find((n) => n.id === err.nodeId)?.data?.config || {};
        const hitlEntry = { nodeId: err.nodeId, prompt: err.prompt, buttons: err.buttons, savedOutputs: err.savedOutputs };
        await db
          .update(executions)
          .set({
            status: 'awaiting_approval',
            output: { ...err.savedOutputs, _hitlButtons: err.buttons, _hitlPrompt: err.prompt, _hitlAllowFeedback: (hitlCfg as any).allowFeedback !== false, _hitlNodeId: err.nodeId, _pausedAt: Date.now(), _nextIteration: 1 } as any,
            pending_hitls: JSON.stringify([hitlEntry]) as any,
          })
          .where(eq(executions.id, exec.id));

        emitSSE({
          type: 'execution.paused',
          executionId: exec.id,
          data: { nodeId: err.nodeId, savedOutputs: err.savedOutputs, buttons: err.buttons, prompt: err.prompt, message: 'Waiting for human approval' },
          timestamp: new Date().toISOString(),
        });
        res.end();
        return;
      }

      const error = err instanceof Error ? err.message : String(err);
      console.error('Flow execution failed:', error);
      activeExecutors.delete(exec.id);

      await db
        .update(executions)
        .set({
          status: 'failed',
          error,
          completed_at: new Date(),
        })
        .where(eq(executions.id, exec.id));

      emitSSE({
        type: 'execution.failed',
        executionId: exec.id,
        data: { error },
        timestamp: new Date().toISOString(),
      });
    }

    res.end();
  }),
);

// ── POST /api/executions/:executionId/approve — approve HITL and resume flow ──

router.post('/executions/:executionId/approve', requirePermission('execution:approve'), asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;
  const { feedback = '', decision = 'approved', data: userData = {}, hitlNodeId } = req.body || {};

  const [exec] = await db.select().from(executions).where(eq(executions.id, executionId));
  if (!exec) { res.status(404).json({ error: 'Execution not found' }); return; }
  if (exec.status !== 'awaiting_approval') { res.status(400).json({ error: 'Not awaiting approval' }); return; }

  // Find the hitlNodeId — use provided one or fall back to first pending
  const pendingHitls = (exec.pending_hitls || []) as Array<{ nodeId: string; prompt: string; buttons: Array<{ label: string; value: string }>; savedOutputs: Record<string, unknown> }>;
  const hitlEntry = hitlNodeId
    ? pendingHitls.find((h: any) => h.nodeId === hitlNodeId)
    : pendingHitls[0];
  if (!hitlEntry) { res.status(400).json({ error: 'No pending HITL found' }); return; }

  // Load the flow
  const [flow] = await db.select().from(flows).where(eq(flows.id, exec.flow_id));
  if (!flow) { res.status(404).json({ error: 'Flow not found' }); return; }

  const flowDef: FlowDefinition = {
    id: flow.id, name: flow.name, description: flow.description || '',
    nodes: flow.nodes as any, edges: flow.edges as any, version: flow.version,
    createdAt: flow.created_at?.toISOString() || '', updatedAt: flow.updated_at?.toISOString() || '',
  };

  const executionContext = {
    getEndpoint: async (endpointId: string) => {
      const [ep] = await db.select().from(llmEndpoints).where(eq(llmEndpoints.id, endpointId));
      if (!ep) return null;
      return { providerType: ep.provider_type as 'anthropic' | 'openai' | 'litellm', apiKey: ep.api_key, baseUrl: ep.base_url };
    },
    getMCPServer: async (serverId: string) => {
      const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId));
      if (!server) return null;
      return { id: server.id, name: server.name, url: server.url, tools: server.tools as any[], enabled: server.enabled };
    },
    getEmbeddingProvider: async (providerId: string) => {
      const [ep] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, providerId));
      if (!ep) return null;
      return { providerType: ep.provider_type, apiKey: ep.api_key, baseUrl: ep.base_url, model: ep.model };
    },
    getVectorStore: async (storeId: string) => {
      const [vs] = await db.select().from(vectorStores).where(eq(vectorStores.id, storeId));
      if (!vs) return null;
      return { name: vs.name, url: vs.url, apiKey: vs.api_key };
    },
    flowNodes: flowDef.nodes as any,
    flowEdges: flowDef.edges as any,
  };

  const executor = new FlowExecutor();
  const savedOutputs = hitlEntry.savedOutputs || {};
  const mergedInput = { ...(exec.input || {}), _approved: true, _feedback: feedback, _decision: decision, ...userData };

  try {
    const persistStep = async (_nodeId: string, event: SSEEvent) => {
      const data = event.data;
      const resolvedNodeId = (data.nodeId as string) || _nodeId;
      const resolvedNodeType = (data.nodeType as string) || '';
      const iter = (data as any).iteration ?? 0;
      try {
        if (event.type === 'step.started') {
          // Upsert: update existing row for this (exec, node, iteration) or insert new
          const [existing] = await db.select({ id: executionSteps.id })
            .from(executionSteps)
            .where(and(eq(executionSteps.execution_id, exec.id), eq(executionSteps.node_id, resolvedNodeId), eq(executionSteps.iteration, iter)))
            .limit(1);
          if (existing) {
            await db.update(executionSteps).set({
              status: 'running', input: data.input as any, started_at: new Date(),
            }).where(eq(executionSteps.id, existing.id));
          } else {
            await db.insert(executionSteps).values({
              execution_id: exec.id, node_id: resolvedNodeId, node_type: resolvedNodeType,
              node_label: data.nodeLabel as string | null, iteration: iter,
              status: 'running', input: data.input as any, started_at: new Date(),
            });
          }
        } else if (event.type === 'step.completed') {
          await db.update(executionSteps).set({
            status: 'completed', output: data.output as any, completed_at: new Date(),
          }).where(and(
            eq(executionSteps.execution_id, exec.id),
            eq(executionSteps.node_id, resolvedNodeId),
            eq(executionSteps.iteration, iter),
          ));
        } else if (event.type === 'step.failed') {
          await db.update(executionSteps).set({
            status: 'failed', error: data.error as string, completed_at: new Date(),
          }).where(and(
            eq(executionSteps.execution_id, exec.id),
            eq(executionSteps.node_id, resolvedNodeId),
            eq(executionSteps.iteration, iter),
          ));
        }
      } catch (e) { console.error('Failed to persist step:', e); }
    };
    const result = await executor.execute(
      flowDef,
      mergedInput,
      persistStep,
      executionContext,
      { replayFrom: hitlEntry.nodeId, replayOutputs: savedOutputs, inputOverride: mergedInput, initialIteration: (exec.output as any)?._nextIteration ?? 1 },
    );

    // Calculate total paused time (if any)
    const prevPausedAt = (exec.output as any)?._pausedAt;
    const prevPausedTotal = (exec.output as any)?._pausedTotal || 0;
    const pausedTotal = prevPausedAt ? prevPausedTotal + (Date.now() - prevPausedAt) : prevPausedTotal;

    // Success — no more HITLs hit. Mark execution as completed (UPDATE, don't create new).
    await db
      .update(executions)
      .set({
        status: 'completed',
        output: { ...(result.output as object), _pausedTotal: pausedTotal } as any,
        pending_hitls: JSON.stringify([]) as any,
        completed_at: new Date(),
      })
      .where(eq(executions.id, exec.id));

      res.json({ status: 'completed', executionId: exec.id, output: result.output });
    } catch (err) {
      if (err instanceof HitlPauseError) {
        // Another HITL was hit — add to pending list, set back to awaiting_approval
        const stillPending = pendingHitls.filter((h: any) => h.nodeId !== hitlEntry.nodeId);
        const newHitls = [...stillPending, { nodeId: err.nodeId, prompt: err.prompt, buttons: err.buttons, savedOutputs: err.savedOutputs }];
        const currentIter = (exec.output as any)?._nextIteration ?? 1;
        const prevPausedAt2 = (exec.output as any)?._pausedAt;
      const prevPausedTotal2 = (exec.output as any)?._pausedTotal || 0;
      const addPause2 = prevPausedAt2 ? (Date.now() - prevPausedAt2) : 0;
      await db
        .update(executions)
        .set({
          status: 'awaiting_approval',
            output: { ...err.savedOutputs, _hitlButtons: err.buttons, _hitlPrompt: err.prompt, _pausedTotal: prevPausedTotal2 + addPause2, _pausedAt: Date.now(), _nextIteration: currentIter + 1 } as any,
          pending_hitls: JSON.stringify(newHitls) as any,
        })
        .where(eq(executions.id, exec.id));

      res.json({ status: 'awaiting_approval', executionId: exec.id, message: 'Another HITL node requires approval' });
      return;
    }

    // Handle FlowStopError or any other error
    const error = err instanceof Error ? err.message : String(err);
    const isCancelled = err instanceof FlowStopError;
    await db
      .update(executions)
      .set({
        status: isCancelled ? 'cancelled' : 'failed',
        error,
        completed_at: new Date(),
      })
      .where(eq(executions.id, exec.id));
    res.status(500).json({ status: isCancelled ? 'cancelled' : 'failed', error });
  }
}));

// ── POST /api/executions/:executionId/reject — reject HITL ──────────────────────

router.post('/executions/:executionId/reject', requirePermission('execution:approve'), asyncHandler(async (req, res) => {
  const executionId = req.params.executionId as string;

  const [exec] = await db.select().from(executions).where(eq(executions.id, executionId));
  if (!exec) { res.status(404).json({ error: 'Execution not found' }); return; }
  if (exec.status !== 'awaiting_approval') { res.status(400).json({ error: 'Not awaiting approval' }); return; }

  await db.update(executions)
    .set({ status: 'cancelled', error: 'Rejected by user', completed_at: new Date() })
    .where(eq(executions.id, executionId));

  res.json({ status: 'rejected' });
}));

// ── GET /api/flows/:flowId/executions — list past executions ───────────────────

router.get(
  '/flows/:flowId/executions',
  asyncHandler(async (req, res) => {
    const flowId = req.params.flowId as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const [result, countResult] = await Promise.all([
      db.select().from(executions).where(eq(executions.flow_id, flowId)).orderBy(desc(executions.created_at)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(executions).where(eq(executions.flow_id, flowId)),
    ]);
    res.json({ data: result, total: Number(countResult[0].count), limit, offset });
  }),
);

// ── GET /api/flows/:flowId/executions/:executionId — execution with steps ──────

router.get(
  '/flows/:flowId/executions/:executionId',
  asyncHandler(async (req, res) => {
    const executionId = req.params.executionId as string;

    const [exec] = await db
      .select()
      .from(executions)
      .where(eq(executions.id, executionId));
    if (!exec) {
      res.status(404).json({ message: 'Execution not found' });
      return;
    }

    const steps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.execution_id, executionId))
      .orderBy(executionSteps.started_at);

    res.json({ ...exec, steps });
  }),
);

export default router;
