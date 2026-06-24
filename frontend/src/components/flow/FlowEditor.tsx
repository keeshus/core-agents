import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type OnConnect,
  ReactFlowProvider,
  type Node,
  type OnConnectEnd,
  type OnConnectStart,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TriggerNode } from './nodes/TriggerNode';
import { LLMAgentNode } from './nodes/LLMAgentNode';
import { MCPToolNode } from './nodes/MCPToolNode';
import { RetrieverNode } from './nodes/RetrieverNode';
import { BranchNode } from './nodes/BranchNode';
import { CodeNode } from './nodes/CodeNode';
import { OutputNode } from './nodes/OutputNode';
import { ParallelNode } from './nodes/ParallelNode';
import { HITLNode } from './nodes/HITLNode';
import { StopNode } from './nodes/StopNode';
import { DeletableEdge } from './DeletableEdge';

const edgeTypes = { default: DeletableEdge };

const nodeTypes = {
  trigger: TriggerNode,
  'llm-agent': LLMAgentNode,
  'mcp-tool': MCPToolNode,
  retriever: RetrieverNode,
  branch: BranchNode,
  code: CodeNode,
  output: OutputNode,
  parallel: ParallelNode,
  hitl: HITLNode,
  stop: StopNode,
};

interface FlowEditorProps {
  initialNodes?: any[];
  initialEdges?: any[];
  onNodesChange?: (nodes: any[]) => void;
  onEdgesChange?: (edges: any[]) => void;
  addNodeCallbackRef?: React.MutableRefObject<((type: string, defaultConfig: Record<string, any>) => void) | null>;
  setNodeDataCallbackRef?: React.MutableRefObject<((nodeId: string, config: Record<string, any>) => void) | null>;
  deleteNodeCallbackRef?: React.MutableRefObject<((nodeId: string) => void) | null>;
  setNodeLabelRef?: React.MutableRefObject<((nodeId: string, label: string) => void) | null>;
  onNodeClick?: (nodeId: string, nodeData: any) => void;
  onNodeDragStart?: (nodeId: string) => void;
}

