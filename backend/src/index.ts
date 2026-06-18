import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import flowsRouter from './routes/flows.js';
import catalogRouter from './routes/catalog.js';
import llmEndpointsRouter from './routes/llm-endpoints.js';
import mcpServersRouter from './routes/mcp-servers.js';
import executionRouter from './routes/execution.js';
import documentsRouter from './routes/documents.js';
import chatRouter from './routes/chat.js';
import webhookRouter from './routes/webhook.js';
import knowledgeRouter from './routes/knowledge.js';
import vectorStoresRouter from './routes/vector-stores.js';
import embeddingProvidersRouter from './routes/embedding-providers.js';
import authRouter from './routes/auth.js';
import assignmentsRouter from './routes/assignments.js';
import adminRouter from './routes/admin.js';
import { authenticate } from './middleware/auth.js';
import { asyncHandler } from './utils/async-handler.js';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Health check
app.get(
  '/api/health',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ status: 'ok', project: 'Core Agents' });
  }),
);

// Public auth routes (no authentication required)
app.use('/api/auth', authRouter);

// Protected routes (authentication required)
app.use('/api/flows', authenticate, flowsRouter);
app.use('/api/catalog', authenticate, catalogRouter);
app.use('/api/llm-endpoints', authenticate, llmEndpointsRouter);
app.use('/api/mcp-servers', authenticate, mcpServersRouter);
app.use('/api', authenticate, executionRouter);  // Handles /api/flows/:flowId/execute and /api/flows/:flowId/executions
app.use('/api', authenticate, documentsRouter);  // Handles /api/documents/*
app.use('/api', authenticate, chatRouter);       // Handles /api/chat/*
app.use('/api', authenticate, webhookRouter);   // Handles /api/webhook/*
app.use('/api', authenticate, knowledgeRouter); // Handles /api/knowledge/*
app.use('/api', authenticate, embeddingProvidersRouter); // Handles /api/embedding-providers/*
app.use('/api', authenticate, vectorStoresRouter); // Handles /api/vector-stores/*
app.use('/api', authenticate, assignmentsRouter); // Handles /api/assignments/*
app.use('/api', authenticate, adminRouter); // Handles /api/admin/*

// Global error handler (Express 5)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});

export default app;
