import { useState, useEffect, useRef } from 'react';
import { sendRunInput, clearCommandRuns, deleteCommandRun, killRun, continueRun } from '../api.js';

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

function lineElapsed(ms) {
  if (ms < 0) return '';
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60000) return `+${(ms / 1000).toFixed(1)}s`;
  return `+${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export default function RunsPanel({ runs, setRuns, updateRun, appendRunOutput, onReRun }) {
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [continueMsg, setContinueMsg] = useState('');
  const [continueAllowPerms, setContinueAllowPerms] = useState(false);
  const outputRef = useRef(null);

  // Tick for elapsed time on running jobs
  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running');
    if (!hasRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runs]);

  // Auto-select newest run when a new one arrives
  useEffect(() => {
    if (runs.length > 0) setSelectedId(prev => prev ?? runs[0].id);
  }, [runs.length]);

  // Also jump to newest if it's running
  useEffect(() => {
    if (runs[0]?.status === 'running') setSelectedId(runs[0].id);
  }, [runs[0]?.id]);

  // Auto-select a run that is waiting for user input, but don't interrupt if user is watching a running run
  useEffect(() => {
    if (selected?.status === 'running') return;
    const waiting = runs.find(r => r.pausedForInput);
    if (waiting) setSelectedId(waiting.id);
  }, [runs]);

  // Auto-scroll output when selected run updates
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [runs.find(r => r.id === selectedId)?.output?.length]);

  const selected = runs.find(r => r.id === selectedId);

  // Reset inputs when switching runs
  useEffect(() => {
    setFeedbackMsg('');
    setContinueMsg('');
  }, [selectedId]);

  const handleSendFeedback = async (quickMsg) => {
    const message = quickMsg ?? feedbackMsg.trim();
    if (!message || !selected) return;
    try {
      await sendRunInput(selected.id, message);
      appendRunOutput(selected.id, { type: 'meta', message: `> ${message}` });
      if (!quickMsg) setFeedbackMsg('');
    } catch (e) {
      appendRunOutput(selected.id, { type: 'error', message: `Failed to send input: ${e.message}` });
    }
  };

  const handleContinue = async () => {
    const message = continueMsg.trim();
    if (!message || !selected) return;
    setContinueMsg('');

    // Reset the existing run back to running — continuation streams into the same record
    updateRun(selected.id, {
      status: 'running',
      endTime: null,
      pausedForInput: false,
      sessionId: null,
      cancel: null,
    });

    const { cancel } = continueRun(selected.id, message, continueAllowPerms, (data) => {
      if (data.type === 'done') {
        updateRun(selected.id, {
          status: data.code === 0 ? 'done' : 'error',
          exitCode: data.code,
          endTime: new Date().toISOString(),
          cancel: null,
          ...(data.sessionId && { sessionId: data.sessionId, pausedForInput: data.pausedForInput ?? false }),
        });
      } else {
        appendRunOutput(selected.id, data);
      }
    });
    updateRun(selected.id, { cancel });
  };

  const handleDeleteRun = (e, id) => {
    e.stopPropagation();
    if (selectedId === id) {
      const idx = runs.findIndex(r => r.id === id);
      const next = runs[idx + 1] ?? runs[idx - 1];
      setSelectedId(next?.id ?? null);
    }
    setRuns(prev => prev.filter(r => r.id !== id));
    deleteCommandRun(id).catch(() => {});
  };

  const statusColor = (s, run) => {
    if (s === 'done' && run?.pausedForInput) return '#f0883e';
    return s === 'running' ? '#f0883e' : s === 'done' ? '#3fb950' : s === 'killed' ? '#8b949e' : '#f85149';
  };
  const statusIcon = (s, run) => {
    if (s === 'done' && run?.pausedForInput) return '⏸';
    return s === 'running' ? '◌' : s === 'done' ? '✓' : s === 'killed' ? '⊘' : '✗';
  };
  const statusLabel = (s, run) => {
    if (s === 'done' && run?.pausedForInput) return 'waiting for input';
    return s;
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: run list */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8, background: '#161b22', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#8b949e', flex: 1, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {runs.length} run{runs.length !== 1 ? 's' : ''}
          </span>
          {runs.length > 0 && (
            <button
              onClick={() => { setRuns([]); setSelectedId(null); clearCommandRuns().catch(() => {}); }}
              style={{ fontSize: 11, color: '#8b949e', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            >
              Clear all
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {runs.length === 0 && (
            <div style={{ padding: '16px 12px', fontSize: 12, color: '#484f58' }}>
              No runs yet. Use the <strong style={{ color: '#8b949e' }}>▶ Run</strong> tab to launch a command.
            </div>
          )}
          {runs.map(run => {
            const isSelected = run.id === selectedId;
            const sColor = statusColor(run.status, run);
            const lastLine = run.output?.[run.output.length - 1];
            const waitingForInput =
              (run.status === 'running' && run.allowPermissions === false
                && (lastLine?.type === 'ask_user' || lastLine?.message?.match(/\?\s*$|\(y\/n\)|\(yes\/no\)/i)))
              || (run.status === 'done' && run.pausedForInput);
            return (
              <div
                key={run.id}
                onClick={() => setSelectedId(run.id)}
                onMouseEnter={() => setHoveredId(run.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #21262d',
                  background: isSelected ? '#1a2332' : 'transparent',
                  borderLeft: `3px solid ${isSelected ? sColor : 'transparent'}`,
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{
                    fontSize: 11, color: sColor,
                    ...(run.status === 'running' ? { animation: 'spin 1.5s linear infinite', display: 'inline-block' } : {}),
                    ...(waitingForInput && run.status === 'done' ? { animation: 'pulse 1s ease-in-out infinite' } : {})
                  }}>
                    {statusIcon(run.status, run)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#e6edf3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.label}
                  </span>
                  {run.status !== 'running' && hoveredId === run.id && (
                    <button
                      onClick={e => handleDeleteRun(e, run.id)}
                      title="Delete run"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#8b949e', fontSize: 13, lineHeight: 1, padding: '0 2px',
                        flexShrink: 0
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8b949e' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{run.projectName}</span>
                  {waitingForInput
                    ? <span style={{ color: '#f0883e', animation: 'pulse 1s ease-in-out infinite', whiteSpace: 'nowrap' }}>⏸ waiting for input</span>
                    : <span style={{ color: '#484f58', whiteSpace: 'nowrap' }}>{elapsed(run.startTime, run.endTime)}</span>
                  }
                </div>
                {run.startTime && (
                  <div style={{ fontSize: 10, color: '#484f58', marginTop: 1 }}>
                    {formatRunTime(run.startTime)}
                  </div>
                )}
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
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #30363d', background: '#161b22', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: statusColor(selected.status, selected), fontWeight: 600 }}>
                {statusIcon(selected.status, selected)} {statusLabel(selected.status, selected)}
              </span>
              <span style={{ fontSize: 12, color: '#e6edf3', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.label}
              </span>
              <span style={{ fontSize: 10, color: '#484f58' }}>{selected.projectName}</span>
              <span style={{ fontSize: 10, color: '#484f58' }}>{elapsed(selected.startTime, selected.endTime)}</span>
              {selected.status === 'running' && (
                <button
                  onClick={() => {
                    selected.cancel?.();
                    killRun(selected.id).catch(() => {});
                    updateRun(selected.id, { status: 'killed', endTime: new Date().toISOString(), cancel: null });
                    appendRunOutput(selected.id, { type: 'meta', message: '⚠ Process killed by user' });
                  }}
                  style={{ fontSize: 11, color: '#f85149', background: '#2d1117', border: '1px solid #f85149', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
                >
                  ✕ Kill
                </button>
              )}
              {selected.status !== 'running' && onReRun && (
                <button
                  onClick={() => onReRun(selected)}
                  style={{ fontSize: 11, color: '#79c0ff', background: '#1f4068', border: '1px solid #1f6feb', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}
                >
                  ↺ Re-run
                </button>
              )}
            </div>

            {/* Output */}
            <div
              ref={outputRef}
              style={{
                flex: 1, minHeight: 0, overflow: 'auto', padding: '10px 14px',
                fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
                fontSize: 12, lineHeight: 1.6
              }}
            >
              {selected.output.map((line, i) => {
                const ts = line.receivedAt && selected.startTime
                  ? lineElapsed(line.receivedAt - new Date(selected.startTime).getTime())
                  : null;
                const tsEl = ts ? <span style={{ color: '#484f58', fontSize: 10, flexShrink: 0, marginLeft: 12, alignSelf: 'flex-start', paddingTop: 2 }}>{ts}</span> : null;

                if (line.type === 'ask_user') return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', margin: '6px 0' }}>
                    <div style={{ flex: 1, padding: '8px 12px', borderRadius: 4, background: '#161b22', border: '1px solid #f0883e' }}>
                      <div style={{ color: '#f0883e', fontWeight: 600, fontSize: 11, marginBottom: 4 }}>⏸ Claude is asking:</div>
                      <div style={{ color: '#e6edf3' }}>{line.message}</div>
                      {line.options?.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {line.options.map((opt, oi) => (
                            <span key={oi} style={{ fontSize: 10, color: '#79c0ff', background: '#0d1117', border: '1px solid #30363d', borderRadius: 3, padding: '2px 8px' }}>{opt}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {tsEl}
                  </div>
                );
                if (line.type === 'tool') return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', margin: '4px 0' }}>
                    <div style={{ flex: 1, padding: '4px 8px', borderRadius: 4, background: '#161b22', border: '1px solid #30363d' }}>
                      <span style={{ color: '#d2a679', fontWeight: 600 }}>{line.message}</span>
                      {line.detail && <span style={{ color: '#484f58', marginLeft: 8 }}>{line.detail}</span>}
                    </div>
                    {tsEl}
                  </div>
                );
                if (line.type === 'tool_result') return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', margin: '2px 0 4px 16px' }}>
                    <div style={{ flex: 1, padding: '3px 8px', borderLeft: '2px solid #30363d', color: '#8b949e', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11 }}>
                      {line.message}
                    </div>
                    {tsEl}
                  </div>
                );
                const doneColor = line.code === 0 ? '#3fb950' : '#f85149';
                const color = line.type === 'error' ? '#f85149'
                  : line.type === 'meta' ? '#8b949e'
                  : line.type === 'done' ? doneColor
                  : '#e6edf3';
                const text = line.type === 'done'
                  ? `\n${line.code === 0 ? '✓' : '✗'} Process exited (code ${line.code}${line.signal ? `, signal ${line.signal}` : ''})`
                  : (line.message ?? '');
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {renderWithLinks(text)}
                    </div>
                    {tsEl}
                  </div>
                );
              })}
              {selected.status === 'running' && <div style={{ color: '#8b949e', marginTop: 4 }}>▋</div>}
            </div>

            {/* Reply panel — shown when Claude asked a question and exited (pausedForInput) or run is resumable */}
            {selected.status === 'done' && selected.sessionId && (
              <div style={{
                padding: '10px 14px', flexShrink: 0,
                borderTop: selected.pausedForInput ? '2px solid #f0883e' : '1px solid #30363d',
                background: selected.pausedForInput ? '#1a1000' : '#0d1117',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#f0883e', fontWeight: 600 }}>
                    {selected.pausedForInput ? '⏸ Claude is waiting for your reply' : '↺ Continue conversation'}
                  </span>
                  <span style={{ fontSize: 10, color: '#484f58', flex: 1 }}>
                    {selected.pausedForInput ? 'Type your answer below to resume' : 'Send a follow-up to continue this session'}
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: '#8b949e' }}>
                    <input
                      type="checkbox"
                      checked={continueAllowPerms}
                      onChange={e => setContinueAllowPerms(e.target.checked)}
                      style={{ accentColor: '#1f6feb', cursor: 'pointer' }}
                    />
                    Allow all permissions
                  </label>
                </div>
                {/* Quick-reply options from last ask_user event */}
                {selected.pausedForInput && (() => {
                  const lastAsk = [...(selected.output || [])].reverse().find(l => l.type === 'ask_user');
                  return lastAsk?.options?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {lastAsk.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => { setContinueMsg(opt); }}
                          style={{
                            background: '#2d1a00', color: '#f0883e',
                            border: '1px solid #f0883e', borderRadius: 4,
                            padding: '3px 12px', fontSize: 11, cursor: 'pointer'
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    autoFocus={selected.pausedForInput}
                    value={continueMsg}
                    onChange={e => setContinueMsg(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && continueMsg.trim() && handleContinue()}
                    placeholder={selected.pausedForInput ? 'Type your answer…' : 'Type your follow-up…'}
                    style={{
                      flex: 1, color: '#e6edf3',
                      background: selected.pausedForInput ? '#0d1117' : '#0d1117',
                      border: `1px solid ${selected.pausedForInput ? '#f0883e' : '#30363d'}`,
                      borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit'
                    }}
                  />
                  <button
                    onClick={handleContinue}
                    disabled={!continueMsg.trim()}
                    style={{
                      background: continueMsg.trim() ? (selected.pausedForInput ? '#c05c00' : '#1f6feb') : '#21262d',
                      color: continueMsg.trim() ? '#fff' : '#484f58',
                      border: 'none', borderRadius: 6, padding: '6px 16px',
                      fontSize: 12, cursor: continueMsg.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap'
                    }}
                  >
                    {selected.pausedForInput ? '↩ Reply' : '↺ Continue'}
                  </button>
                </div>
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
