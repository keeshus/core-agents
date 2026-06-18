-- Add awaiting_approval to execution_status enum
ALTER TYPE "execution_status" ADD VALUE IF NOT EXISTS 'awaiting_approval';
--> statement-breakpoint
-- Add pending_hitls JSONB column to executions table
ALTER TABLE "executions" ADD COLUMN IF NOT EXISTS "pending_hitls" jsonb DEFAULT '[]'::jsonb;
