import { useState, useEffect, useRef } from 'react';
import { getProjects, runClaude } from '../api.js';

async function getBitbucketRepos() {
  const r = await fetch('/api/bitbucket-repos');
  return r.json();
}

const TAB = { local: 'Local', bitbucket: 'Bitbucket' };

export default function ClaudeRunner() {
  const [projects, setProjects] = useState([]);
  const [bbRepos, setBbRepos] = useState([]);
  const [bbLoading, setBbLoading] = useState(false);
  const [bbError, setBbError] = useState('');
  const [activeTab, setActiveTab] = useState('local');
  const [projectPath, setProjectPath] = useState('');
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState([]);
  const [running, setRunning] = useState(false);
  const outputRef = useRef(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const loadBbRepos = () => {
    if (bbRepos.length || bbLoading) return;
    setBbLoading(true);
    getBitbucketRepos()
      .then(data => {
        if (data?.error) { setBbError(data.error); setBbRepos([]); }
        else setBbRepos(Array.isArray(data) ? data : []);
      })
      .catch(e => setBbError(e.message))
      .finally(() => setBbLoading(false));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setProjectPath('');
    if (tab === 'bitbucket') loadBbRepos();
  };

  const handleRun = async () => {
    if (!projectPath.trim() || !prompt.trim() || running) return;
    setOutput([{ type: 'meta', message: `$ claude -p "${prompt}" (in ${projectPath})` }]);
    setRunning(true);
    try {
      await runClaude(projectPath, prompt, (data) => {
        setOutput(prev => [...prev, data]);
      });
    } catch (e) {
      setOutput(prev => [...prev, { type: 'error', message: e.message }]);
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun();
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Controls */}
      <div style={{
        width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #30363d', overflow: 'hidden'
      }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #30363d', flexShrink: 0 }}>
          {Object.entries(TAB).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 12, cursor: 'pointer', border: 'none',
                background: activeTab === key ? '#0d1117' : '#161b22',
                color: activeTab === key ? '#e6edf3' : '#8b949e',
                borderBottom: activeTab === key ? '2px solid #1f6feb' : '2px solid transparent'
              }}
            >
              {key === 'bitbucket' && <span style={{ marginRight: 4 }}>B</span>}
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Run Claude Headless
          </div>

          {/* Local tab */}
          {activeTab === 'local' && (
            <>
              <div>
                <label style={labelStyle}>Project</label>
                <select value={projectPath} onChange={e => setProjectPath(e.target.value)} style={inputStyle}>
                  <option value="">Select project…</option>
                  {projects.map(p => (
                    <option key={p.path} value={p.path}>
                      {p.hasClaudeMd ? '◈ ' : ''}{p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Or enter path</label>
                <input value={projectPath} onChange={e => setProjectPath(e.target.value)}
                  placeholder="/path/to/project" style={inputStyle} />
              </div>
            </>
          )}

          {/* Bitbucket tab */}
          {activeTab === 'bitbucket' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bbLoading && <div style={{ fontSize: 12, color: '#8b949e' }}>Loading repos…</div>}
              {bbError && <div style={{ fontSize: 12, color: '#f85149' }}>{bbError}</div>}
              {!bbLoading && !bbError && bbRepos.length === 0 && (
                <div style={{ fontSize: 12, color: '#484f58' }}>No repos found</div>
              )}
              {bbRepos.map(repo => {
                const isSelected = projectPath === (repo.localPath || '');
                const hasLocal   = !!repo.localPath;
                return (
                  <div
                    key={repo.slug}
                    onClick={() => hasLocal && setProjectPath(repo.localPath)}
                    style={{
                      padding: '8px 10px', borderRadius: 7, cursor: hasLocal ? 'pointer' : 'default',
                      background: isSelected ? '#1f4068' : '#0d1117',
                      border: `1px solid ${isSelected ? '#1f6feb' : '#30363d'}`,
                      opacity: hasLocal ? 1 : 0.5
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#79c0ff' : '#e6edf3' }}>
                        {repo.name}
                      </span>
                      {repo.language && (
                        <span style={{ fontSize: 10, color: '#8b949e', background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>
                          {repo.language}
                        </span>
                      )}
                      {repo.isPrivate && (
                        <span style={{ fontSize: 10, color: '#f0883e' }}>🔒</span>
                      )}
                    </div>
                    {repo.description && (
                      <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {repo.description}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: hasLocal ? '#3fb950' : '#f85149' }}>
                      {hasLocal ? `✓ ${repo.localPath}` : '✗ not cloned locally'}
                    </div>
                    {!hasLocal && repo.cloneUrl && (
                      <div style={{ fontSize: 10, color: '#484f58', fontFamily: 'monospace', marginTop: 2 }}>
                        git clone {repo.cloneUrl}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected path display */}
          {projectPath && (
            <div style={{ fontSize: 11, color: '#3fb950', background: '#0d2f1a', padding: '4px 8px', borderRadius: 4, wordBreak: 'break-all' }}>
              ✓ {projectPath}
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Prompt (⌘↵ to run)</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. /review-pr or describe what you need..."
              style={{ ...inputStyle, flex: 1, resize: 'none', fontFamily: 'inherit', minHeight: 60 }}
            />
          </div>

          <button
            onClick={handleRun}
            disabled={running || !projectPath || !prompt}
            style={{
              background: running ? '#21262d' : '#238636',
              color: running ? '#8b949e' : '#fff',
              border: 'none', borderRadius: 6, padding: '8px 14px',
              cursor: running ? 'default' : 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
            }}
          >
            {running
              ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span> Running…</>
              : '▶ Run Claude'}
          </button>
        </div>
      </div>

      {/* Output */}
      <div ref={outputRef} style={{
        flex: 1, padding: '10px 14px', overflow: 'auto',
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
        fontSize: 12, lineHeight: 1.6
      }}>
        {output.length === 0
          ? <div style={{ color: '#484f58', paddingTop: 8 }}>Output will appear here…</div>
          : output.map((line, i) => {
            const color = line.type === 'error' ? '#f85149'
              : line.type === 'meta' ? '#8b949e'
              : line.type === 'done' ? '#3fb950'
              : '#e6edf3';
            return (
              <div key={i} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {line.type === 'done' ? `\n✓ Process exited with code ${line.code}` : line.message}
              </div>
            );
          })
        }
        {running && <div style={{ color: '#8b949e', marginTop: 4 }}>▋</div>}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const labelStyle = { fontSize: 11, color: '#8b949e', display: 'block', marginBottom: 4 };
const inputStyle = {
  width: '100%', background: '#0d1117', color: '#e6edf3',
  border: '1px solid #30363d', borderRadius: 6, padding: '7px 10px',
  fontSize: 12, outline: 'none', fontFamily: 'inherit'
};
