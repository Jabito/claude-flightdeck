import { useState, useEffect, useRef } from 'react';
import { getProjects, getCommands, runClaude } from '../api.js';

async function getBitbucketRepos() {
  const r = await fetch('/api/bitbucket-repos');
  return r.json();
}

export default function ClaudeRunner() {
  const [commands, setCommands] = useState([]);
  const [projects, setProjects] = useState([]);
  const [bbRepos, setBbRepos] = useState([]);
  const [bbLoading, setBbLoading] = useState(false);
  const [bbError, setBbError] = useState('');
  const [projectTab, setProjectTab] = useState('local');
  const [selectedCommand, setSelectedCommand] = useState('');
  const [cmdArgs, setCmdArgs] = useState('');
  const [freePrompt, setFreePrompt] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [allowPermissions, setAllowPermissions] = useState(true);
  const [output, setOutput] = useState([]);
  const [running, setRunning] = useState(false);
  const outputRef = useRef(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
    getCommands().then(setCommands).catch(() => {});
  }, []);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
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

  const handleProjectTabChange = (tab) => {
    setProjectTab(tab);
    setProjectPath('');
    if (tab === 'bitbucket') loadBbRepos();
  };

  const effectivePrompt = selectedCommand
    ? (cmdArgs.trim() ? `/${selectedCommand} ${cmdArgs.trim()}` : `/${selectedCommand}`)
    : freePrompt.trim();

  const canRun = !running && !!projectPath.trim() && !!effectivePrompt;

  const handleRun = async () => {
    if (!canRun) return;
    setOutput([{
      type: 'meta',
      message: `$ claude -p "${effectivePrompt}"${allowPermissions ? ' --dangerously-skip-permissions' : ''}\n  cwd: ${projectPath}`
    }]);
    setRunning(true);
    try {
      await runClaude(projectPath, effectivePrompt, allowPermissions, (data) => {
        setOutput(prev => [...prev, data]);
      });
    } catch (e) {
      setOutput(prev => [...prev, { type: 'error', message: e.message }]);
    } finally {
      setRunning(false);
    }
  };

  // Group commands by domain
  const commandsByDomain = commands.reduce((acc, cmd) => {
    (acc[cmd.domain] = acc[cmd.domain] || []).push(cmd);
    return acc;
  }, {});

  const lastLine = output.at(-1);
  const statusColor = running ? '#f0883e'
    : lastLine?.type === 'done' ? (lastLine.code === 0 ? '#3fb950' : '#f85149')
    : '#484f58';
  const statusText = running ? '● Running…'
    : lastLine?.type === 'done' ? (lastLine.code === 0 ? '✓ Done' : `✗ Exit ${lastLine.code}`)
    : '';

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: Controls */}
      <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #30363d', overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>

          {/* Command selector */}
          <div>
            <label style={labelStyle}>Command</label>
            <select
              value={selectedCommand}
              onChange={e => { setSelectedCommand(e.target.value); setCmdArgs(''); }}
              style={inputStyle}
            >
              <option value="">— Free prompt —</option>
              {Object.entries(commandsByDomain).map(([domain, cmds]) => (
                <optgroup key={domain} label={domain}>
                  {cmds.map(cmd => (
                    <option key={cmd.id} value={cmd.id}>/{cmd.id}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Arguments or free prompt */}
          {selectedCommand ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Arguments</label>
              <input
                value={cmdArgs}
                onChange={e => setCmdArgs(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRun()}
                placeholder="e.g. TIDP-421"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: '#8b949e', background: '#161b22', padding: '5px 8px', borderRadius: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {effectivePrompt}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Prompt <span style={{ color: '#484f58' }}>(⌘↵ to run)</span></label>
              <textarea
                value={freePrompt}
                onChange={e => setFreePrompt(e.target.value)}
                onKeyDown={e => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && handleRun()}
                placeholder="Describe what you need…"
                style={{ ...inputStyle, resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
              />
            </div>
          )}

          {/* Permissions toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: '#8b949e' }}>
            <input
              type="checkbox"
              checked={allowPermissions}
              onChange={e => setAllowPermissions(e.target.checked)}
              style={{ accentColor: '#1f6feb', cursor: 'pointer' }}
            />
            Allow all permissions
          </label>

          <div style={{ borderTop: '1px solid #30363d' }} />

          {/* Project selector */}
          <div>
            <label style={labelStyle}>Target Project</label>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #30363d', marginBottom: 8 }}>
              {['local', 'bitbucket'].map(tab => (
                <button key={tab} onClick={() => handleProjectTabChange(tab)} style={{
                  flex: 1, padding: '5px 0', fontSize: 11, cursor: 'pointer', border: 'none',
                  background: projectTab === tab ? '#1f6feb' : '#0d1117',
                  color: projectTab === tab ? '#fff' : '#8b949e',
                  textTransform: 'capitalize'
                }}>
                  {tab === 'bitbucket' ? 'Bitbucket' : 'Local'}
                </button>
              ))}
            </div>

            {projectTab === 'local' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select value={projectPath} onChange={e => setProjectPath(e.target.value)} style={inputStyle}>
                  <option value="">Select project…</option>
                  {projects.map(p => (
                    <option key={p.path} value={p.path}>
                      {p.hasClaudeMd ? '◈ ' : ''}{p.name}
                    </option>
                  ))}
                </select>
                <input
                  value={projectPath}
                  onChange={e => setProjectPath(e.target.value)}
                  placeholder="or enter path manually…"
                  style={inputStyle}
                />
              </div>
            )}

            {projectTab === 'bitbucket' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflow: 'auto' }}>
                {bbLoading && <div style={{ fontSize: 12, color: '#8b949e' }}>Loading repos…</div>}
                {bbError && <div style={{ fontSize: 12, color: '#f85149' }}>{bbError}</div>}
                {!bbLoading && !bbError && bbRepos.length === 0 && (
                  <div style={{ fontSize: 12, color: '#484f58' }}>No repos found</div>
                )}
                {bbRepos.map(repo => {
                  const isSelected = projectPath === (repo.localPath || '');
                  const hasLocal = !!repo.localPath;
                  return (
                    <div key={repo.slug} onClick={() => hasLocal && setProjectPath(repo.localPath)} style={{
                      padding: '7px 9px', borderRadius: 6, cursor: hasLocal ? 'pointer' : 'default',
                      background: isSelected ? '#1f4068' : '#0d1117',
                      border: `1px solid ${isSelected ? '#1f6feb' : '#30363d'}`,
                      opacity: hasLocal ? 1 : 0.5
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#79c0ff' : '#e6edf3' }}>{repo.name}</div>
                      <div style={{ fontSize: 10, color: hasLocal ? '#3fb950' : '#f85149' }}>
                        {hasLocal ? `✓ ${repo.localPath}` : '✗ not cloned locally'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {projectPath && (
              <div style={{ fontSize: 11, color: '#3fb950', background: '#0d2f1a', padding: '4px 8px', borderRadius: 4, marginTop: 6, wordBreak: 'break-all' }}>
                ✓ {projectPath}
              </div>
            )}
          </div>
        </div>

        {/* Run button */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid #30363d', flexShrink: 0 }}>
          <button
            onClick={handleRun}
            disabled={!canRun}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 6, border: 'none',
              background: canRun ? '#238636' : '#21262d',
              color: canRun ? '#fff' : '#484f58',
              cursor: canRun ? 'pointer' : 'default', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
            }}
          >
            {running
              ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span> Running…</>
              : '▶ Run Claude'}
          </button>
        </div>
      </div>

      {/* Right: Output */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Output header */}
        <div style={{
          padding: '6px 14px', borderBottom: '1px solid #30363d', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8, background: '#161b22'
        }}>
          <span style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.8 }}>Output</span>
          {statusText && <span style={{ fontSize: 11, color: statusColor }}>{statusText}</span>}
          <div style={{ flex: 1 }} />
          {output.length > 0 && !running && (
            <button onClick={() => setOutput([])} style={{ fontSize: 11, color: '#8b949e', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              Clear
            </button>
          )}
        </div>

        {/* Output body */}
        <div ref={outputRef} style={{
          flex: 1, padding: '10px 14px', overflow: 'auto',
          fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
          fontSize: 12, lineHeight: 1.6
        }}>
          {output.length === 0
            ? <div style={{ color: '#484f58', paddingTop: 8 }}>Select a command and project, then click Run…</div>
            : output.map((line, i) => {
              const color = line.type === 'error' ? '#f85149'
                : line.type === 'meta' ? '#8b949e'
                : line.type === 'done' ? statusColor
                : '#e6edf3';
              return (
                <div key={i} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {line.type === 'done'
                    ? `\n${line.code === 0 ? '✓' : '✗'} Process exited (code ${line.code})`
                    : line.message}
                </div>
              );
            })
          }
          {running && <div style={{ color: '#8b949e', marginTop: 4 }}>▋</div>}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const labelStyle = { fontSize: 11, color: '#8b949e', display: 'block', marginBottom: 4 };
const inputStyle = {
  width: '100%', background: '#0d1117', color: '#e6edf3',
  border: '1px solid #30363d', borderRadius: 6, padding: '7px 10px',
  fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
};
