import { useState, useRef, useCallback, useEffect } from 'react';
import { moveFiles, createFolder, deletePath } from '../api.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  agents: '#a371f7', commands: '#58a6ff', skills: '#3fb950',
  settings: '#f0883e', plugins: '#d2a8ff', contracts: '#ffa657',
  memory: '#79c0ff', claude: '#79c0ff', dev: '#58a6ff',
  bitbucket: '#2684ff', confluence: '#1868db', jira: '#0052cc',
  games: '#3fb950'
};

const FILE_ICONS = {
  '.md': '📄', '.json': '⚙', '.js': '⚡', '.ts': '⚡',
  '.yaml': '📋', '.yml': '📋', default: '📃'
};

// ─── Shared drag state (module-level to cross component boundaries) ──────────
let _dragSources = [];   // paths being dragged
let _setDragOverPath;    // setter from parent to highlight drop zones

// ─── Confirm dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ message, detail, onConfirm, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }}>
      <div style={{
        background: '#161b22', border: '1px solid #f85149', borderRadius: 10,
        padding: 24, width: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.6)'
      }}>
        <div style={{ fontSize: 14, color: '#e6edf3', marginBottom: 8 }}>{message}</div>
        {detail && <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 20, wordBreak: 'break-all' }}>{detail}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnStyle('#21262d', '#8b949e')}>Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} style={btnStyle('#b62324', '#fff')}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── New folder inline input ──────────────────────────────────────────────────
function NewFolderInput({ parentPath, onDone }) {
  const [name, setName] = useState('');
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed) {
      await createFolder(`${parentPath}/${trimmed}`);
      onDone(true);
    } else {
      onDone(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '2px 8px 2px 28px', gap: 6 }}>
      <span style={{ fontSize: 12 }}>📁</span>
      <input
        ref={ref}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onDone(false);
        }}
        onBlur={submit}
        placeholder="folder-name"
        style={{
          background: '#0d1117', color: '#e6edf3', border: '1px solid #1f6feb',
          borderRadius: 4, padding: '2px 6px', fontSize: 12, outline: 'none', width: 140
        }}
      />
    </div>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close, { once: true });
    return () => window.removeEventListener('click', close);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', left: x, top: y, zIndex: 1500,
      background: '#1c2128', border: '1px solid #30363d', borderRadius: 8,
      padding: 4, minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
    }}>
      {items.map((item, i) =>
        item === '---'
          ? <div key={i} style={{ borderTop: '1px solid #30363d', margin: '4px 0' }} />
          : (
            <div
              key={i}
              onClick={e => { e.stopPropagation(); item.action(); onClose(); }}
              style={{
                padding: '6px 14px', fontSize: 12, color: item.danger ? '#f85149' : '#e6edf3',
                cursor: 'pointer', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 8
              }}
              onMouseEnter={e => e.currentTarget.style.background = item.danger ? '#3d0f0f' : '#21262d'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 14, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </div>
          )
      )}
    </div>
  );
}

