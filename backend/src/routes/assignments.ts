import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { userAssignments, executions } from '../db/schema.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/assignments?status=pending — list assignments for current user
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const status = req.query.status as string | undefined;

  const conditions = [
    eq(userAssignments.assigned_to_user_id, userId),
  ];
  if (status) {
    conditions.push(eq(userAssignments.status, status));
  }

  const assignments = await db
    .select()
    .from(userAssignments)
    .where(and(...conditions))
    .orderBy(desc(userAssignments.created_at));

  // Enrich with execution info
  const enriched = await Promise.all(assignments.map(async (a) => {
    const [exec] = await db
      .select({ id: executions.id, flow_id: executions.id, status: executions.status })
      .from(executions)
      .where(eq(executions.id, a.execution_id));
    return { ...a, execution: exec || null };
  }));

  res.json(enriched);
}));

// POST /api/assignments/:id/decide — approve/reject an assignment
router.post('/:id/decide', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const { status: decision, feedback } = req.body || {};
  const userId = req.user!.userId;

  if (!decision || !['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Status must be "approved" or "rejected"' });
    return;
  }

  const [assignment] = await db
    .select()
    .from(userAssignments)
    .where(eq(userAssignments.id, id));

  if (!assignment) {
    res.status(404).json({ error: 'Assignment not found' });
    return;
  }

  if (assignment.status !== 'pending') {
    res.status(400).json({ error: 'Assignment already decided' });
    return;
  }

  await db
    .update(userAssignments)
    .set({
      status: decision,
      feedback: feedback || null,
      decided_by_user_id: userId,
      decided_at: new Date(),
    })
    .where(eq(userAssignments.id, id));

  res.json({ status: 'updated' });
}));

export default router;
