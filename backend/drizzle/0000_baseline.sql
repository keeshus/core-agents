-- Baseline migration: create all enum types and initial tables
-- DO NOT EDIT: this is the foundational schema for the application

-- Enums
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled', 'awaiting_approval');
CREATE TYPE "public"."execution_step_status" AS ENUM('pending', 'running', 'completed', 'failed');
CREATE TYPE "public"."provider_type" AS ENUM('anthropic', 'openai', 'litellm');
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');
