# Secrets Management & CyberArk Integration Plan

## Overview

Add a layered secrets management system to Core Agents with three scopes (app-wide, group, flow) plus CyberArk vault integration at the group level. Introduce a `group_admin` role for delegated group management.

**Bold text below marks what already exists** from the merged groups feature — everything else is new work.

---

## 1. Existing Groups Infrastructure

The following already exists from the groups feature and needs no changes:

### `groups` table (`backend/src/db/schema.ts:44-50`)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `name` | `text` | `notNull().unique()` |
| `description` | `text` | `default('')` |
| `provider` | `text` | `default('local')` — `'local'` or SSO provider name |
| `created_at` | `timestamp` | `defaultNow()` |

### `group_members` table (`backend/src/db/schema.ts:52-57`)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `group_id` | `uuid` FK → `groups.id` | `notNull()` |
| `user_id` | `uuid` FK → `users.id` | `notNull()` |
| `created_at` | `timestamp` | |

Unique on `(group_id, user_id)`. Membership is binary — **no group-level role column exists yet**.

### Existing routes (`backend/src/routes/groups.ts`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/groups` | `group:read` | List all groups with member count |
| `GET` | `/api/groups/:id` | `group:read` | Single group with members |
| `POST` | `/api/groups` | `group:write` | Create local group |
| `PUT` | `/api/groups/:id` | `group:write` | Update local group (SSO groups read-only) |
| `DELETE` | `/api/groups/:id` | `group:write` | Delete local group + cascade members |
| `POST` | `/api/groups/:id/members` | `group:write` | Add member (local groups only) |
| `DELETE` | `/api/groups/:id/members/:userId` | `group:write` | Remove member (local groups only) |

### Existing permissions
- `group:read` — on `admin` and `editor` roles
- `group:write` — on `admin` role only

### Existing frontend
- `frontend/pages/settings/groups.tsx` — full CRUD UI with member management
- Card-based group list with expand/collapse per-group member panels
- Create/Edit modals, search, delete confirmation

### Existing flow-group binding
- `flows.group_id` column — flows can be scoped to a group
- `execution.ts` enforces visibility: flows with `group_id` only visible to group members
- `userAssignments.assigned_to_group_id` — HITL can target groups

---

## 2. New Database Tables

### `secrets`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `name` | `text` | display name / identifier |
| `scope` | `text` | `'app' \| 'group' \| 'flow'` |
| `scope_id` | `uuid?` | nullable — FK to `groups.id` or `flows.id` |
| `encrypted_value` | `text` | AES-256-GCM ciphertext (base64) |
| `encryption_iv` | `text` | IV used for this secret (base64) |
| `encryption_tag` | `text` | GCM auth tag (base64) |
| `key_version` | `integer` | which key version encrypted this |
| `created_by` | `uuid` FK → `users.id` | |
| `expires_at` | `timestamp?` | optional TTL |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

Unique on `(name, scope, scope_id)`.

### `encryption_key_versions`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `version` | `integer` | `notNull().unique()` — sequential |
| `key_material_encrypted` | `text` | AES-256-GCM encrypted data key (wrapped with KEK) |
| `key_material_iv` | `text` | IV for the wrapping |
| `key_material_tag` | `text` | GCM auth tag |
| `is_current` | `boolean` | exactly one row `true` |
| `activated_at` | `timestamp` | |
| `deactivated_at` | `timestamp?` | |
| `created_at` | `timestamp` | |

### `secret_vaults` (CyberArk connections)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | display name |
| `vault_type` | `text` | `default('cyberark')` |
| `base_url` | `text` | CyberArk REST API endpoint |
| `auth_type` | `text` | `'client_credentials' \| 'certificate'` |
| `client_id` | `text` | encrypted service account ID |
| `client_secret` | `text` | encrypted service account secret |
| `ca_cert` | `text?` | optional CA cert (PEM) |
| `is_connected` | `boolean` | `default(false)` |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

