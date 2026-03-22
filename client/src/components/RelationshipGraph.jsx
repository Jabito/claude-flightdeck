import { useEffect, useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  MarkerType, Position, Handle,
  getBezierPath, EdgeLabelRenderer, BaseEdge
} from 'reactflow';
import 'reactflow/dist/style.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_COLORS = {
  agent:   { bg: '#1e1040', border: '#a371f7', glow: '#a371f740', text: '#d2b4fc', label: 'Agent',   icon: '◈' },
  command: { bg: '#0a1f3a', border: '#1f6feb', glow: '#1f6feb40', text: '#79c0ff', label: 'Command', icon: '▸' },
  skill:   { bg: '#071d12', border: '#2ea043', glow: '#2ea04340', text: '#56d364', label: 'Skill',   icon: '⚡' },
  hook:    { bg: '#2a1400', border: '#d29922', glow: '#d2992240', text: '#ffa657', label: 'Hook',    icon: '⚓' },
  service: { bg: '#1a1a2e', border: '#e36209', glow: '#e3620940', text: '#f0883e', label: 'Service', icon: '🔗' }
};

// Per-service brand colours (used inside service nodes)
const SERVICE_COLORS = {
  jira:       { border: '#0052cc', text: '#4c9aff', bg: '#031530', icon: 'J' },
  confluence: { border: '#1868db', text: '#6ba5ff', bg: '#04152a', icon: 'C' },
  bitbucket:  { border: '#2684ff', text: '#85b8ff', bg: '#031d3d', icon: 'B' },
  github:     { border: '#8b949e', text: '#c9d1d9', bg: '#161b22', icon: 'G' }
};

const COLUMN = { hook: 0, command: 260, agent: 560, skill: 860, service: 1160 };
const NODE_W = 200;
const NODE_H = 72;
const NODE_GAP = 12;

// ─── Custom Node ──────────────────────────────────────────────────────────────

