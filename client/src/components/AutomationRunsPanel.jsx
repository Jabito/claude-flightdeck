import { useState, useEffect, useRef } from 'react';
import { killWebhookRun, killPollRun, killScheduleRun, sendWebhookRunInput, sendPollRunInput, sendScheduleRunInput } from '../api.js';

const URL_REGEX = /(https?:\/\/[^\s\])"'>]+)/g;
function renderWithLinks(text) {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: '#79c0ff', textDecoration: 'underline' }}>{part}</a>
      : part
  );
}

function elapsed(startTime, endTime) {
  const ms = new Date(endTime || Date.now()) - new Date(startTime);
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatRunTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isThisYear = d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(isThisYear ? {} : { year: 'numeric' }) });
  return `${date}, ${time}`;
}

async function fetchAllRuns() {
  const [webhookRuns, pollRuns, scheduleRuns] = await Promise.all([
    fetch('/api/webhooks/runs').then(r => r.json()).catch(() => []),
    fetch('/api/polls/runs').then(r => r.json()).catch(() => []),
    fetch('/api/schedules/runs').then(r => r.json()).catch(() => [])
  ]);
  const wh = (Array.isArray(webhookRuns) ? webhookRuns : []).map(r => ({ ...r, source: r.source || 'webhook' }));
  const pr = (Array.isArray(pollRuns) ? pollRuns : []).map(r => ({ ...r, source: 'poll' }));
  const sc = (Array.isArray(scheduleRuns) ? scheduleRuns : []).map(r => ({ ...r, source: 'schedule' }));
  return [...wh, ...pr, ...sc].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

export default function AutomationRunsPanel() {
  const [runs, setRuns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [now, setNow] = useState(Date.now());
  const [inputMsg, setInputMsg] = useState('');
  const pollRef = useRef(null);
  const outputRef = useRef(null);

  const loadRuns = () =>
    fetchAllRuns()
      .then(data => {
        setRuns(data);
        setSelectedId(prev => prev ?? (data[0]?.execId || null));
      })
      .catch(() => {});

  useEffect(() => { loadRuns(); }, []);

  // Tick elapsed for running jobs
  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running');
    if (!hasRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runs]);

  // Poll server when runs are active
  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running');
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(loadRuns, 2000);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [runs]);

  // Jump to newest running run
  useEffect(() => {
    const running = runs.find(r => r.status === 'running');
    if (running) setSelectedId(running.execId);
  }, [runs.find(r => r.status === 'running')?.execId]);

  // Auto-select run waiting for input
  useEffect(() => {
    const waiting = runs.find(r =>
      r.status === 'running' && r.allowPermissions === false &&
      r.output?.slice(-1)[0]?.message?.match(/\?\s*$|\(y\/n\)|\(yes\/no\)/i)
    );
    if (waiting) setSelectedId(waiting.execId);
  }, [runs]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [runs.find(r => r.execId === selectedId)?.output?.length]);

  const filtered = filter === 'all' ? runs : runs.filter(r => r.source === filter);
  const selected = runs.find(r => r.execId === selectedId);
  const activeCount = runs.filter(r => r.status === 'running').length;
  const whCount = runs.filter(r => r.source === 'webhook').length;
  const pollCount = runs.filter(r => r.source === 'poll').length;
  const schedCount = runs.filter(r => r.source === 'schedule').length;

  const statusColor = s => s === 'running' ? '#f0883e' : s === 'done' ? '#3fb950' : s === 'killed' ? '#8b949e' : '#f85149';
  const statusIcon = s => s === 'running' ? '◌' : s === 'done' ? '✓' : s === 'killed' ? '⊘' : '✗';

  const handleKill = async (run) => {
    if (run.source === 'poll') await killPollRun(run.execId);
    else if (run.source === 'schedule') await killScheduleRun(run.execId);
    else await killWebhookRun(run.execId);
    loadRuns();
  };

  const handleSendInput = async (quickMsg) => {
    const message = quickMsg ?? inputMsg.trim();
    if (!message || !selected) return;
    const sendFn = selected.source === 'poll' ? sendPollRunInput
      : selected.source === 'schedule' ? sendScheduleRunInput
      : sendWebhookRunInput;
    try {
      await sendFn(selected.execId, message);
      if (!quickMsg) setInputMsg('');
    } catch {}
  };

  const runName = (run) => {
    if (run.source === 'poll') return `${run.pollName} — ${run.issueKey}`;
    if (run.source === 'schedule') return run.scheduleName;
    return run.webhookName;
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: run list */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8, background: '#161b22', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#8b949e', flex: 1, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {runs.length} run{runs.length !== 1 ? 's' : ''}
          </span>
          {activeCount > 0 && <span style={{ fontSize: 10, color: '#f0883e' }}>● {activeCount} active</span>}
          <button onClick={loadRuns} style={{ fontSize: 11, color: '#8b949e', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>↺</button>
        </div>

        {/* Source filter */}
        <div style={{ display: 'flex', borderBottom: '1px solid #21262d', background: '#0d1117', flexShrink: 0 }}>
          {[
            { key: 'all', label: `All (${runs.length})` },
            { key: 'webhook', label: `⚡ ${whCount}` },
            { key: 'poll', label: `⏱ ${pollCount}` },
            { key: 'schedule', label: `⏰ ${schedCount}` }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                flex: 1, padding: '6px 4px', border: 'none', cursor: 'pointer', fontSize: 10,
                background: filter === tab.key ? '#161b22' : 'transparent',
                color: filter === tab.key ? '#e6edf3' : '#8b949e',
                borderBottom: filter === tab.key ? '2px solid #1f6feb' : '2px solid transparent'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '16px 12px', fontSize: 12, color: '#484f58' }}>
              No runs yet. Trigger a webhook or use <strong style={{ color: '#8b949e' }}>▶ Run Now</strong> in Polls.
            </div>
          )}
          {filtered.map(run => {
            const isSelected = run.execId === selectedId;
            const sColor = statusColor(run.status);
            const lastLine = run.output?.[run.output.length - 1];
            const waitingForInput = run.status === 'running' && run.allowPermissions === false
              && lastLine?.message?.match(/\?\s*$|\(y\/n\)|\(yes\/no\)/i);
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
                    {runName(run)}
                  </span>
                  <span style={{
                    fontSize: 9, color: run.source === 'poll' ? '#d2a679' : run.source === 'schedule' ? '#a371f7' : '#8b949e',
                    background: '#0d1117', border: '1px solid #30363d', borderRadius: 3, padding: '1px 4px'
                  }}>
                    {run.source === 'poll' ? '⏱' : run.source === 'schedule' ? '⏰' : '⚡'}
                  </span>
                </div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#79c0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                  {run.prompt}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8b949e' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {run.projectPath?.split('/').pop()}
                  </span>
                  <span style={{ color: '#484f58', whiteSpace: 'nowrap' }}>{formatRunTime(run.startTime)}</span>
                  {waitingForInput
                    ? <span style={{ color: '#f0883e', animation: 'pulse 1s ease-in-out infinite', whiteSpace: 'nowrap' }}>⏸ needs input</span>
                    : <span style={{ color: '#484f58', whiteSpace: 'nowrap' }}>{elapsed(run.startTime, run.endTime)}</span>
                  }
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
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #30363d', background: '#161b22', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: statusColor(selected.status), fontWeight: 600 }}>
                {statusIcon(selected.status)} {selected.status}
              </span>
              <span style={{
                fontSize: 9, color: selected.source === 'poll' ? '#d2a679' : selected.source === 'schedule' ? '#a371f7' : '#8b949e',
                background: '#0d1117', border: '1px solid #30363d', borderRadius: 3, padding: '2px 6px'
              }}>
                {selected.source === 'poll' ? '⏱ Poll' : selected.source === 'schedule' ? '⏰ Schedule' : '⚡ Webhook'}
              </span>
              <span style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {runName(selected)}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#79c0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                {selected.prompt}
              </span>
              <span style={{ fontSize: 10, color: '#484f58' }}>{selected.projectPath?.split('/').pop()}</span>
              <span style={{ fontSize: 10, color: '#484f58' }}>{elapsed(selected.startTime, selected.endTime)}</span>
              {selected.startTime && (
                <span style={{ fontSize: 10, color: '#484f58' }}>{new Date(selected.startTime).toLocaleString()}</span>
              )}
              {selected.status === 'running' && (
                <button
                  onClick={() => handleKill(selected)}
                  style={{ fontSize: 11, color: '#f85149', background: '#2d1117', border: '1px solid #f85149', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}
                >
                  ✕ Kill
                </button>
              )}
            </div>

            {/* Context row: payload (webhook) or issue info (poll) */}
            {selected.source === 'webhook' && selected.payload && selected.payload !== '{}' && (
              <div style={{ padding: '6px 14px', borderBottom: '1px solid #21262d', background: '#0d1117', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: '#484f58' }}>payload: </span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#8b949e', wordBreak: 'break-all' }}>
                  {selected.payload.length > 200 ? selected.payload.slice(0, 200) + '…' : selected.payload}
                </span>
              </div>
            )}
            {selected.source === 'poll' && selected.issueKey && (
              <div style={{ padding: '6px 14px', borderBottom: '1px solid #21262d', background: '#0d1117', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: '#484f58' }}>issue: </span>
                <span style={{ fontSize: 10, color: '#d2a679', fontFamily: 'monospace' }}>{selected.issueKey}</span>
                {selected.issueSummary && (
                  <span style={{ fontSize: 10, color: '#8b949e', marginLeft: 8 }}>{selected.issueSummary}</span>
                )}
              </div>
            )}

            <div
              ref={outputRef}
              style={{ flex: 1, overflow: 'auto', padding: '10px 14px', fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace", fontSize: 12, lineHeight: 1.6 }}
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
                const color = line.type === 'error' ? '#f85149' : line.type === 'meta' ? '#8b949e' : '#e6edf3';
                return (
                  <div key={i} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {renderWithLinks(line.message)}
                  </div>
                );
              })}
              {selected.status === 'running' && <div style={{ color: '#8b949e', marginTop: 4 }}>▋</div>}
            </div>

            {selected.status === 'running' && selected.allowPermissions === false && (
              <div style={{
                padding: '8px 14px', borderTop: '1px solid #30363d',
                background: '#161b22', flexShrink: 0,
                display: 'flex', gap: 8, alignItems: 'center'
              }}>
                <span style={{ fontSize: 10, color: '#8b949e', whiteSpace: 'nowrap' }}>Reply:</span>
                {['y', 'n'].map(q => (
                  <button
                    key={q}
                    onClick={() => handleSendInput(q)}
                    style={{
                      background: '#0d1117', color: '#e6edf3',
                      border: '1px solid #30363d', borderRadius: 4,
                      padding: '3px 10px', fontSize: 11, cursor: 'pointer'
                    }}
                  >
                    {q}
                  </button>
                ))}
                <input
                  value={inputMsg}
                  onChange={e => setInputMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && inputMsg.trim() && handleSendInput()}
                  placeholder="Send message to Claude…"
                  style={{
                    flex: 1, background: '#0d1117', color: '#e6edf3',
                    border: '1px solid #30363d', borderRadius: 6,
                    padding: '5px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit'
                  }}
                />
                <button
                  onClick={() => handleSendInput()}
                  disabled={!inputMsg.trim()}
                  style={{
                    background: inputMsg.trim() ? '#1f6feb' : '#21262d',
                    color: inputMsg.trim() ? '#fff' : '#484f58',
                    border: 'none', borderRadius: 6, padding: '5px 14px',
                    fontSize: 12, cursor: inputMsg.trim() ? 'pointer' : 'default'
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: 12 }}>
            Select a run to view its output.
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
