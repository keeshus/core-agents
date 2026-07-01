import { describe, it, expect } from 'vitest';
import { nodeTypeSchema, NODE_TYPES } from '../types/flow.js';

describe('nodeTypeSchema', () => {
  it('accepts all valid node types', () => {
    for (const type of NODE_TYPES) {
      expect(() => nodeTypeSchema.parse(type)).not.toThrow();
    }
  });

  it('rejects invalid node types', () => {
    expect(() => nodeTypeSchema.parse('invalid-type')).toThrow();
    expect(() => nodeTypeSchema.parse('')).toThrow();
  });
});

describe('NODE_TYPES', () => {
  it('contains all 9 node types', () => {
    expect(NODE_TYPES).toHaveLength(9);
    expect(NODE_TYPES).toContain('trigger');
    expect(NODE_TYPES).toContain('llm-agent');
    expect(NODE_TYPES).toContain('mcp-tool');
    expect(NODE_TYPES).toContain('retriever');
    expect(NODE_TYPES).toContain('branch');
    expect(NODE_TYPES).toContain('code');
    expect(NODE_TYPES).toContain('output');
    expect(NODE_TYPES).toContain('parallel');
    expect(NODE_TYPES).toContain('hitl');
  });
});
