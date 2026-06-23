import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  transport?: 'auto' | 'streamable-http' | 'sse';
  tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  enabled: boolean;
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class MCPHub {
  private connections = new Map<string, Client>();
  private toolCache = new Map<string, MCPToolDefinition[]>();

  async connect(server: MCPServerConfig): Promise<void> {
    if (this.connections.has(server.id)) return;

    const transportType = server.transport || 'auto';
    let lastErrorMessage: string | null = null;

    const tryTransport = async (transport: any, label: string): Promise<Client | null> => {
      try {
        const client = new Client(
          { name: 'core-agents-worker', version: '1.0.0' },
          { capabilities: {} }
        );
        await client.connect(transport);
        return client;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`MCP Hub: ${label} transport failed for ${server.name}:`, msg);
        lastErrorMessage = msg;
        return null;
      }
    };

    let client: Client | null = null;

    if (transportType === 'streamable-http') {
      client = await tryTransport(
        new StreamableHTTPClientTransport(new URL(server.url)),
        'Streamable HTTP'
      );
    } else if (transportType === 'sse') {
      client = await tryTransport(
        new SSEClientTransport(new URL(server.url)),
        'SSE'
      );
    } else {
      // Auto-detect: try Streamable HTTP first (newer standard), then SSE
      client = await tryTransport(
        new StreamableHTTPClientTransport(new URL(server.url)),
        'Streamable HTTP'
      );
      if (!client) {
        client = await tryTransport(
          new SSEClientTransport(new URL(server.url)),
          'SSE'
        );
      }
    }

    if (!client) {
      throw new Error(
        `Failed to connect to MCP server "${server.name}". ` +
        `Last error: ${lastErrorMessage || 'Unknown error'}`
      );
    }

    this.connections.set(server.id, client);

    // Cache tools
    const result = await client.listTools();
    this.toolCache.set(server.id, result.tools.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: (t.inputSchema as Record<string, unknown>) || {},
    })));

    console.log(`MCP Hub: connected to ${server.name} (${result.tools.length} tools)`);
  }

  async listTools(serverId: string): Promise<MCPToolDefinition[]> {
    if (this.toolCache.has(serverId)) {
      return this.toolCache.get(serverId)!;
    }
    return [];
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.connections.get(serverId);
    if (!client) throw new Error(`MCP server ${serverId} not connected`);

    const result = await client.callTool({ name: toolName, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textParts = content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');
    return textParts;
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.connections.get(serverId);
    if (client) {
      try { await client.close(); } catch {}
      this.connections.delete(serverId);
      this.toolCache.delete(serverId);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [id] of this.connections) {
      await this.disconnect(id);
    }
  }

  isConnected(serverId: string): boolean {
    return this.connections.has(serverId);
  }
}

// Singleton instance
export const mcpHub = new MCPHub();