function ClaudeNode({ data }) {
  const { raw, dimmed, highlighted, selected } = data;

  // Service nodes use per-brand colours; everything else uses NODE_COLORS
  const sc = raw.type === 'service' ? (SERVICE_COLORS[raw.service] || SERVICE_COLORS.github) : null;
  const c  = sc ? { ...NODE_COLORS.service, ...sc } : (NODE_COLORS[raw.type] || NODE_COLORS.agent);

  const opacity = dimmed ? 0.18 : 1;
  const borderColor = selected
    ? '#f0883e'
    : highlighted ? c.border : `${c.border}99`;
  const boxShadow = selected
    ? `0 0 0 2px #f0883e, 0 0 16px #f0883e60`
    : highlighted
    ? `0 0 0 1.5px ${c.border}, 0 0 12px ${NODE_COLORS[raw.type]?.glow || '#e3620940'}`
    : 'none';

  const isService = raw.type === 'service';

  return (
    <div style={{
      background: c.bg, border: `1.5px solid ${borderColor}`, borderRadius: 10,
      padding: '8px 10px', width: NODE_W, opacity, boxShadow,
      transition: 'opacity 0.15s, box-shadow 0.15s, border-color 0.15s',
      cursor: 'pointer', position: 'relative'
    }}>
      <Handle type="target" position={Position.Left}  style={{ background: c.border, width: 8, height: 8, border: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        {isService ? (
          <div style={{
            width: 22, height: 22, borderRadius: 5, background: `${c.border}22`,
            border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 11, fontWeight: 800, color: c.border,
            flexShrink: 0, marginTop: 1, fontFamily: 'monospace'
          }}>
            {c.icon}
          </div>
        ) : (
          <span style={{ fontSize: 14, color: c.border, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, color: `${c.border}cc`, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
            {isService ? 'External Service' : `${raw.type}${raw.domain ? ` · ${raw.domain}` : ''}`}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: c.text, wordBreak: 'break-word', lineHeight: 1.3 }}>
            {raw.label}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: c.border, width: 8, height: 8, border: 'none' }} />
    </div>
  );
}

// ─── Custom Edge with label ───────────────────────────────────────────────────

function ClaudeEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {data?.label && data?.highlighted && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 9, color: '#8b949e',
            background: '#161b22', padding: '1px 5px', borderRadius: 3,
            pointerEvents: 'none', border: '1px solid #30363d'
          }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { claudeNode: ClaudeNode };
const edgeTypes = { claudeEdge: ClaudeEdge };

// ─── Layout builder ───────────────────────────────────────────────────────────

function buildLayout(rawNodes, rawEdges) {
  const counts = { agent: 0, command: 0, skill: 0, hook: 0, service: 0 };

  const nodes = rawNodes.map(n => {
    const type = n.type || 'agent';
    const col = COLUMN[type] ?? 0;
    const row = counts[type] ?? 0;
    if (type in counts) counts[type]++;
    return {
      id: n.id,
      type: 'claudeNode',
      position: { x: col, y: row * (NODE_H + NODE_GAP) + 60 },
      data: { raw: n, dimmed: false, highlighted: false, selected: false },
      style: { padding: 0, background: 'transparent', border: 'none' }
    };
  });

  const edges = rawEdges.map(e => {
    const isAccess = e.label === 'accesses';
    const svcKey   = isAccess ? e.target?.replace('service:', '') : null;
    const svcColor = svcKey ? (SERVICE_COLORS[svcKey]?.border || '#e36209') : null;
    const baseStroke = isAccess ? `${svcColor}88` : '#30363d55';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'claudeEdge',
      animated: e.animated,
      data: { label: e.label, highlighted: false, isAccess, svcColor },
      style: { stroke: baseStroke, strokeWidth: isAccess ? 1.5 : 1.2, strokeDasharray: isAccess ? '5 4' : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color: baseStroke, width: 12, height: 12 }
    };
  });

  return { nodes, edges };
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ filter, onFilter }) {
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 10,
      background: '#0d1117cc', backdropFilter: 'blur(8px)',
      border: '1px solid #30363d', borderRadius: 10,
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      minWidth: 160
    }}>
      <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: 0.8 }}>Filter by type</div>
      {Object.entries(NODE_COLORS).map(([type, c]) => {
        const active = filter.has(type);
        return (
          <div
            key={type}
            onClick={() => onFilter(type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              opacity: active ? 1 : 0.35,
              transition: 'opacity 0.15s'
            }}
          >
            <div style={{
              width: 22, height: 22, background: active ? c.bg : 'transparent',
              border: `2px solid ${c.border}`, borderRadius: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: c.border
            }}>
              {c.icon}
            </div>
            <span style={{ fontSize: 12, color: c.text }}>{c.label}s</span>
          </div>
        );
      })}
      <div style={{ borderTop: '1px solid #30363d', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="24" height="8"><path d="M0,4 Q12,0 24,4" stroke="#a371f7" strokeWidth="1.5" fill="none" markerEnd="url(#a)"/><defs><marker id="a" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#a371f7"/></marker></defs></svg>
          <span style={{ fontSize: 10, color: '#8b949e' }}>spawns (animated)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#484f58" strokeWidth="1.5"/></svg>
          <span style={{ fontSize: 10, color: '#8b949e' }}>uses skill</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#e3620988" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
          <span style={{ fontSize: 10, color: '#8b949e' }}>accesses service</span>
        </div>
      </div>

      {/* Service sub-legend */}
      <div style={{ borderTop: '1px solid #30363d', paddingTop: 8 }}>
        <div style={{ fontSize: 10, color: '#484f58', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Services</div>
        {Object.entries(SERVICE_COLORS).map(([key, sc]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${sc.border}`,
              background: `${sc.border}15`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 10, fontWeight: 800, color: sc.border,
              fontFamily: 'monospace'
            }}>{sc.icon}</div>
            <span style={{ fontSize: 11, color: sc.text, textTransform: 'capitalize' }}>{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Column header overlay ────────────────────────────────────────────────────

function ColumnHeaders({ rfInstance }) {
  return (
    <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 9, display: 'flex', gap: 0, pointerEvents: 'none' }}>
      {Object.entries(COLUMN).map(([type, x]) => {
        const c = NODE_COLORS[type];
        return (
          <div
            key={type}
            style={{
              position: 'absolute',
              left: x,
              top: 0,
              width: NODE_W + 20,
              textAlign: 'center',
              fontSize: 10, fontWeight: 600, color: c.border,
              textTransform: 'uppercase', letterSpacing: 1,
              background: `${c.bg}88`,
              border: `1px solid ${c.border}33`,
              borderRadius: 6, padding: '3px 8px'
            }}
          >
            {c.icon} {c.label}s
          </div>
        );
      })}
    </div>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({ value, onChange, count, total }) {
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 10,
      display: 'flex', alignItems: 'center', gap: 8
    }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#484f58', fontSize: 13 }}>⌕</span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Search nodes…"
          style={{
            background: '#0d1117cc', backdropFilter: 'blur(8px)',
            border: '1px solid #30363d', borderRadius: 8,
            color: '#e6edf3', fontSize: 12, padding: '6px 10px 6px 26px',
            outline: 'none', width: 200
          }}
        />
      </div>
      {value && (
        <span style={{ fontSize: 11, color: '#8b949e', background: '#161b22', border: '1px solid #30363d', padding: '3px 8px', borderRadius: 5 }}>
          {count} / {total}
        </span>
      )}
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ node, pos }) {
  if (!node) return null;
  const c = NODE_COLORS[node.raw?.type] || NODE_COLORS.agent;
  const filePath = node.raw?.path?.replace(/.*\/\.claude\//, '~/.claude/') || '';
  return (
    <div style={{
      position: 'absolute', left: pos.x + 16, top: pos.y - 8, zIndex: 20,
      background: '#161b22', border: `1px solid ${c.border}`,
      borderRadius: 8, padding: '8px 12px', maxWidth: 300,
      pointerEvents: 'none', boxShadow: `0 4px 20px ${c.glow}`
    }}>
      <div style={{ fontSize: 10, color: c.border, textTransform: 'uppercase', marginBottom: 4 }}>
        {c.icon} {node.raw?.type}
      </div>
      <div style={{ fontSize: 13, color: c.text, fontWeight: 600, marginBottom: 4 }}>{node.raw?.label}</div>
      {filePath && <div style={{ fontSize: 10, color: '#484f58', wordBreak: 'break-all' }}>{filePath}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RelationshipGraph({ nodes: rawNodes = [], edges: rawEdges = [], selectedFile, onNodeClick }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [baseNodes, setBaseNodes] = useState([]);
  const [baseEdges, setBaseEdges] = useState([]);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(new Set(['agent', 'command', 'skill', 'hook', 'service']));
  const containerRef = useRef(null);

  // Build base layout when raw data changes
  useEffect(() => {
    if (!rawNodes.length) return;
    const { nodes: n, edges: e } = buildLayout(rawNodes, rawEdges);
    setBaseNodes(n);
    setBaseEdges(e);
    setNodes(n);
    setEdges(e);
  }, [rawNodes, rawEdges]);

  // Compute neighbor sets for a given node id
  const getNeighbors = useCallback((nodeId) => {
    const neighborIds = new Set([nodeId]);
    const activeEdgeIds = new Set();
    baseEdges.forEach(e => {
      if (e.source === nodeId || e.target === nodeId) {
        neighborIds.add(e.source);
        neighborIds.add(e.target);
        activeEdgeIds.add(e.id);
      }
    });
    return { neighborIds, activeEdgeIds };
  }, [baseEdges]);

  // Apply visual state: hover, search, filter, selected
  const applyVisuals = useCallback((hovId, searchTerm, typeSet, selFile) => {
    const isHovering = !!hovId;
    const isSearching = searchTerm.length > 1;

    const { neighborIds, activeEdgeIds } = hovId ? getNeighbors(hovId) : { neighborIds: new Set(), activeEdgeIds: new Set() };

    setNodes(nds => nds.map(n => {
      const raw = n.data.raw;
      const isNeighbor = neighborIds.has(n.id);
      const isHovNode = n.id === hovId;
      const matchesSearch = !isSearching || raw.label.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeSet.has(raw.type);
      const isSelected = raw.path === selFile;

      const dimmed = !matchesType || (isSearching && !matchesSearch) || (isHovering && !isNeighbor);
      const highlighted = isHovNode || isNeighbor || (isSearching && matchesSearch);

      return {
        ...n,
        hidden: !matchesType,
        data: { ...n.data, dimmed, highlighted, selected: isSelected }
      };
    }));

    setEdges(eds => eds.map(e => {
      const isActive = isHovering ? activeEdgeIds.has(e.id) : true;
      const isAccess = e.data?.isAccess;

      // Color: spawns=purple, accesses=service brand color, uses=source type color
      const sourceNode = baseNodes.find(n => n.id === e.source);
      const srcType    = sourceNode?.data?.raw?.type || 'agent';
      const svcColor   = e.data?.svcColor;
      const activeColor = e.animated ? '#a371f7'
        : isAccess ? (svcColor || '#e36209')
        : (NODE_COLORS[srcType]?.border || '#30363d');

      return {
        ...e,
        data: { ...e.data, highlighted: isActive },
        animated: isActive && e.animated,
        style: {
          stroke: isActive ? activeColor : '#30363d22',
          strokeWidth: isActive ? (isHovering ? 2 : isAccess ? 1.5 : 1.2) : 0.6,
          strokeDasharray: isAccess ? (isActive ? '5 4' : undefined) : undefined,
          opacity: isHovering ? (isActive ? 1 : 0.06) : 0.6,
          transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s'
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isActive ? activeColor : '#30363d22',
          width: 12, height: 12
        }
      };
    }));
  }, [getNeighbors, baseNodes]);

  useEffect(() => {
    applyVisuals(hoveredNode?.id, search, typeFilter, selectedFile);
  }, [hoveredNode, search, typeFilter, selectedFile, applyVisuals]);

  const handleNodeMouseEnter = useCallback((_evt, node) => {
    setHoveredNode(node.data.raw);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, []);

  const handleNodeClick = useCallback((_evt, node) => {
    if (node.data?.raw?.path) onNodeClick(node.data.raw.path);
  }, [onNodeClick]);

  const toggleTypeFilter = useCallback((type) => {
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); }
      else next.add(type);
      return next;
    });
  }, []);

  const searchMatchCount = search.length > 1
    ? rawNodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()) && typeFilter.has(n.type)).length
    : 0;

  if (!rawNodes.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#484f58', gap: 10 }}>
        <div style={{ fontSize: 40 }}>⬡</div>
        <div style={{ fontSize: 14 }}>No relationships found</div>
        <div style={{ fontSize: 12 }}>Agent and command files will appear here with their connections</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} onMouseMove={handleMouseMove}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2.5}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: false }}
      >
        <Background color="#1c2128" gap={24} size={1} />
        <Controls style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }} />
        <MiniMap
          style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8 }}
          nodeColor={n => {
            const type = n.data?.raw?.type;
            return NODE_COLORS[type]?.border || '#30363d';
          }}
          maskColor="#0d1117bb"
        />
      </ReactFlow>

      {/* Overlays */}
      <SearchBar
        value={search}
        onChange={setSearch}
        count={searchMatchCount}
        total={rawNodes.filter(n => typeFilter.has(n.type)).length}
      />
      <Legend filter={typeFilter} onFilter={toggleTypeFilter} />
      <Tooltip node={hoveredNode} pos={tooltipPos} />

      {/* Hover hint */}
      {!hoveredNode && (
        <div style={{
          position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: '#484f58', background: '#0d1117aa',
          padding: '4px 12px', borderRadius: 20, pointerEvents: 'none',
          border: '1px solid #21262d'
        }}>
          Hover a node to highlight its connections · Click to open file
        </div>
      )}
    </div>
  );
}
