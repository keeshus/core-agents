<div align="center">

# ⚡ Core Agents

**Visual LLM Agent Builder** — design, compose, and deploy intelligent agent workflows on a drag-and-drop canvas.

![Node.js](https://img.shields.io/badge/Node.js-25+-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-12-FF0072?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-1.18-000000?logo=qdrant&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

[✨ Features](#-features) · [🏗️ Architecture](#️-architecture) · [🚀 Getting Started](#-getting-started) · [📖 Usage](#-usage) · [🧪 Tests](#-tests)

---

</div>

## ✨ Features

| | |
|---|---|
| 🎨 **Visual Flow Editor** | Drag-and-drop canvas with React Flow v12. Connect triggers, LLM agents, tools, conditions, and outputs. |
| 🤖 **Multi-Provider LLM** | Anthropic, OpenAI, and LiteLLM. Select models per node. JSON output mode for structured data. |
| 🔀 **Agent Routing** | Branch nodes route execution based on conditions. LLM classifiers determine the path automatically. |
| 🧰 **MCP Tool Integration** | Connect MCP servers (SSE + Streamable HTTP). Tools wired via dedicated handles. Built-in tools auto-injected. |
| 📚 **RAG Pipeline** | Qdrant vector search with configurable embedding providers. Retriever nodes inject context into prompts. |
| ⚡ **Parallel Execution** | Run sub-nodes concurrently inside Parallel containers. Results merged by label. |
| 👤 **Human-in-the-Loop** | Flow pauses for approval with custom buttons, feedback, and role/user assignments. |
| 🧩 **Template Variables** | `{{input.Trigger.message}}`, `{{input.Summarizer.transactions[0]}}`. Autocomplete with suggestions. |
| 💬 **Chat Interface** | User-facing chat with SSE streaming, conversation history, and agent routing. |
| ⏰ **Scheduling** | Cron-based triggers via BullMQ queue. Scalable worker pool for background execution. |
| 🛡️ **Role-Based Access** | Admin, editor, and approver roles with granular domain permissions. SSO/OIDC support. |
| 🔍 **Execution History** | Step-by-step trace with inputs, outputs, tool calls, and timing breakdown. |
| 🤖 **Co-Pilot AI Assistant** | Page-aware AI assistant with SSE streaming, 30+ tools, tool call loop, and per-page conversation memory. |
| 🧠 **Smart Tool System** | 30+ tools across 9 groups — navigation, flow editor, endpoints, MCP servers, embeddings, vector stores, users, approvals, and executions. Tools auto-filtered by user permissions. |

## 🏗️ Architecture

```
┌──────────────────────────────┐
│        Frontend              │
│  ┌──────────────────────┐    │
│  │  Co-Pilot AI         │    │
│  │  (Page-aware tools,  │    │
│  │  30+ tools, SSE      │    │
│  │  chat, tool loop)    │    │
│  └──────────┬───────────┘    │
│  Next.js 16 · React Flow     │
│  Tailwind v4                  │
└──────┬───────────────────────┘
       │ HTTP / SSE
       ▼
┌──────────────────────────────┐
│  Backend (Express 5)         │
│  Flow CRUD · Chat · Auth     │
│  Co-Pilot LLM Proxy (SSE)    │
│  Drizzle ORM (PostgreSQL)    │
│  Domain RBAC · SSO/OIDC      │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Worker (Node.js)            │
│  FlowExecutor (DAG)          │
│  LLM Providers (Anthropic,   │
│    OpenAI, LiteLLM)          │
│  MCP Tool Executor           │
│  RAG Pipeline (Qdrant)       │
│  Scheduler / BullMQ Queue    │
└──────┬───────────────────────┘
       │
       ├─────────────┬──────────┐
       ▼             ▼          ▼
┌──────────┐ ┌──────────┐ ┌────────┐
│PostgreSQL│ │  Qdrant  │ │ Valkey │
│(flows,   │ │(vector   │ │(queue) │
│ execs,   │ │ search)  │ │        │
│ store)   │ │          │ │        │
└──────────┘ └──────────┘ └────────┘
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 25+
- **Docker** + **Docker Compose**
- An **API key** for at least one LLM provider

### Quick Start

```bash
# 1. Clone and install
git clone https://github.com/keeshus/CoreAgents.git
cd core-agents
npm install

# 2. Start infrastructure (PostgreSQL, Qdrant, Valkey)
docker compose up -d

# 3. Run database migrations
cd backend && npm run db:migrate && cd ..

# 4. Start all dev servers
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** — the first user to register becomes admin.

### Running Components Individually

```bash
# Backend API (port 3001)
cd backend && npm run dev

# Worker (processes scheduled and webhook flows via BullMQ)
cd worker && npm run dev:worker

# Scheduler (triggers cron-based flows)
cd worker && npm run dev:scheduler

# Frontend (port 3000)
cd frontend && npm run dev
```

### Deployment

```bash
# Docker Compose (all services)
docker compose -f docker-compose.prod.yml up -d --build

# Kubernetes
helm install core-agents ./helm/core-agents \
  --set anthropicApiKey=sk-ant-... \
  --set openaiApiKey=sk-...
```

## 📖 Usage

### Building a Flow

A typical agent workflow:

```
Trigger ──→ Retriever ──→ LLM Agent ──→ Output
                              ↕
                        MCP Tool (optional)
```

1. **🎯 Trigger** — starts the flow (manual, chat, webhook, or schedule)
2. **📄 Retriever** — fetches relevant documents from a Qdrant collection
3. **🤖 LLM Agent** — processes input with a system prompt. Connect MCP tools via the purple handle
4. **📤 Output** — returns the final result

### Template Variables

Reference upstream data in any system prompt or condition:

```handlebars
{{input.Trigger.message}}
{{input.Summarizer.content}}
{{input.Summarizer.transactions[0].amount}}
```

Type **`{{`** for autocomplete with arrow-key navigation and mouse selection.

### Input Field Selection

Check the **Select Input Nodes** checkboxes to control which upstream data a node receives. Select entire labels or individual fields using dot-notation paths.

### 🤖 Co-Pilot AI Assistant

Co-Pilot is a page-aware AI assistant embedded in every screen. It understands the current page context and has access to 30+ tools across 9 groups, auto-filtered by your role permissions.

**Tool Groups:**

| Group | Tools | Page |
|-------|-------|------|
| **Navigation** | `navigate_to`, `find_flow` | All pages |
| **Flow Editor** | `open_node`, `get_flow_json`, `update_flow`, `get_node_config`, `update_node_field`, `get_available_nodes`, `read_code`, `replace_code` | Flow editor |
| **LLM Endpoints** | `list_endpoints`, `create_endpoint`, `delete_endpoint` | Settings → Endpoints |
| **MCP Servers** | `list_mcp_servers`, `create_mcp_server`, `delete_mcp_server`, `refresh_mcp_tools` | Settings → MCP Servers |
| **Embedding Providers** | `list_embedding_providers`, `create_embedding_provider`, `delete_embedding_provider` | Settings → Knowledge |
| **Vector Stores** | `list_vector_stores`, `create_vector_store`, `delete_vector_store` | Settings → Knowledge |
| **User Management** | `list_users`, `create_user`, `delete_user`, `update_user_role` | Settings → Users |
| **Approvals** | `get_pending_approvals`, `approve_execution`, `reject_execution` | Approvals |
| **Executions** | `list_executions`, `get_execution_details` | Execution history |

**Features:**
- **Tool Call Loop** — up to 5 rounds of tool execution per message, supporting chained operations (e.g., `find_flow` → `navigate_to` → `get_flow_json` → `update_flow`)
- **Page-Aware Memory** — conversation history is saved per-page in localStorage, scoped by user ID. Switching pages preserves the conversation for when you return.
- **Role-Based Tool Filtering** — tools are only exposed if your role has the required domain permission (admin, editor, or approver).
- **SSE Streaming** — responses stream token-by-token via Server-Sent Events.
- **Anti-Hallucination** — grounded system prompts with accurate page capability descriptions prevent feature fabrication.
- **Node Configuration** — read and update any field in any open node config panel (text, textarea, select, checkbox, code, buttons).

**Setup:** Set a default LLM endpoint in Settings → LLM Endpoints. Co-Pilot uses this endpoint for all requests.

## 🧪 Tests

```bash
# Run all tests across all packages
npm test
```

| Package | Tests | Status |
|---------|-------|--------|
| **shared** | 24 | ✅ |
| **worker** | 55 | ✅ |
| **backend** | 45 | ✅ |
| **frontend** | 42 | ✅ |
| **Total** | **166** | ✅ |

## 🗂️ Project Structure

```
core-agents/
├── frontend/                 # Next.js 16 Pages Router
│   ├── pages/                # Flow editor, chat, settings, executions
│   ├── src/components/assistant/  # Co-Pilot AI assistant
│   │   ├── AssistantContext.tsx   # SSE chat, tool loop, page context
│   │   ├── AssistantPanel.tsx     # Chat panel UI
│   │   ├── AssistantButton.tsx    # Floating toggle button
│   │   ├── tools/registry.ts      # 30+ tools across 9 groups
│   │   └── useConversationMemory.ts # Per-page localStorage memory
│   └── src/__tests__/        # 22 assistant tool permission tests
├── backend/                  # Express 5 API server
│   └── src/
│       ├── routes/           # Flows, chat, webhook, auth, admin, LLM proxy
│       ├── middleware/        # JWT auth, domain RBAC
│       └── db/               # Drizzle schema, migrations
├── worker/                   # Flow executor + BullMQ consumer
│   └── src/
│       ├── executor/         # DAG executor, shared runner
│       ├── providers/        # Anthropic, OpenAI/LiteLLM clients
│       ├── tools/            # Built-in tool execution (direct, no MCP)
│       └── rag/              # Embedding generation, vector search
├── shared/                   # Shared TypeScript types
├── helm/                     # Kubernetes Helm chart
└── docker-compose.yml        # Development infrastructure
```

## 🛠️ Configuration

| Setting | Location | Description |
|---------|----------|-------------|
| **LLM Endpoints** | Settings → LLM Endpoints | Anthropic, OpenAI, LiteLLM providers |
| **MCP Servers** | Settings → MCP Servers | External tool servers (SSE/HTTP) |
| **Embedding Providers** | Settings → Knowledge Bases | For RAG pipeline |
| **Vector Stores** | Settings → Knowledge Bases | Qdrant connection settings |
| **Auth** | `.env` → `JWT_SECRET` | JWT signing key (required) |
| **SSO** | `.env` → `AUTH_SSO_*` | OIDC provider (Keycloak, etc.) |

## 📊 Node Types

| Node | Category | Purpose |
|------|----------|---------|
| 🎯 **Trigger** | Input | Start a flow (manual, chat, webhook, schedule) |
| 🤖 **LLM Agent** | Processing | Call an LLM with system prompt and tools |
| 🔀 **Condition** | Processing | Route based on a JavaScript expression |
| 💻 **Code** | Processing | Run JavaScript to transform data |
| ⚡ **Parallel** | Processing | Run sub-nodes concurrently |
| 🧰 **MCP Tool** | Tools | Call a tool from a configured MCP server |
| 📄 **Retriever** | Tools | Query a vector store for relevant documents |
| 👤 **HITL** | Processing | Pause for human approval |
| 📤 **Output** | Output | Return the final result |

## 📄 License

[MIT](LICENSE)

---

<div align="center">
  Built with ❤️ by Kees Hus
</div>
