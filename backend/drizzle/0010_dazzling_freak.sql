ALTER TYPE "public"."execution_status" ADD VALUE 'awaiting_approval';--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "node_label" text;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "iteration" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "pending_hitls" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "llm_endpoints" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vector_stores" ADD COLUMN "collections" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;