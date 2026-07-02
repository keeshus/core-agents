CREATE TABLE "encryption_key_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"key_material_encrypted" text NOT NULL,
	"key_material_iv" text NOT NULL,
	"key_material_tag" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp,
	"deactivated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "encryption_key_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_vault_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"vault_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_vault_config_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT 'local' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "secret_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret_id" uuid,
	"action" text NOT NULL,
	"user_id" uuid,
	"ip_address" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"vault_type" text DEFAULT 'cyberark' NOT NULL,
	"base_url" text NOT NULL,
	"auth_type" text DEFAULT 'client_credentials' NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"ca_cert" text,
	"is_connected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'app' NOT NULL,
	"scope_id" uuid,
	"encrypted_value" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"encryption_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flow_versions" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "user_assignments" ADD COLUMN "assigned_to_group_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oidc_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oidc_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_vault_config" ADD CONSTRAINT "group_vault_config_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_vault_config" ADD CONSTRAINT "group_vault_config_vault_id_secret_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."secret_vaults"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_access_log" ADD CONSTRAINT "secret_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_assigned_to_group_id_groups_id_fk" FOREIGN KEY ("assigned_to_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;