export function FlowEditor({ initialNodes = [], initialEdges = [], onNodesChange, onEdgesChange, addNodeCallbackRef, setNodeDataCallbackRef, deleteNodeCallbackRef, setNodeLabelRef, onNodeClick, onNodeDragStart }: FlowEditorProps) {
  const [nodes, setNodes, rawOnNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges);
  const serializedRef = useRef(JSON.stringify({ nodes: initialNodes, edges: initialEdges }));

  // Sync with parent state (undo/redo) without remounting the component
  useEffect(() => {
    const serialized = JSON.stringify({ nodes: initialNodes, edges: initialEdges });
    if (serialized !== serializedRef.current) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      serializedRef.current = serialized;
    }
  }, [initialNodes, initialEdges]);

  // Expose live canvas state for Co-Pilot tools
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__flowCanvasNodes = nodes;
      (window as any).__flowCanvasEdges = edges;
    }
  }, [nodes, edges]);

  // Filter out position/drag changes for child nodes (they snap to grid)
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const onNodesChangeInternal = useCallback((changes: any[]) => {
    rawOnNodesChange(changes.filter((c: any) => {
      if (c.type !== 'position' && c.type !== 'dimensions') return true;
      if (c.type === 'position') {
        const node = nodesRef.current.find(n => n.id === c.id);
        if (node?.parentId) return false;
      }
      return true;
    }));
  }, [rawOnNodesChange]);
  const onNodesChangeRef = useRef(onNodesChange);
  const onEdgesChangeRef = useRef(onEdgesChange);
  onNodesChangeRef.current = onNodesChange;
  onEdgesChangeRef.current = onEdgesChange;

  // Propagate changes back to parent (debounced via requestAnimationFrame)
  const syncRef = useRef<number | null>(null);
  useEffect(() => {
    if (syncRef.current) cancelAnimationFrame(syncRef.current);
    syncRef.current = requestAnimationFrame(() => {
      onNodesChangeRef.current?.(nodes);
      onEdgesChangeRef.current?.(edges);
    });
  }, [nodes, edges]);

  // Auto-size parallel nodes based on children + snap children to grid
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map(n => {
        // Make children undraggable and snap them to grid positions
        if (n.parentId) {
          const parent = nds.find(p => p.id === n.parentId);
          if (!parent || parent.type !== 'parallel') return n;
          const siblings = nds
            .filter(c => c.parentId === n.parentId)
            .sort((a, b) => a.id.localeCompare(b.id));
          const idx = siblings.findIndex(c => c.id === n.id);
          if (idx < 0) return n;
          let ty = 50;
          for (let i = 0; i < idx; i++) {
            const prev = siblings[i];
            const h = prev.measured?.height || 100;
            ty += h + 20;
          }
          if (n.position.x !== 20 || Math.abs(n.position.y - ty) > 10) {
            changed = true;
            return { ...n, position: { x: 20, y: ty } };
          }
          return n;
        }

        // Auto-size parallel containers
        if (n.type !== 'parallel') return n;
        const children = nds.filter(c => c.parentId === n.id);
        if (children.length === 0) {
          if (n.style?.width !== 320 || n.style?.height !== 240) {
            return { ...n, style: { ...n.style, width: 340, height: 260 } };
          }
          return n;
        }
        const widestChild = Math.max(...children.map(c => {
          const cw = Number(c.measured?.width || c.width) || 200;
          return cw;
        }));
        const totalHeight = children.reduce((sum, c) => {
          return sum + Number(c.measured?.height || c.height || 100) + 20;
        }, 30); // 30px initial offset
        const newW = Math.max(340, widestChild + 60);
        const newH = Math.max(240, totalHeight + 60);
        if (Math.abs(Number(n.style?.width || n.width || 340) - newW) > 5 || Math.abs(Number(n.style?.height || n.height || 240) - newH) > 5) {
          changed = true;
          return { ...n, style: { ...n.style, width: newW, height: newH } };
        }
        return n;
      });
      return changed ? updated : nds;
    });
  }, [nodes]);

  // Helper: re-layout children inside a parallel node (used by drag-stop handler)
  const layoutChildren = useCallback((parentId: string, nds: Node[]) => {
    const children = nds
      .filter(n => n.parentId === parentId)
      .sort((a, b) => a.id.localeCompare(b.id));
    return nds.map(n => {
      if (n.parentId !== parentId) return n;
      const idx = children.findIndex(c => c.id === n.id);
      if (idx < 0) return n;
      let ty = 50;
      for (let i = 0; i < idx; i++) {
        const prev = children[i];
        const h = prev.measured?.height || 100;
        ty += h + 20;
      }
      if (n.position.x === 20 && n.position.y === ty) return n;
      return { ...n, position: { x: 20, y: ty } };
    });
  }, []);

  // Re-layout all children once after nodes change
  const layoutRef = useRef(false);
  useEffect(() => {
    if (layoutRef.current) return;
    layoutRef.current = true;
    const parallels = nodes.filter(n => n.type === 'parallel');
    if (parallels.length === 0) return;
    let result = nodes;
    for (const p of parallels) {
      result = layoutChildren(p.id, result);
    }
    if (result !== nodes) {
      setNodes(result);
    }
    // Reset after a tick
    setTimeout(() => { layoutRef.current = false; }, 100);
  }, [nodes, layoutChildren]);

  const addNode = useCallback((type: string, defaultConfig: Record<string, any>) => {
    // Place node at center of visible viewport (accounting for pan/zoom)
    let centerX = 300, centerY = 200;
    const vp = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (vp) {
      const rect = vp.getBoundingClientRect();
      // Parse CSS transform: translate(Xpx, Ypx) scale(Z)
      const transform = vp.style.transform;
      const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
      if (match) {
        const panX = parseFloat(match[1]);
        const panY = parseFloat(match[2]);
        const zoom = parseFloat(match[3]);
        centerX = (rect.width / 2 - panX) / zoom - 75;
        centerY = (rect.height / 2 - panY) / zoom;
      } else {
        centerX = rect.width / 2 - 75;
        centerY = rect.height / 2;
      }
    }
    const existing = nodes.filter(n => n.type === type);
    const nextNum = existing.length + 1;
    const newNode: Node = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      position: {
        x: centerX + Math.random() * 40,
        y: centerY + Math.random() * 40,
      },
      data: { label: `${type}${nextNum}`, type, config: { ...defaultConfig } },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes, nodes]);

  // Expose addNode to parent via ref and globally for Co-Pilot
  useEffect(() => {
    if (addNodeCallbackRef) {
      addNodeCallbackRef.current = addNode;
    }
    if (typeof window !== 'undefined') {
      (window as any).__addFlowNode = addNode;
    }
  }, [addNode, addNodeCallbackRef]);

  // Expose setNodeData to parent via ref — updates a node's config in-place
  const setNodeData = useCallback((nodeId: string, config: Record<string, any>) => {
    setNodes((nds) => nds.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } }
        : n
    ));
  }, [setNodes]);

  useEffect(() => {
    if (setNodeDataCallbackRef) {
      setNodeDataCallbackRef.current = setNodeData;
    }
  }, [setNodeData, setNodeDataCallbackRef]);

  // Expose setNodeLabel to parent via ref
  const setNodeLabel = useCallback((nodeId: string, label: string) => {
    setNodes((nds) => nds.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
    ));
  }, [setNodes]);

  useEffect(() => {
    if (setNodeLabelRef) {
      setNodeLabelRef.current = setNodeLabel;
    }
  }, [setNodeLabel, setNodeLabelRef]);

  // Expose deleteNode to parent via ref
  const deleteNode = useCallback((nodeId: string) => {
    // Prevent deletion of trigger nodes
    const target = nodes.find(n => n.id === nodeId);
    if (target && (target.data as any)?.type === 'trigger') return;

    // Collect all IDs to delete: the node itself + all descendants
    const toDelete = new Set([nodeId]);
    const collectChildren = (id: string) => {
      for (const n of nodes) {
        if (n.parentId === id && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          collectChildren(n.id);
        }
      }
    };
    collectChildren(nodeId);

    setNodes((nds) => nds.filter(n => !toDelete.has(n.id)));
    setEdges((eds) => eds.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)));
  }, [setNodes, setEdges, nodes]);

  useEffect(() => {
    if (deleteNodeCallbackRef) {
      deleteNodeCallbackRef.current = deleteNode;
    }
    if (typeof window !== 'undefined') {
      (window as any).__deleteFlowNode = deleteNode;
    }
  }, [deleteNode, deleteNodeCallbackRef]);

  const connectNodes = useCallback(
    (source: string, target: string, sourceHandle?: string) => {
      const sourceNode = nodes.find(n => n.id === source);
      const targetNode = nodes.find(n => n.id === target);
      const isFeedback = sourceNode && targetNode && (sourceNode.data as any)?.type === 'hitl' && targetNode.position.x < sourceNode.position.x;
      setEdges((eds) => addEdge({
        source, target, sourceHandle,
        style: isFeedback ? { strokeDasharray: '5,5', stroke: '#f97316', strokeWidth: 2 } : undefined,
        animated: isFeedback,
      } as any, eds));
    },
    [setEdges, nodes]
  );

  const removeEdge = useCallback(
    (source: string, target: string, sourceHandle?: string) => {
      setEdges((eds) => eds.filter(e => !(e.source === source && e.target === target && (!sourceHandle || e.sourceHandle === sourceHandle))));
    },
    [setEdges]
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__connectFlowNodes = connectNodes;
      (window as any).__removeFlowEdge = removeEdge;
    }
  }, [connectNodes, removeEdge]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find(n => n.id === connection.source);
      const targetNode = nodes.find(n => n.id === connection.target);
      const isFeedback = sourceNode && targetNode && (sourceNode.data as any)?.type === 'hitl' && targetNode.position.x < sourceNode.position.x;
      setEdges((eds) => addEdge({
        ...connection,
        style: isFeedback ? { strokeDasharray: '5,5', stroke: '#f97316', strokeWidth: 2 } : undefined,
        animated: isFeedback,
      }, eds));
    },
    [setEdges, nodes]
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      // Tool input handles can have multiple connections
      if (connection.targetHandle?.startsWith('tool-input')) return true;
      // Feedback edges (backward connections from HITL): allow even if target already has input
      const sourceNode = nodes.find(n => n.id === connection.source);
      const targetNode = nodes.find(n => n.id === connection.target);
      if (sourceNode && targetNode && (sourceNode.data as any)?.type === 'hitl' && targetNode.position.x < sourceNode.position.x) return true;
      // Check if target already has an incoming connection on this handle
      const existing = edges.find(
        e => e.target === connection.target && e.targetHandle === connection.targetHandle
      );
      return !existing;
    },
    [edges, nodes]
  );

  return (
    <ReactFlowProvider>
      <div className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChangeInternal}
          onEdgesChange={onEdgesChangeInternal}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          onNodeClick={(_event, node) => onNodeClick?.(node.id, node.data)}
          onNodeDragStart={(_event, node) => onNodeDragStart?.(node.id)}
          onNodeDragStop={(_event, node) => {
            if (node.parentId) {
              // Check if dragged outside parent bounds — if so, detach
              const parent = nodes.find(n => n.id === node.parentId);
              if (parent) {
                const pw = (parent.style?.width || parent.width || 300) as number;
                const ph = (parent.style?.height || parent.height || 200) as number;
                // Node position is relative to parent, so check against (0,0) to (pw,ph)
                if (node.position.x < -50 || node.position.x > pw + 50 || node.position.y < -50 || node.position.y > ph + 50) {
                  setNodes(nds => nds.map(n => n.id === node.id
                    ? { ...n, parentId: undefined, position: { x: parent.position.x + 50, y: parent.position.y + Number(ph) + 40 } }
                    : n
                  ));
                  return;
                }
              }
            } else {
              // Check if dropped inside a parallel node
              const parallels = nodes.filter(n => n.type === 'parallel' && n.id !== node.id);
              for (const p of parallels) {
                const pw = (p.style?.width || p.width || 300) as number;
                const ph = (p.style?.height || p.height || 200) as number;
                const px = p.position.x;
                const py = p.position.y;
                const cx = node.position.x + ((node.measured?.width || 200) as number) / 2;
                const cy = node.position.y + ((node.measured?.height || 80) as number) / 2;
                if (cx >= px && cx <= px + pw && cy >= py && cy <= py + ph) {
                  setNodes(nds => {
                    const withParent = nds.map(n => n.id === node.id ? { ...n, parentId: p.id, position: { x: 20, y: 50 } } : n);
                    const laidOut = layoutChildren(p.id, withParent);
                    const pars = laidOut.filter(n => n.type === 'parallel');
                    const others = laidOut.filter(n => n.type !== 'parallel');
                    return [...pars, ...others];
                  });
                  break;
                }
              }
            }
          }}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