### `group_vault_config`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `group_id` | `uuid` FK → `groups.id` | `notNull().unique()` — one vault per group |
| `vault_id` | `uuid` FK → `secret_vaults.id` | `notNull()` |
| `enabled` | `boolean` | `default(true)` |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

### `secret_access_log`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `secret_id` | `uuid?` | FK → `secrets.id` (nullable for CyberArk queries) |
| `action` | `text` | `'created' \| 'read' \| 'updated' \| 'deleted' \| 'revealed' \| 'cyberark_query' \| 'tool_access'` |
| `user_id` | `uuid` FK → `users.id` | nullable for system actions |
| `ip_address` | `text?` | |
| `metadata` | `jsonb` | extra context |
| `created_at` | `timestamp` | |

---

## 3. Encryption System

**Module**: `backend/src/utils/encryption.ts`

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Encoding**: base64
- **Envelope**: `SECRETS_ENCRYPTION_KEY` (env KEK) wraps DEKs in `encryption_key_versions` table

### Master KEK
- `SECRETS_ENCRYPTION_KEY` — 64 hex chars = 256-bit key
- **Required**: backend crashes at startup if missing or wrong length
- Dev test key in `.env`

### API
```ts
function encrypt(plaintext: string): Promise<{ encryptedValue: string; iv: string; tag: string; keyVersion: number }>
function decrypt(encryptedValue: string, iv: string, tag: string, keyVersion: number): Promise<string>
function rotateEncryptionKey(): Promise<{ version: number }>
function reEncryptAllSecrets(oldVersion: number, newVersion: number): Promise<number>
```

### Rotation flow
1. `POST /api/secrets/rotate-key` → generates new DEK, stores wrapped, marks current
2. Old key stays for reads (secrets reference `key_version`)
3. `POST /api/secrets/re-encrypt` → migrates old-version secrets to new key
4. Old key purged once no secrets reference it

---

## 4. Permissions & Roles — New Additions

### New permission strings

| Permission | Description |
|---|---|
| `secrets:read` | Read secrets — list metadata, reveal values |
| `secrets:write` | Create/update/delete secrets |
| `secrets:read_app` | Read app-wide secrets |
| `secrets:write_app` | Manage app-wide secrets |
| `secrets:read_group` | Read group secrets (requires group membership) |
| `secrets:write_group` | Manage group secrets (requires group membership) |
| `secrets:rotate` | Trigger key rotation |
| `secrets:audit` | View audit log |
| `vaults:read` | View vault configuration |
| `vaults:write` | Create/edit/delete vaults |
| `groups:manage` | Group-level management (group admin) — add/remove members, assign vault |

### Modification needed: `group_members` table
Add a `role` column to `group_members`:
```ts
role: text('role').notNull().default('member')  // 'admin' | 'member'
```
This distinguishes group admins from regular members. Existing rows get `'member'`.

### New role: `group_admin`
```
secrets:read_group
secrets:write_group
vaults:read
groups:read
groups:manage
```

### Updated role seeds

**`admin`** gains:
```
secrets:read, secrets:write, secrets:read_app, secrets:write_app,
secrets:read_group, secrets:write_group,
secrets:rotate, secrets:audit,
vaults:read, vaults:write,
group:read, group:write, groups:manage
```

**`editor`** unchanged (already has `group:read`).

---

## 5. Backend Routes — New

### 5.1 `/api/secrets` — `backend/src/routes/secrets.ts` (NEW)

| Method | Path | Auth | Permissions | Notes |
|---|---|---|---|---|
| `GET` | `/api/secrets` | JWT | `secrets:read*` | Query: `scope`, `scopeId`. Metadata only — never the value |
| `POST` | `/api/secrets` | JWT | `secrets:write*` | Body: `{ name, value, scope, scopeId? }`. Encrypts |
| `PUT` | `/api/secrets/:id` | JWT | `secrets:write*` | Body: `{ value }`. Re-encrypts |
| `DELETE` | `/api/secrets/:id` | JWT | `secrets:write*` | Hard delete + audit log |
| `POST` | `/api/secrets/:id/reveal` | JWT | `secrets:read*` | Returns `{ value }`. Audit-logged. Rate-limited |
| `GET` | `/api/secrets/audit-log` | JWT | `secrets:audit` | Paginated access log |
| `POST` | `/api/secrets/rotate-key` | JWT | `secrets:rotate` | New key version |
| `POST` | `/api/secrets/re-encrypt` | JWT | `secrets:rotate` | Re-encrypt all secrets |

