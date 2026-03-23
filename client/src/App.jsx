import { useState, useEffect, useCallback } from 'react';
import FileExplorer from './components/FileExplorer.jsx';
import RelationshipGraph from './components/RelationshipGraph.jsx';
import FileEditor from './components/FileEditor.jsx';
import ClaudeRunner from './components/ClaudeRunner.jsx';
import { getFileTree, getRelationships, saveFile, moveFile, getFile } from './api.js';

const TAB_STYLES = {
  active: { background: '#1f6feb', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  inactive: { background: '#21262d', color: '#8b949e', border: '1px solid #30363d', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
};

export default function App() {
  const [fileTree, setFileTree] = useState([]);
  const [relationships, setRelationships] = useState({ nodes: [], edges: [] });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('graph');
  const [statusMsg, setStatusMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadTree = useCallback(async () => {
    try {
      const tree = await getFileTree();
      setFileTree(tree);
    } catch (e) {
      console.error('Failed to load file tree', e);
    }
  }, []);

  const loadRelationships = useCallback(async () => {
    try {
      const data = await getRelationships();
      setRelationships(data);
    } catch (e) {
      console.error('Failed to load relationships', e);
    }
  }, []);

  useEffect(() => {
    loadTree();
    loadRelationships();
  }, []);

  const handleSelectFile = useCallback(async (filePath) => {
    if (isDirty && selectedFile) {
      const ok = confirm('You have unsaved changes. Discard them?');
      if (!ok) return;
    }
    try {
      const data = await getFile(filePath);
      if (data.type === 'directory') return;
      setSelectedFile(filePath);
      setFileContent(data.content || '');
      setIsDirty(false);
      setActiveTab('editor');
      setStatusMsg('');
    } catch (e) {
      setStatusMsg(`Error opening file: ${e.message}`);
    }
  }, [isDirty, selectedFile]);

  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      const result = await saveFile(selectedFile, fileContent);
      setIsDirty(false);
      if (result.relationships) setRelationships(result.relationships);
      setStatusMsg('Saved — relationships updated');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (e) {
      setStatusMsg(`Save failed: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, fileContent]);

  const handleMove = useCallback(async (from, to) => {
    try {
      const result = await moveFile(from, to);
      if (result.tree) setFileTree(result.tree);
      if (result.relationships) setRelationships(result.relationships);
      if (selectedFile === from) setSelectedFile(to);
      setStatusMsg('File moved');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (e) {
      setStatusMsg(`Move failed: ${e.message}`);
    }
  }, [selectedFile]);

  // Called by FileExplorer when any tree-mutating operation completes (move, mkdir, delete)
  const handleTreeChange = useCallback((result) => {
    if (result.tree) setFileTree(result.tree);
    if (result.relationships) setRelationships(result.relationships);
    setStatusMsg('Done');
    setTimeout(() => setStatusMsg(''), 2000);
  }, []);

  const handleGraphNodeClick = useCallback((filePath) => {
    handleSelectFile(filePath);
  }, [handleSelectFile]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 16px',
        height: 48, background: '#161b22', borderBottom: '1px solid #30363d',
        gap: 12, flexShrink: 0
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3', letterSpacing: -0.3 }}>
          ◈ Claude Manager
        </span>
        <div style={{ flex: 1 }} />
        {statusMsg && (
          <span style={{ fontSize: 12, color: '#3fb950', background: '#0d2f1a', padding: '3px 10px', borderRadius: 4 }}>
            {statusMsg}
          </span>
        )}
        <button
          onClick={loadRelationships}
          style={{ background: '#21262d', color: '#8b949e', border: '1px solid #30363d', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
        >
          ↺ Refresh
        </button>
        <button
          onClick={() => setActiveTab('runner')}
          style={{
            background: activeTab === 'runner' ? '#1f6feb' : '#21262d',
            color: activeTab === 'runner' ? '#fff' : '#8b949e',
            border: `1px solid ${activeTab === 'runner' ? '#1f6feb' : '#30363d'}`,
            padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12
          }}
        >
          ▶ Run Claude
        </button>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: 260, flexShrink: 0,
          background: '#161b22', borderRight: '1px solid #30363d',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ padding: '10px 12px 6px', fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid #30363d' }}>
            Explorer — ~/.claude
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <FileExplorer
              tree={fileTree}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFile}
              onMoveFile={handleMove}
              onTreeChange={handleTreeChange}
            />
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            background: '#161b22', borderBottom: '1px solid #30363d', flexShrink: 0
          }}>
            <button style={activeTab === 'graph' ? TAB_STYLES.active : TAB_STYLES.inactive} onClick={() => setActiveTab('graph')}>
              ⬡ Relationships
            </button>
            <button style={activeTab === 'editor' ? TAB_STYLES.active : TAB_STYLES.inactive} onClick={() => setActiveTab('editor')}>
              ✎ Editor {isDirty ? '●' : ''}
            </button>
            <button style={activeTab === 'runner' ? TAB_STYLES.active : TAB_STYLES.inactive} onClick={() => setActiveTab('runner')}>
              ▶ Run
            </button>
            {activeTab === 'editor' && selectedFile && (
              <>
                <span style={{ fontSize: 11, color: '#8b949e', marginLeft: 8 }}>
                  {selectedFile.replace(/.*\/\.claude\//, '~/.claude/')}
                </span>
                <div style={{ flex: 1 }} />
                <button
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                  style={{
                    background: isDirty ? '#238636' : '#21262d',
                    color: isDirty ? '#fff' : '#484f58',
                    border: 'none', padding: '5px 14px', borderRadius: 6,
                    cursor: isDirty ? 'pointer' : 'default', fontSize: 12
                  }}
                >
                  {isSaving ? 'Saving…' : '↓ Save'}
                </button>
              </>
            )}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {activeTab === 'graph' && (
              <RelationshipGraph
                nodes={relationships.nodes}
                edges={relationships.edges}
                selectedFile={selectedFile}
                onNodeClick={handleGraphNodeClick}
              />
            )}
            {activeTab === 'editor' && (
              <FileEditor
                filePath={selectedFile}
                content={fileContent}
                onChange={val => { setFileContent(val); setIsDirty(true); }}
              />
            )}
            {activeTab === 'runner' && <ClaudeRunner />}
          </div>
        </div>
      </div>
    </div>
  );
}
