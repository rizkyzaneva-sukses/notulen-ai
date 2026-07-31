"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export interface MindMapNodeData {
  id: string;
  label: string;
  children?: MindMapNodeData[];
}

function layoutTree(
  root: MindMapNodeData,
  x = 0,
  y = 0,
  levelGap = 220,
  siblingGap = 90
): { nodes: Node[]; edges: Edge[]; height: number } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function measure(node: MindMapNodeData): number {
    if (!node.children?.length) return siblingGap;
    return node.children.reduce((sum, c) => sum + measure(c), 0);
  }

  function place(node: MindMapNodeData, left: number, depth: number): number {
    const h = measure(node);
    const cy = left + h / 2;
    nodes.push({
      id: node.id,
      position: { x: depth * levelGap, y: cy },
      data: { label: node.label },
      type: "default",
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: depth === 0 ? "#1d4ed8" : "#162447",
        color: "#e8eefc",
        border: "1px solid #243658",
        borderRadius: 12,
        padding: "8px 12px",
        fontSize: 12,
        fontFamily: "ui-monospace, monospace",
        maxWidth: 180,
        width: "auto",
      },
    });

    let cursor = left;
    for (const child of node.children || []) {
      const ch = measure(child);
      const childY = place(child, cursor, depth + 1);
      edges.push({
        id: `${node.id}-${child.id}`,
        source: node.id,
        target: child.id,
        type: "smoothstep",
        style: { stroke: "#3b82f6", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
      });
      void childY;
      cursor += ch;
    }
    return cy;
  }

  const totalH = measure(root);
  place(root, y, 0);
  // center-ish: shift nodes so min y is 0
  const minY = Math.min(...nodes.map((n) => n.position.y), 0);
  nodes.forEach((n) => {
    n.position.y -= minY;
  });

  return { nodes, edges, height: totalH };
}

function fallbackTree(label: string): MindMapNodeData {
  return { id: "root", label, children: [] };
}

export function MindMapView({
  structure,
  height = 420,
}: {
  structure: MindMapNodeData | null | undefined;
  height?: number;
}) {
  const tree = structure || fallbackTree("Mind Map");
  const laid = useMemo(() => layoutTree(tree), [tree]);

  const [nodes, , onNodesChange] = useNodesState(laid.nodes);
  const [edges, , onEdgesChange] = useEdgesState(laid.edges);

  // when structure changes, remount via key from parent
  const onInit = useCallback(() => {}, []);

  if (!structure || (!structure.children?.length && structure.label === "Mind Map")) {
    return (
      <div className="card flex h-48 items-center justify-center p-4 text-sm text-slate-500">
        Mind map belum tersedia
      </div>
    );
  }

  return (
    <div className="card overflow-hidden" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        fitView
        minZoom={0.3}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background color="#243658" gap={18} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor="#1d4ed8"
          maskColor="rgba(6,11,24,0.7)"
          style={{ background: "#0a1224" }}
        />
      </ReactFlow>
    </div>
  );
}

/** Bullet-tree fallback if React Flow fails */
export function MindMapBullet({ node, depth = 0 }: { node: MindMapNodeData; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 12 }} className="text-sm text-slate-300">
      <div className="py-0.5">
        {depth === 0 ? "◉" : "•"} {node.label}
      </div>
      {node.children?.map((c) => (
        <MindMapBullet key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}