**Scope auth rules:**
- `scope=app` → `secrets:read_app` or `secrets:write_app`
- `scope=group` → group membership (`group_members`) + `secrets:read_group`/`secrets:write_group`
- `scope=flow` → flow access (flow owner, group member, or admin) + `secrets:read`/`secrets:write`

### 5.2 `/api/secret-vaults` — `backend/src/routes/secret-vaults.ts` (NEW)

| Method | Path | Auth | Permissions | Notes |
|---|---|---|---|---|
| `GET` | `/api/secret-vaults` | JWT | `vaults:read` | List vaults (redacts credentials) |
| `POST` | `/api/secret-vaults` | JWT | `vaults:write` | Create vault. Encrypts credentials |
| `PUT` | `/api/secret-vaults/:id` | JWT | `vaults:write` | Update |
| `DELETE` | `/api/secret-vaults/:id` | JWT | `vaults:write` | Blocks if bound to active groups |
| `POST` | `/api/secret-vaults/:id/test` | JWT | `vaults:write` | Test CyberArk connectivity |

### 5.3 `/api/group-vault-config` — `backend/src/routes/group-vault-config.ts` (NEW)

| Method | Path | Auth | Permissions | Notes |
|---|---|---|---|---|
| `GET` | `/api/group-vault-config/:groupId` | JWT | group membership | Get vault binding |
| `PUT` | `/api/group-vault-config/:groupId` | JWT | `groups:manage` or `group:write` | Set/change vault. Body: `{ vaultId, enabled }` |

### 5.4 Groups routes — modifications to existing

Add `PUT /api/groups/:id/members/:userId/role` to set member role to `admin`/`member`:
- Permission: `groups:manage` (group admin) or `group:write` (system admin)
- Body: `{ role: 'admin' | 'member' }`

---

## 6. Template Variable Resolution

**Two distinct namespaces:**

| Syntax | Resolution |
|---|---|
| `{{secrets.core.NAME}}` | Local secrets: flow scope → group scope → app scope (first match wins) |
| `{{secrets.core.group:NAME}}` | Force local group scope only |
| `{{secrets.core.app:NAME}}` | Force local app scope only |
| `{{secrets.cyberark.PATH}}` | **Live CyberArk query** — resolves against the flow's group vault at runtime, never cached |

**ExecutionContext additions:**
```ts
interface ExecutionContext {
  // existing fields...
  getSecret?: (secretName: string, options?: { scope?: 'app' | 'group' | 'flow' }) => Promise<string | null>;
  getCyberArkSecret?: (secretPath: string) => Promise<string | null>;
}
```

When the resolver sees `{{secrets.core.NAME}}`, it looks up the local `secrets` table scoped to the execution context.
When it sees `{{secrets.cyberark.PATH}}`, it looks up the flow's `group_id`, then the group's vault binding (`group_vault_config`), and calls CyberArk live.

---

## 7. CyberArk Integration — Live Query Model

### Connection
- CyberArk Secrets Manager / Conjur REST API
- Auth: OAuth2 client credentials or mTLS
- Credentials encrypted with AES-256-GCM in `secret_vaults`
- Admin configures vaults; group admin binds a vault to their group

### Group-level only
- No app-wide or flow-level vaults
- Group admin selects a vault via the group detail page
- All flows belonging to that group can query the vault at runtime
- `group_vault_config` binds one vault to one group (one-to-one, but a vault can be assigned to multiple groups)

