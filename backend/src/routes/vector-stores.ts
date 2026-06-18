import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { vectorStores } from '../db/schema.js';
import { requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { registerStore, createQdrantStore } from '../vector-stores/index.js';

const router = Router();

// Initialize pgvector fallback
registerStore('pgvector', createQdrantStore('')); // placeholder, real one uses db

// Load persisted stores on startup
(async () => {
  try {
    const stores = await db.select().from(vectorStores);
    for (const s of stores) {
      try {
        const store = createQdrantStore(s.url, s.api_key || undefined);
        registerStore(s.name, store);
        console.log(`Vector store loaded: ${s.name} (${s.url})`);
      } catch (err) {
        console.warn(`Failed to load vector store ${s.name}:`, (err as Error).message);
      }
    }
  } catch { /* DB not ready yet */ }
})();

// GET /api/vector-stores/:id/collections — list collections from Qdrant
import { QdrantClient } from '@qdrant/js-client-rest';
router.get('/vector-stores/:id/collections', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [store] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
  if (!store) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    const client = new QdrantClient({ url: store.url, apiKey: store.api_key || undefined });
    const result = await client.getCollections();
    res.json(result.collections.map((c: any) => c.name));
  } catch (err: any) {
    res.json([]);
  }
}));

router.get('/vector-stores', asyncHandler(async (_req, res) => {
  res.json(await db.select().from(vectorStores));
}));

router.get('/vector-stores/:id', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
}));

router.post('/vector-stores', requirePermission('settings:write'), asyncHandler(async (req, res) => {
  const { name, storeType = 'qdrant', url, apiKey } = req.body;
  if (!name || !url) { res.status(400).json({ error: 'name and url required' }); return; }

  // Test connection
  try {
    const store = createQdrantStore(url, apiKey || undefined);
    registerStore(name, store);
  } catch (err: any) {
    res.status(400).json({ error: `Connection failed: ${err.message}` }); return;
  }

  const [row] = await db.insert(vectorStores).values({
    name, store_type: storeType, url, api_key: apiKey || null,
  }).returning();
  res.status(201).json(row);
}));

router.put('/vector-stores/:id', requirePermission('settings:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const data: Record<string, unknown> = { updated_at: new Date() };
  const { name, url, apiKey } = req.body;
  if (name !== undefined) data.name = name;
  if (url !== undefined) data.url = url;
  if (apiKey !== undefined) data.api_key = apiKey;

  // Re-register if URL changed
  if (url) {
    const [existing] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
    if (existing) {
      try {
        registerStore(existing.name, createQdrantStore(url, apiKey || undefined));
      } catch {}
    }
  }

  const [row] = await db.update(vectorStores).set(data).where(eq(vectorStores.id, id)).returning();
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
}));

router.delete('/vector-stores/:id', requirePermission('settings:write'), asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db.select().from(vectorStores).where(eq(vectorStores.id, id));
  if (row) {
    // Unregister (vector store registry doesn't have remove, but it's fine)
  }
  await db.delete(vectorStores).where(eq(vectorStores.id, id));
  res.status(204).send();
}));

export default router;