// ─── TreeNode ─────────────────────────────────────────────────────────────────
function TreeNode({
  node, depth,
  selectedFile, selectedPaths,
  onSelectFile, onSelectionChange, onTreeChange,
  dragOverPath, setDragOverPath
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [hovered, setHovered] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const dragEnterCount = useRef(0);

  const isSelected = node.path === selectedFile;
  const isMultiSelected = selectedPaths.has(node.path);
  const indent = depth * 14;
  const folderColor = TYPE_COLORS[node.name] || '#8b949e';
  const fileIcon = FILE_ICONS[node.ext] || FILE_ICONS.default;
  const isDropTarget = dragOverPath === node.path && node.type === 'directory';

  // ── Click: file selection / multi-select ──────────────────────────────────
  const handleClick = useCallback((e) => {
    if (node.type === 'directory') {
      setExpanded(s => !s);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      // Toggle this file in multi-selection
      const next = new Set(selectedPaths);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      onSelectionChange(next);
    } else if (e.shiftKey && selectedPaths.size > 0) {
      // Shift-click: add to selection without clearing
      const next = new Set(selectedPaths);
      next.add(node.path);
      onSelectionChange(next);
    } else {
      onSelectionChange(new Set());
      onSelectFile(node.path);
    }
  }, [node, selectedPaths, onSelectionChange, onSelectFile]);

  // ── Drag: source ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e) => {
    e.stopPropagation();
    // Drag all selected files if this is part of the selection, else just this
    const sources = isMultiSelected && selectedPaths.size > 1
      ? [...selectedPaths]
      : [node.path];
    _dragSources = sources;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sources.join('\n'));
    // Ghost label
    const ghost = document.createElement('div');
    ghost.textContent = sources.length > 1 ? `Moving ${sources.length} files` : node.name;
    ghost.style.cssText = 'position:fixed;top:-100px;background:#1f6feb;color:#fff;padding:4px 10px;borderRadius:6px;fontSize:12px;pointerEvents:none;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, [node, isMultiSelected, selectedPaths]);

  const handleDragEnd = useCallback(() => {
    _dragSources = [];
    setDragOverPath(null);
  }, [setDragOverPath]);

  // ── Drag: folder target ───────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    if (node.type !== 'directory') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(node.path);
  }, [node, setDragOverPath]);

  const handleDragEnter = useCallback((e) => {
    if (node.type !== 'directory') return;
    e.preventDefault();
    e.stopPropagation();
    dragEnterCount.current++;
    setDragOverPath(node.path);
  }, [node, setDragOverPath]);

  const handleDragLeave = useCallback((e) => {
    if (node.type !== 'directory') return;
    e.stopPropagation();
    dragEnterCount.current--;
    if (dragEnterCount.current <= 0) {
      dragEnterCount.current = 0;
      setDragOverPath(prev => prev === node.path ? null : prev);
    }
  }, [node, setDragOverPath]);

  const handleDrop = useCallback(async (e) => {
    if (node.type !== 'directory') return;
    e.preventDefault();
    e.stopPropagation();
    dragEnterCount.current = 0;
    setDragOverPath(null);

    const sources = _dragSources.length > 0
      ? _dragSources
      : e.dataTransfer.getData('text/plain').split('\n').filter(Boolean);

    // Filter out files already in this folder or the folder itself
    const valid = sources.filter(src => {
      const parentDir = src.substring(0, src.lastIndexOf('/'));
      return parentDir !== node.path && src !== node.path;
    });
    if (!valid.length) return;

    const result = await moveFiles(valid, node.path);
    if (result.tree) onTreeChange(result);
  }, [node, setDragOverPath, onTreeChange]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    const result = await deletePath(node.path);
    if (result.tree) onTreeChange(result);
  }, [node, onTreeChange]);

  // ── New folder done ───────────────────────────────────────────────────────
  const handleNewFolderDone = useCallback(async (created) => {
    setShowNewFolder(false);
    if (created) {
      setExpanded(true);
      const result = await fetch('/api/file-tree').then(r => r.json());
      onTreeChange({ tree: result });
    }
  }, [onTreeChange]);

  // ─────────────────────────────────────────────────────────────────────────
  if (node.type === 'directory') {
    const ctxItems = [
      { icon: '📁', label: 'New folder…', action: () => { setExpanded(true); setShowNewFolder(true); } },
      '---',
      { icon: '🗑', label: 'Delete folder', danger: true, action: () => setConfirm({
        message: `Delete "${node.name}"?`,
        detail: `This will permanently delete ${node.path} and all its contents.`
      }) }
    ];

    return (
      <>
        <div
          onClick={handleClick}
          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', paddingLeft: 8 + indent,
            cursor: 'pointer', userSelect: 'none',
            background: isDropTarget ? '#0f2a4a' : hovered ? '#1c2128' : 'transparent',
            border: isDropTarget ? '1px dashed #1f6feb' : '1px solid transparent',
            borderRadius: isDropTarget ? 4 : 0,
            transition: 'background 0.1s'
          }}
        >
          <span style={{ fontSize: 10, color: '#484f58', width: 10, flexShrink: 0 }}>
            {expanded ? '▼' : '▶'}
          </span>
          <span style={{ fontSize: 13 }}>{isDropTarget ? '📂' : '📁'}</span>
          <span style={{ fontSize: 13, color: folderColor, fontWeight: 500 }}>{node.name}</span>
          {isDropTarget && <span style={{ fontSize: 10, color: '#1f6feb', marginLeft: 4 }}>drop here</span>}
        </div>

        {expanded && (
          <>
            {showNewFolder && (
              <NewFolderInput parentPath={node.path} onDone={handleNewFolderDone} />
            )}
            {node.children?.map(child => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                selectedPaths={selectedPaths}
                onSelectFile={onSelectFile}
                onSelectionChange={onSelectionChange}
                onTreeChange={onTreeChange}
                dragOverPath={dragOverPath}
                setDragOverPath={setDragOverPath}
              />
            ))}
          </>
        )}

        {ctxMenu && (
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />
        )}
        {confirm && (
          <ConfirmDialog {...confirm} onConfirm={handleDelete} onClose={() => setConfirm(null)} />
        )}
      </>
    );
  }

  // ── File row ──────────────────────────────────────────────────────────────
  const fileCtxItems = [
    { icon: '✎', label: 'Open', action: () => onSelectFile(node.path) },
    '---',
    { icon: '🗑', label: 'Delete file', danger: true, action: () => setConfirm({
      message: `Delete "${node.name}"?`,
      detail: node.path
    }) }
  ];

  const rowBg = isDropTarget ? '#0f2a4a'
    : isMultiSelected ? '#1a2d4a'
    : isSelected ? '#1f4068'
    : hovered ? '#1c2128'
    : 'transparent';

  return (
    <>
      <div
        draggable
        onClick={handleClick}
        onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '2px 8px', paddingLeft: 8 + indent + 15,
          cursor: 'grab', userSelect: 'none',
          background: rowBg,
          borderLeft: (isSelected || isMultiSelected) ? '2px solid #1f6feb' : '2px solid transparent',
          opacity: _dragSources.includes(node.path) ? 0.4 : 1,
          transition: 'background 0.08s'
        }}
      >
        <span style={{ fontSize: 12 }}>{fileIcon}</span>
        <span style={{ fontSize: 12, color: isSelected || isMultiSelected ? '#e6edf3' : '#8b949e', flex: 1 }}>
          {node.name}
        </span>
        {isMultiSelected && (
          <span style={{ fontSize: 10, color: '#1f6feb' }}>✓</span>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={fileCtxItems} onClose={() => setCtxMenu(null)} />
      )}
      {confirm && (
        <ConfirmDialog {...confirm} onConfirm={handleDelete} onClose={() => setConfirm(null)} />
      )}
    </>
  );
}