### Live query flow
```
Flow execution encounters {{secrets.cyberark.Apps/Prod/DB_PASSWORD}}
  │
  ├─ Flow belongs to group? → No → error
  ├─ Group has vault binding? → No → error
  ├─ getCyberArkSecret("Apps/Prod/DB_PASSWORD"):
  │   ├─ CyberArk API: authenticate() → token
  │   ├─ CyberArk API: GET /secrets/Apps/Prod/DB_PASSWORD
  │   └─ Returns value
  ├─ Audit log: { action: 'cyberark_query', secretPath, flowId, userId }
  └─ Injected into execution context (never returned to LLM, never logged)
```

### Caching
- **Per-execution in-memory cache**: repeated `{{secrets.cyberark.X}}` for same path within one flow run are cached
- **No cross-execution cache**: every new execution queries CyberArk fresh

### Audit
Every CyberArk query logged to `secret_access_log` with path, flow ID, group ID, user ID.

---

## 8. LLM Agent Built-in Tool: `secret_get`

### Guardrails
| Guardrail | Implementation |
|---|---|
| Scope-bound | Can only access secrets the execution context allows |
| Audit-logged | Every call logged with `action='tool_access'` |
| Silent injection | Value injected into execution context — NOT returned to LLM |
| Rate-limited | Max 10 calls per execution |
| Opt-in | Must be explicitly enabled in LLM Agent node config |
| Permission-gated | User needs `secrets:read` at the relevant scope |

```ts
{
  name: 'secret_get',
  parameters: {
    name: { type: 'string' },
    cyberark: { type: 'boolean', default: false },
  },
  handler: async ({ name, cyberark }, context) => {
    const value = cyberark
      ? await context.getCyberArkSecret?.(name)
      : await context.getSecret?.(name);
    if (!value) return { success: false, error: 'Secret not found' };
    context.setSecret?.(name, value);
    return { success: true, name }; // NO value returned to LLM
  },
}
```

---

## 9. Co-Pilot Tools

Co-pilot manages **metadata only** — no `reveal_secret` tool.

| Tool | Parameters | Returns | Permission |
|---|---|---|---|
| `list_secrets` | `scope?, scopeId?, search?` | `[{ id, name, scope, updatedAt }]` | `secrets:read*` |
| `create_secret` | `name, value, scope, scopeId?` | `{ id, name }` | `secrets:write*` |
| `update_secret` | `id, value` | `{ success }` | `secrets:write*` |
| `delete_secret` | `id` | `{ success }` | `secrets:write*` |
| `list_vaults` | none | `[{ id, name, isConnected }]` | `vaults:read` |
| `test_vault_connection` | `vaultId` | `{ success }` or error | `vaults:write` |
| `list_groups` | none | `[{ id, name }]` | `groups:read` |
| `get_group_vault` | `groupId` | `{ vaultId, name, enabled }` | group membership |
| `set_group_vault` | `groupId, vaultId, enabled?` | `{ success }` | `groups:manage` |
| `rotate_key` | none | `{ version }` | `secrets:rotate` |

---

## 10. Frontend Pages

