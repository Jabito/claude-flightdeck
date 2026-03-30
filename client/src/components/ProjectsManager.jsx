import { useState, useEffect, useCallback } from 'react';
import { getProjects, deleteProject, getFile } from '../api.js';

const BTN = (extra = {}) => ({
  border: 'none',
  borderRadius: 5,
  cursor: 'pointer',
  fontSize: 11,
  padding: '4px 10px',
  ...extra,
});

function ScopePanel({ project }) {
  const [content, setContent] = useState(null); // null = loading, false = no CLAUDE.md
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!project.hasClaudeMd) { setContent(false); return; }
    getFile(`${project.path}/CLAUDE.md`)
      .then(data => setContent(data.content || ''))
      .catch(e => setError(e.message));
  }, [project.path, project.hasClaudeMd]);

  if (error) return (
    <div style={{ fontSize: 11, color: '#f85149', padding: '8px 0' }}>Failed to load: {error}</div>
  );

  if (content === null) return (
    <div style={{ fontSize: 11, color: '#8b949e', padding: '8px 0' }}>Loading…</div>
  );

  if (content === false) return (
    <div style={{ fontSize: 11, color: '#8b949e', padding: '8px 0', fontStyle: 'italic' }}>
      No CLAUDE.md — this project has no Claude Code configuration.
    </div>
  );

  // Show first ~40 lines of CLAUDE.md, trimmed
  const lines = content.split('\n');
  const preview = lines.slice(0, 40).join('\n');
  const truncated = lines.length > 40;

  return (
    <pre style={{
      margin: 0,
      fontSize: 11,
      color: '#c9d1d9',
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      background: '#0d1117',
      border: '1px solid #21262d',
      borderRadius: 6,
      padding: '10px 12px',
      maxHeight: 260,
      overflow: 'auto',
    }}>
      {preview}
      {truncated && <span style={{ color: '#484f58' }}>{'\n'}…{lines.length - 40} more lines</span>}
    </pre>
  );
}

export default function ProjectsManager() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await getProjects()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  };

  const handleDelete = async (projectPath) => {
    setDeleting(projectPath);
    setConfirming(null);
    try {
      const result = await deleteProject(projectPath);
      if (result.ok) {
        const { webhooks, polls, schedules, runs } = result.removed;
        const parts = [];
        if (webhooks) parts.push(`${webhooks} webhook${webhooks !== 1 ? 's' : ''}`);
        if (polls) parts.push(`${polls} poll${polls !== 1 ? 's' : ''}`);
        if (schedules) parts.push(`${schedules} schedule${schedules !== 1 ? 's' : ''}`);
        if (runs) parts.push(`${runs} run${runs !== 1 ? 's' : ''}`);
        const detail = parts.length ? ` Removed: ${parts.join(', ')}.` : ' No associated automations found.';
        showToast(`Cleaned up "${projectPath.split('/').pop()}".${detail}`);
        if (expanded === projectPath) setExpanded(null);
        await load();
      } else {
        showToast(result.error || 'Delete failed', true);
      }
    } catch (e) {
      showToast(e.message, true);
    }
    setDeleting(null);
  };

  const toggleExpand = (path) => setExpanded(prev => prev === path ? null : path);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 20, boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3' }}>Projects</div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
            {loading ? 'Loading…' : `${projects.length} project${projects.length !== 1 ? 's' : ''} discovered`}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter…"
          style={{
            background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
            color: '#e6edf3', fontSize: 12, padding: '5px 10px', width: 180, outline: 'none'
          }}
        />
        <button
          onClick={load}
          style={BTN({ background: '#21262d', color: '#8b949e', border: '1px solid #30363d' })}
        >
          ↺ Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 6, fontSize: 12,
          background: toast.error ? '#2d0f0f' : '#0d2f1a',
          color: toast.error ? '#f85149' : '#3fb950',
          border: `1px solid ${toast.error ? '#6e2828' : '#1b4f2a'}`,
        }}>
          {toast.msg}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: '#8b949e', fontSize: 13 }}>Loading projects…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#8b949e', fontSize: 13 }}>
          {search ? 'No projects match your filter.' : 'No projects found.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(p => {
            const isOpen = expanded === p.path;
            return (
              <div key={p.path} style={{
                background: '#161b22',
                border: `1px solid ${isOpen ? '#30363d' : '#21262d'}`,
                borderRadius: 8,
                overflow: 'hidden',
              }}>
                {/* Row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  cursor: 'pointer',
                }}
                  onClick={() => toggleExpand(p.path)}
                >
                  {/* Chevron */}
                  <span style={{ fontSize: 10, color: '#484f58', flexShrink: 0, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>

                  {/* Icon */}
                  <div style={{
                    width: 30, height: 30, borderRadius: 7,
                    background: p.hasClaudeMd ? '#0d2a4a' : '#1c2128',
                    border: `1px solid ${p.hasClaudeMd ? '#1f6feb' : '#30363d'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0
                  }}>
                    {p.hasClaudeMd ? '◈' : '◻'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>{p.name}</span>
                      {p.hasClaudeMd && (
                        <span style={{
                          fontSize: 10, background: '#1f4068', color: '#79c0ff',
                          borderRadius: 4, padding: '1px 6px', border: '1px solid #1f6feb'
                        }}>
                          CLAUDE.md
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11, color: '#8b949e', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {p.path}
                    </div>
                  </div>

                  {/* Actions — stop click propagation so expand doesn't fire */}
                  <div onClick={e => e.stopPropagation()}>
                    {confirming === p.path ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <div style={{
                          fontSize: 11, color: '#f0883e', background: '#2d1a00',
                          border: '1px solid #6e3800', borderRadius: 5, padding: '5px 10px',
                          maxWidth: 260, lineHeight: 1.4, textAlign: 'right'
                        }}>
                          This will permanently delete <strong>{p.name}/</strong> and all its contents, plus remove all associated automations and runs.
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => handleDelete(p.path)}
                            disabled={deleting === p.path}
                            style={BTN({ background: '#da3633', color: '#fff' })}
                          >
                            {deleting === p.path ? 'Deleting…' : 'Delete permanently'}
                          </button>
                          <button
                            onClick={() => setConfirming(null)}
                            style={BTN({ background: '#21262d', color: '#8b949e', border: '1px solid #30363d' })}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirming(p.path)}
                        style={BTN({ background: 'transparent', color: '#f85149', border: '1px solid #6e2828' })}
                      >
                        Clean up
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded scope panel */}
                {isOpen && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid #21262d' }}>
                    <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: 0.7, padding: '10px 0 6px' }}>
                      {p.hasClaudeMd ? 'CLAUDE.md' : 'Project Scope'}
                    </div>
                    <ScopePanel project={p} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
