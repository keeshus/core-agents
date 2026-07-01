CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT 'local' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"client_secret" text DEFAULT '' NOT NULL,
	"issuer" text DEFAULT '' NOT NULL,
	"redirect_uri" text DEFAULT 'http://localhost:3001/api/auth/sso/callback' NOT NULL,
	"group_claim" text DEFAULT 'groups' NOT NULL,
	"admin_group_mapping" text[] DEFAULT '{}' NOT NULL,
	"editor_group_mapping" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sso_config_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "user_assignments" ADD COLUMN "assigned_to_group_id" uuid;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_assigned_to_group_id_groups_id_fk" FOREIGN KEY ("assigned_to_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_user_id_unique" UNIQUE("group_id", "user_id");
