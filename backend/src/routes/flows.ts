import { Router } from 'express';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { flows, flowVersions, executions, executionSteps, chatMessages, chatSessions, userAssignments, users } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// GET /api/flows — list all flows
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const search = (req.query.search as string) || '';
    const sortBy = (req.query.sort as string) === 'created_at' ? flows.created_at : flows.updated_at;
    const orderDir = (req.query.order as string) === 'asc' ? asc : desc;
    const whereClause = search
      ? sql`(${flows.name}::text ILIKE ${'%' + search + '%'} OR ${flows.description}::text ILIKE ${'%' + search + '%'})`
      : undefined;
    const baseQuery = db.select({
      id: flows.id,
      name: flows.name,
      description: flows.description,
      nodes: flows.nodes,
      edges: flows.edges,
      version: flows.version,
      created_by: flows.created_by,
      created_by_name: users.name,
      created_at: flows.created_at,
      updated_at: flows.updated_at,
    }).from(flows).leftJoin(users, eq(flows.created_by, users.id));
    const countQuery = db.select({ count: sql<number>`count(*)` }).from(flows);
    const dataPromise = (whereClause ? baseQuery.where(whereClause) : baseQuery).orderBy(orderDir(sortBy)).limit(limit).offset(offset);
    const countPromise = whereClause ? countQuery.where(whereClause) : countQuery;
    const [result, countResult] = await Promise.all([dataPromise, countPromise]);
    const sortParam = (req.query.sort as string) === 'created_at' ? 'created_at' : 'updated_at';
    res.json({ data: result, total: Number(countResult[0].count), limit, offset, search: search || undefined, sort: sortParam });
  }),
);

// GET /api/flows/check-name — check if a flow name is already taken
router.get(
  '/check-name',
  asyncHandler(async (req, res) => {
    const name = req.query.name as string;
    const excludeId = req.query.exclude as string | undefined;
    if (!name || !name.trim()) {
      res.json({ available: false });
      return;
    }
    const conditions = [sql`LOWER(${flows.name}) = LOWER(${name.trim()})`];
    if (excludeId) conditions.push(sql`${flows.id} != ${excludeId}`);
    const result = await db.select({ id: flows.id }).from(flows).where(and(...conditions)).limit(1);
    res.json({ available: result.length === 0 });
  }),
);

// GET /api/flows/:id — get single flow by id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const result = await db.select({
      id: flows.id,
      name: flows.name,
      description: flows.description,
      nodes: flows.nodes,
      edges: flows.edges,
      version: flows.version,
      created_by: flows.created_by,
      created_by_name: users.name,
      created_at: flows.created_at,
      updated_at: flows.updated_at,
    }).from(flows).leftJoin(users, eq(flows.created_by, users.id)).where(eq(flows.id, id)).limit(1);

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
        created_by: req.user?.userId,
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

    // Cascade-delete all related records in a single transaction
    await db.transaction(async (tx) => {
      const sessions = await tx.select({ id: chatSessions.id }).from(chatSessions).where(eq(chatSessions.flow_id, id));
      for (const s of sessions) {
        await tx.delete(chatMessages).where(eq(chatMessages.session_id, s.id));
      }
      await tx.delete(chatSessions).where(eq(chatSessions.flow_id, id));

      const execs = await tx.select({ id: executions.id }).from(executions).where(eq(executions.flow_id, id));
      for (const e of execs) {
        await tx.delete(executionSteps).where(eq(executionSteps.execution_id, e.id));
        await tx.delete(userAssignments).where(eq(userAssignments.execution_id, e.id));
      }
      await tx.delete(executions).where(eq(executions.flow_id, id));

      await tx.delete(flowVersions).where(eq(flowVersions.flow_id, id));

      const result = await tx.delete(flows).where(eq(flows.id, id)).returning();
      if (result.length === 0) {
        throw new Error('Flow not found');
      }
    });

    res.status(204).send();
  }),
);

export default router;
