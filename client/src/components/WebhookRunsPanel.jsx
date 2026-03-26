import { useState, useEffect, useRef } from 'react';
import { killWebhookRun } from '../api.js';

const URL_REGEX = /(https?:\/\/[^\s\])"'>]+)/g;
function renderWithLinks(text) {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: '#79c0ff', textDecoration: 'underline' }}>{part}</a>
      : part
  );
}

async function fetchRuns() {
  return (await fetch('/api/webhooks/runs')).json();
}

function elapsed(startTime, endTime) {
  const ms = new Date(endTime || Date.now()) - new Date(startTime);
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export default function WebhookRunsPanel() {
  const [runs, setRuns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef(null);
  const outputRef = useRef(null);

  const loadRuns = () =>
    fetchRuns()
      .then(data => {
        setRuns(data);
        setSelectedId(prev => prev ?? (data[0]?.execId || null));
      })
      .catch(() => {});

  useEffect(() => {
    loadRuns();
  }, []);

  // Tick for elapsed time on running jobs
  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running');
    if (hasRunning) {
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
    }
  }, [runs]);

  // Poll when any run is active
  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running');
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(loadRuns, 2000);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [runs]);

  // Auto-select newest run when it arrives
  useEffect(() => {
    if (runs[0]?.status === 'running') setSelectedId(runs[0].execId);
  }, [runs[0]?.execId]);

  // Auto-scroll output on new lines
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [runs.find(r => r.execId === selectedId)?.output?.length]);

  const selected = runs.find(r => r.execId === selectedId);
  const activeCount = runs.filter(r => r.status === 'running').length;

  const statusColor = s => s === 'running' ? '#f0883e' : s === 'done' ? '#3fb950' : s === 'killed' ? '#8b949e' : '#f85149';
  const statusIcon = s => s === 'running' ? '◌' : s === 'done' ? '✓' : s === 'killed' ? '⊘' : '✗';

  const handleKill = async (execId) => {
    await killWebhookRun(execId);
    loadRuns();
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: run list */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8, background: '#161b22', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#8b949e', flex: 1, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {runs.length} webhook run{runs.length !== 1 ? 's' : ''}
          </span>
          {activeCount > 0 && (
            <span style={{ fontSize: 10, color: '#f0883e' }}>● {activeCount} running</span>
          )}
          <button
            onClick={loadRuns}
            style={{ fontSize: 11, color: '#8b949e', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
          >
            ↺
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {runs.length === 0 && (
            <div style={{ padding: '16px 12px', fontSize: 12, color: '#484f58' }}>
              No webhook runs yet. Trigger a webhook or use <strong style={{ color: '#8b949e' }}>⚡ Webhooks</strong> to fire a test.
            </div>
          )}
          {runs.map(run => {
            const isSelected = run.execId === selectedId;
            const sColor = statusColor(run.status);
            return (
              <div
                key={run.execId}
                onClick={() => setSelectedId(run.execId)}
                style={{
                  padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #21262d',
                  background: isSelected ? '#1a2332' : 'transparent',
                  borderLeft: `3px solid ${isSelected ? sColor : 'transparent'}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{
                    fontSize: 11, color: sColor,
                    ...(run.status === 'running' ? { animation: 'spin 1.5s linear infinite', display: 'inline-block' } : {})
                  }}>
                    {statusIcon(run.status)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#e6edf3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.webhookName}
                  </span>
                </div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#79c0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                  {run.prompt}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8b949e' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {run.projectPath?.split('/').pop()}
                  </span>
                  <span style={{ color: '#484f58', whiteSpace: 'nowrap' }}>
                    {elapsed(run.startTime, run.endTime)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: output viewer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            {/* Run header */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #30363d', background: '#161b22', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: statusColor(selected.status), fontWeight: 600 }}>
                {statusIcon(selected.status)} {selected.status}
              </span>
              <span style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.webhookName}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#79c0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                {selected.prompt}
              </span>
              <span style={{ fontSize: 10, color: '#484f58' }}>{selected.projectPath?.split('/').pop()}</span>
              <span style={{ fontSize: 10, color: '#484f58' }}>{elapsed(selected.startTime, selected.endTime)}</span>
              {selected.startTime && (
                <span style={{ fontSize: 10, color: '#484f58' }}>
                  {new Date(selected.startTime).toLocaleString()}
                </span>
              )}
              {selected.status === 'running' && (
                <button
                  onClick={() => handleKill(selected.execId)}
                  style={{ fontSize: 11, color: '#f85149', background: '#2d1117', border: '1px solid #f85149', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}
                >
                  ✕ Kill
                </button>
              )}
            </div>

            {/* Payload + meta */}
            {selected.payload && selected.payload !== '{}' && (
              <div style={{ padding: '6px 14px', borderBottom: '1px solid #21262d', background: '#0d1117', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: '#484f58' }}>payload: </span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#8b949e', wordBreak: 'break-all' }}>
                  {selected.payload.length > 200 ? selected.payload.slice(0, 200) + '…' : selected.payload}
                </span>
              </div>
            )}

            {/* Output */}
            <div
              ref={outputRef}
              style={{
                flex: 1, overflow: 'auto', padding: '10px 14px',
                fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
                fontSize: 12, lineHeight: 1.6
              }}
            >
              {selected.output.map((line, i) => {
                if (line.type === 'tool') return (
                  <div key={i} style={{ margin: '4px 0', padding: '4px 8px', borderRadius: 4, background: '#161b22', border: '1px solid #30363d' }}>
                    <span style={{ color: '#d2a679', fontWeight: 600 }}>{line.message}</span>
                    {line.detail && <span style={{ color: '#484f58', marginLeft: 8 }}>{line.detail}</span>}
                  </div>
                );
                if (line.type === 'tool_result') return (
                  <div key={i} style={{ margin: '2px 0 4px 16px', padding: '3px 8px', borderLeft: '2px solid #30363d', color: '#8b949e', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11 }}>
                    {line.message}
                  </div>
                );
                const color = line.type === 'error' ? '#f85149'
                  : line.type === 'meta' ? '#8b949e'
                  : '#e6edf3';
                return (
                  <div key={i} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {renderWithLinks(line.message)}
                  </div>
                );
              })}
              {selected.status === 'running' && <div style={{ color: '#8b949e', marginTop: 4 }}>▋</div>}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: 12 }}>
            Select a run to view its output.
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
