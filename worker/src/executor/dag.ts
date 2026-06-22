import type { FlowNode, FlowEdge } from 'core-agents-shared';

export interface TopologicalSortResult {
  sorted: FlowNode[];
  cycles: string[][];
}

export function topologicalSort(nodes: FlowNode[], edges: FlowEdge[]): TopologicalSortResult {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    const targets = adj.get(e.source);
    if (targets) targets.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: FlowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.find(n => n.id === id);
    if (node) sorted.push(node);
    for (const neighbor of adj.get(id) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  const cycles: string[][] = [];
  if (sorted.length < nodes.length) {
    const visited = new Set(sorted.map(n => n.id));
    const unvisited = nodes.filter(n => !visited.has(n.id));
    cycles.push(unvisited.map(n => n.id));
    // Add remaining nodes to sorted order anyway (they're part of feedback loops)
    sorted.push(...unvisited);
  }

  return { sorted, cycles };
}
