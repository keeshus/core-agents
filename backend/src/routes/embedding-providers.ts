import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { embeddingProviders } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get('/embedding-providers', asyncHandler(async (_req, res) => {
  res.json(await db.select().from(embeddingProviders));
}));

router.get('/embedding-providers/:id', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, id));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
}));

router.post('/embedding-providers', requirePermission('settings:write'), asyncHandler(async (req, res) => {
  const { name, providerType, baseUrl, apiKey, model } = req.body;
  if (!name || !providerType || !apiKey) {
    res.status(400).json({ error: 'name, providerType, and apiKey required' }); return;
  }
  const [row] = await db.insert(embeddingProviders).values({
    name, provider_type: providerType, base_url: baseUrl || null, api_key: apiKey, model: model || 'text-embedding-ada-002',
  }).returning();
  res.status(201).json(row);
}));

router.put('/embedding-providers/:id', requirePermission('settings:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const data: Record<string, unknown> = { updated_at: new Date() };
  const { name, providerType, baseUrl, apiKey, model } = req.body;
  if (name !== undefined) data.name = name;
  if (providerType !== undefined) data.provider_type = providerType;
  if (baseUrl !== undefined) data.base_url = baseUrl;
  if (apiKey !== undefined) data.api_key = apiKey;
  if (model !== undefined) data.model = model;
  const [row] = await db.update(embeddingProviders).set(data).where(eq(embeddingProviders.id, id)).returning();
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
}));

router.delete('/embedding-providers/:id', requirePermission('settings:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  await db.delete(embeddingProviders).where(eq(embeddingProviders.id, id));
  res.status(204).send();
}));

export default router;
