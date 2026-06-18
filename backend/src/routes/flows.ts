import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { flows, flowVersions, executions, executionSteps, chatMessages, chatSessions } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// GET /api/flows — list all flows, ordered by updatedAt desc
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await db.select().from(flows).orderBy(desc(flows.updated_at));
    res.json(result);
  }),
);

// GET /api/flows/:id — get single flow by id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const result = await db.select().from(flows).where(eq(flows.id, id)).limit(1);

    if (result.length === 0) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    res.json(result[0]);
  }),
);

// POST /api/flows — create new flow (admin / editor)
router.post(
  '/',
  requirePermission('flow:create'),
  asyncHandler(async (req, res) => {
    const { name, description = '', nodes = [], edges = [] } = req.body;

    const result = await db
      .insert(flows)
      .values({
        name,
        description,
        nodes,
        edges,
      })
      .returning();

    res.status(201).json(result[0]);
  }),
);

// PUT /api/flows/:id — update flow (admin / editor)
router.put(
  '/:id',
  requirePermission('flow:edit'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { name, description, nodes, edges } = req.body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = nodes;
    if (edges !== undefined) updateData.edges = edges;

    const result = await db.update(flows).set(updateData).where(eq(flows.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    res.json(result[0]);
  }),
);

// DELETE /api/flows/:id — delete flow (admin only)
router.delete(
  '/:id',
  requirePermission('flow:delete'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    // Cascade-delete all related records
    // 1. Delete chat messages for all sessions of this flow
    const sessions = await db.select({ id: chatSessions.id }).from(chatSessions).where(eq(chatSessions.flow_id, id));
    for (const s of sessions) {
      await db.delete(chatMessages).where(eq(chatMessages.session_id, s.id));
    }
    // 2. Delete chat sessions
    await db.delete(chatSessions).where(eq(chatSessions.flow_id, id));

    // 3. Delete execution steps for all executions of this flow
    const execs = await db.select({ id: executions.id }).from(executions).where(eq(executions.flow_id, id));
    for (const e of execs) {
      await db.delete(executionSteps).where(eq(executionSteps.execution_id, e.id));
    }
    // 4. Delete executions
    await db.delete(executions).where(eq(executions.flow_id, id));

    // 5. Delete flow versions
    await db.delete(flowVersions).where(eq(flowVersions.flow_id, id));

    // 6. Delete the flow itself
    const result = await db.delete(flows).where(eq(flows.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    res.status(204).send();
  }),
);

export default router;