### 10.1 `/settings/secrets` (NEW)
- Scope tabs: "App-wide" | "Group: X" (per user's groups) | "Flow: Y"
- Secret list: name, updated, actions (reveal, edit, delete)
- Reveal button → ConfirmDialog → shows value for 10s
- CyberArk info section: shows bound vault for current group

### 10.2 `/settings/secret-vaults` (NEW, admin only)
- Card list with connection status indicators
- Add/Edit vault modal
- "Test Connection" per vault
- Shows which groups use each vault

### 10.3 Group detail — vault tab (enhance existing)
- Add vault selection dropdown (visible to group admin)
- Enable/disable toggle
- Info: "Flows in this group can use {{secrets.cyberark.PATH}}"

### 10.4 Group detail — members (enhance existing)
- Add role badge next to each member: "Admin" / "Member"
- Group admin can promote/demote members
- Group admin can add/remove members

### 10.5 Flow editor (enhance existing)
- "Secrets" button in toolbar
- Sidebar panel with local secrets tab + CyberArk info tab
- Autocomplete for `{{secrets.core.` and `{{secrets.cyberark.` in node configs
- Validation: `{{secrets.cyberark.*}}` flagged if no group vault

---

## 11. Tests

### Backend unit tests
| File | What it tests |
|---|---|
| `backend/src/utils/encryption.test.ts` | AES encrypt/decrypt, rotation, re-encrypt, missing key crash |
| `backend/src/routes/__tests__/secrets.test.ts` | CRUD all scopes, reveal, rate-limit, audit log, permissions |
| `backend/src/routes/__tests__/secret-vaults.test.ts` | Vault CRUD, test connection, encrypted credentials |
| `backend/src/routes/__tests__/group-vault-config.test.ts` | Get/set vault binding, group admin vs member access |
| `backend/src/services/__tests__/cyberark.test.ts` | Auth, getSecret, cert auth, token refresh (mocked) |

### Worker unit tests
| File | What it tests |
|---|---|
| `worker/src/executor/__tests__/secrets-resolution.test.ts` | `{{secrets.core.*}}` resolution, `{{secrets.cyberark.*}}` resolution, mixed templates |
| `worker/src/tools/__tests__/secret-get.test.ts` | Local vs cyberark, silent injection, rate limit, audit |

### Frontend unit tests
| File | What it tests |
|---|---|
| `frontend/src/components/assistant/tools/__tests__/secrets-tools.test.ts` | All co-pilot tools, no reveal tool, error handling |

### E2E tests
| File | What it tests |
|---|---|
| `test/e2e/96-secrets.spec.ts` | CRUD, reveal, rotation, group secrets, flow editor validation |
| `test/e2e/97-cyberark.spec.ts` | Vault CRUD, test connection, group binding, flow execution with mock |

---

## 12. Implementation Order

### Phase 1 — Encryption Foundation
1. `SECRETS_ENCRYPTION_KEY` in `.env` + `.env.example`
2. `backend/src/utils/encryption.ts`
3. `encryption_key_versions` table → migration
4. **Tests**: encryption.test.ts

### Phase 2 — Secrets Core
5. `secrets` + `secret_access_log` tables → migration
6. `backend/src/routes/secrets.ts`
7. New permissions + `group_admin` role seed
8. Mount routes
9. **Tests**: secrets.test.ts

### Phase 3 — Group Admin
10. Add `role` column to `group_members` → migration (default `'member'`)
11. Add `PUT /api/groups/:id/members/:userId/role` route
12. Group admin middleware utility
13. **Tests**: group-admin.test.ts

### Phase 4 — CyberArk
14. `backend/src/services/cyberark.ts`
15. `secret_vaults` + `group_vault_config` tables → migration
16. `backend/src/routes/secret-vaults.ts`
17. `backend/src/routes/group-vault-config.ts`
18. Mount routes
19. **Tests**: cyberark.test.ts, secret-vaults.test.ts, group-vault-config.test.ts

### Phase 5 — Worker
20. `getCyberArkSecret` in `ExecutionContext`
21. Template resolution for `{{secrets.core.*}}` and `{{secrets.cyberark.*}}`
22. Built-in tool `secret_get`
23. **Tests**: secrets-resolution.test.ts, secret-get.test.ts

### Phase 6 — Frontend
24. `/settings/secrets` page
25. `/settings/secret-vaults` page
26. Group detail vault + role enhancements
27. Flow editor secrets panel
28. Co-pilot tools (no reveal)
29. **E2E tests**: 96, 97

### Phase 7 — Polish
30. Rate limiting
31. Audit log viewer
32. Per-execution CyberArk caching
33. Security audit

---

## 13. Environment Variables

```env
# REQUIRED — 64 hex chars = 256-bit AES key. App crashes if missing.
SECRETS_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

---

## 14. Security

- AES-256-GCM authenticated encryption, per-secret IVs
- Envelope encryption: KEK in env, versioned DEKs in DB
- Zero-downtime key rotation
- CyberArk: live queries only, never stored locally, HTTPS + optional mTLS
- Co-pilot: metadata management only, no value reveal
- Secrets scrubbed from execution logs and flow exports
- Rate-limited reveal, full audit trail