// ─── FileExplorer root ────────────────────────────────────────────────────────
export default function FileExplorer({ tree, selectedFile, onSelectFile, onMoveFile, onTreeChange }) {
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [dragOverPath, setDragOverPath] = useState(null);

  // Clear multi-select when clicking empty area
  const handleContainerClick = useCallback((e) => {
    if (e.target === e.currentTarget) setSelectedPaths(new Set());
  }, []);

  // Escape clears selection
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSelectedPaths(new Set()); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!tree?.length) {
    return <div style={{ padding: 16, fontSize: 12, color: '#484f58' }}>Loading…</div>;
  }

  return (
    <div onClick={handleContainerClick} style={{ padding: '4px 0', height: '100%' }}>
      {selectedPaths.size > 1 && (
        <div style={{
          padding: '4px 12px', fontSize: 11, color: '#1f6feb',
          background: '#0f2a4a', borderBottom: '1px solid #1f6feb33',
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          <span>✓ {selectedPaths.size} files selected</span>
          <span style={{ color: '#484f58' }}>· drag to move · Esc to clear</span>
        </div>
      )}

      {tree.map(node => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedFile={selectedFile}
          selectedPaths={selectedPaths}
          onSelectFile={onSelectFile}
          onSelectionChange={setSelectedPaths}
          onTreeChange={onTreeChange}
          dragOverPath={dragOverPath}
          setDragOverPath={setDragOverPath}
        />
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function btnStyle(bg, color) {
  return {
    background: bg, color, border: 'none',
    padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13
  };
}
