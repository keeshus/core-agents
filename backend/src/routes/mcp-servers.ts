import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { mcpServers } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// GET /api/mcp-servers — list all MCP servers
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await db.select().from(mcpServers);
    res.json(result);
  }),
);

// GET /api/mcp-servers/:id — get single server
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const result = await db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);

    if (result.length === 0) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    res.json(result[0]);
  }),
);

// POST /api/mcp-servers — create server (admin only)
router.post(
  '/',
  requirePermission('mcp:write'),
  asyncHandler(async (req, res) => {
    const { name, url, tools = [], enabled = true } = req.body;

    if (!name || !url) {
      res.status(400).json({ error: 'name and url are required' });
      return;
    }

    const result = await db
      .insert(mcpServers)
      .values({
        name,
        url,
        tools,
        enabled,
      })
      .returning();

    res.status(201).json(result[0]);
  }),
);

// PUT /api/mcp-servers/:id — update server (admin only)
router.put(
  '/:id',
  requirePermission('mcp:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { name, url, tools, enabled } = req.body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (tools !== undefined) updateData.tools = tools;
    if (enabled !== undefined) updateData.enabled = enabled;

    const result = await db.update(mcpServers).set(updateData).where(eq(mcpServers.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    res.json(result[0]);
  }),
);

// DELETE /api/mcp-servers/:id — delete server (admin only)
router.delete(
  '/:id',
  requirePermission('mcp:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const result = await db.delete(mcpServers).where(eq(mcpServers.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    res.status(204).send();
  }),
);

// POST /api/mcp-servers/:id/refresh — Refresh tools list from server (admin only)
router.post(
  '/:id/refresh',
  requirePermission('mcp:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, id));
    if (!server) {
      res.status(404).json({ message: 'MCP server not found' });
      return;
    }

    try {
      const { mcpHub } = await import('../../../worker/src/tools/hub.js');

      // Force reconnect
      if (mcpHub.isConnected(server.id)) {
        await mcpHub.disconnect(server.id);
      }
      await mcpHub.connect({
        id: server.id,
        name: server.name,
        url: server.url,
        enabled: server.enabled,
      });

      const tools = await mcpHub.listTools(server.id);

      const [updated] = await db.update(mcpServers)
        .set({ tools: tools as any, updated_at: new Date() })
        .where(eq(mcpServers.id, server.id))
        .returning();

      res.json({ ...updated, message: `Refreshed: ${tools.length} tools found` });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: `Failed to refresh tools: ${error}` });
    }
  }),
);

export default router;
