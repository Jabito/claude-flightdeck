import { useState, useEffect } from 'react';
import { getProjects, getCommands, getSchedules, createSchedule, updateSchedule, deleteSchedule, runScheduleNow } from '../api.js';

const INTERVAL_PRESETS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '6h', value: 360 },
  { label: '12h', value: 720 },
  { label: '24h', value: 1440 },
];

const BLANK_FORM = {
  name: '', enabled: true, intervalMinutes: 60,
  command: '', args: '', freePrompt: '',
  projectPath: '', allowPermissions: true
};

function timeAgo(isoString) {
  if (!isoString) return 'never';
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function timeUntil(isoString) {
  if (!isoString) return '—';
  const ms = new Date(isoString).getTime() - Date.now();
  if (ms <= 0) return 'now';
  if (ms < 60000) return `in ${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `in ${Math.floor(ms / 60000)}m`;
  if (ms < 86400000) return `in ${Math.floor(ms / 3600000)}h`;
  return `in ${Math.floor(ms / 86400000)}d`;
}

function formatInterval(minutes) {
  if (minutes < 60) return `every ${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `every ${h}h ${m}m` : `every ${h}h`;
}

export default function ScheduleManager({ onViewRuns }) {
  const [schedules, setSchedules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [commands, setCommands] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const [, setTick] = useState(0);

  const load = () => getSchedules().then(setSchedules).catch(() => {});

  useEffect(() => {
    load();
    getProjects().then(setProjects).catch(() => {});
    getCommands().then(setCommands).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const openNew = () => { setForm(BLANK_FORM); setEditingId('new'); };
  const openEdit = (s) => { setForm({ ...BLANK_FORM, ...s }); setEditingId(s.id); };
  const closeForm = () => setEditingId(null);

  const setStatus = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 5000);
  };

  const handleSave = async () => {
    const prompt = form.command
      ? (form.args?.trim() ? `/${form.command} ${form.args.trim()}` : `/${form.command}`)
      : form.freePrompt?.trim();
    if (!form.name || !prompt || !form.projectPath) return;
    setSaving(true);
    try {
      if (editingId === 'new') await createSchedule(form);
      else await updateSchedule(editingId, form);
      await load();
      closeForm();
    } catch (e) {
      setStatus(`✗ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this schedule?')) return;
    await deleteSchedule(id);
    load();
  };

  const handleToggle = async (schedule) => {
    await updateSchedule(schedule.id, { ...schedule, enabled: !schedule.enabled });
    load();
  };

  const handleRunNow = async (schedule) => {
    setRunningId(schedule.id);
    setStatusMsg('');
    try {
      const result = await runScheduleNow(schedule.id);
      if (result.error) {
        setStatus(`✗ ${result.error}`);
      } else {
        setStatus('✓ Triggered');
        onViewRuns?.();
      }
    } catch (e) {
      setStatus(`✗ ${e.message}`);
    } finally {
      setRunningId(null);
    }
  };

  const commandsByDomain = commands.reduce((acc, cmd) => {
    (acc[cmd.domain] = acc[cmd.domain] || []).push(cmd);
    return acc;
  }, {});

  const effectivePrompt = form.command
    ? (form.args?.trim() ? `/${form.command} ${form.args.trim()}` : `/${form.command}`)
    : form.freePrompt?.trim();

  const canSave = !saving && !!form.name && !!effectivePrompt && !!form.projectPath;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3' }}>Scheduled Runs</div>
            <div style={{ fontSize: 11, color: '#484f58', marginTop: 2 }}>Run Claude on a recurring timer — daily summaries, periodic checks, and automated workflows.</div>
          </div>
          {statusMsg && (
            <span style={{
              fontSize: 11,
              color: statusMsg.startsWith('✓') ? '#3fb950' : '#f85149',
              background: statusMsg.startsWith('✓') ? '#0d2f1a' : '#2d1117',
              padding: '3px 10px', borderRadius: 4
            }}>
              {statusMsg}
            </span>
          )}
          {onViewRuns && (
            <button onClick={onViewRuns} style={btnStyle('#161b22', '#8b949e', '1px solid #30363d')}>
              ⚙ View Runs
            </button>
          )}
          <button onClick={openNew} style={btnStyle('#238636')}>+ New Schedule</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Form */}
          {editingId !== null && (
            <div style={{ background: '#161b22', border: '1px solid #1f6feb', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#79c0ff' }}>
                {editingId === 'new' ? 'New Schedule' : 'Edit Schedule'}
              </div>

              <Field label="Name">
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Daily PR review"
                />
              </Field>

              <Field label="Run Interval">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {INTERVAL_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setForm(f => ({ ...f, intervalMinutes: p.value }))}
                      style={{
                        padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid',
                        background: form.intervalMinutes === p.value ? '#1f4068' : '#0d1117',
                        color: form.intervalMinutes === p.value ? '#79c0ff' : '#8b949e',
                        borderColor: form.intervalMinutes === p.value ? '#1f6feb' : '#30363d'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  <input
                    type="number" min="1" max="10080"
                    value={form.intervalMinutes}
                    onChange={e => setForm(f => ({ ...f, intervalMinutes: parseInt(e.target.value) || 60 }))}
                    style={{ ...inputStyle, width: 64 }}
                    title="Custom interval in minutes"
                  />
                  <span style={{ fontSize: 10, color: '#484f58' }}>min</span>
                </div>
              </Field>

              <Field label="Command">
                <select
                  style={inputStyle}
                  value={form.command}
                  onChange={e => setForm(f => ({ ...f, command: e.target.value, args: '', freePrompt: '' }))}
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
              </Field>

              {form.command ? (
                <Field label="Arguments" hint="passed after the command">
                  <input
                    style={inputStyle}
                    value={form.args}
                    onChange={e => setForm(f => ({ ...f, args: e.target.value }))}
                    placeholder="e.g. PROJ-123 or leave empty"
                  />
                </Field>
              ) : (
                <Field label="Prompt">
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
                    value={form.freePrompt}
                    onChange={e => setForm(f => ({ ...f, freePrompt: e.target.value }))}
                    placeholder="Describe what Claude should do each run…"
                  />
                </Field>
              )}

              {effectivePrompt && (
                <div style={{ fontSize: 11, color: '#8b949e', background: '#0d1117', padding: '5px 8px', borderRadius: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {effectivePrompt}
                </div>
              )}

              <Field label="Project Path">
                <select style={inputStyle} value={form.projectPath} onChange={e => setForm(f => ({ ...f, projectPath: e.target.value }))}>
                  <option value="">Select project…</option>
                  {projects.map(p => (
                    <option key={p.path} value={p.path}>{p.hasClaudeMd ? '◈ ' : ''}{p.name}</option>
                  ))}
                </select>
                <input
                  style={{ ...inputStyle, marginTop: 4 }}
                  value={form.projectPath}
                  onChange={e => setForm(f => ({ ...f, projectPath: e.target.value }))}
                  placeholder="or enter path manually…"
                />
              </Field>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: '#8b949e' }}>
                <input
                  type="checkbox"
                  checked={form.allowPermissions}
                  onChange={e => setForm(f => ({ ...f, allowPermissions: e.target.checked }))}
                  style={{ accentColor: '#1f6feb' }}
                />
                Allow all permissions (--dangerously-skip-permissions)
              </label>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={handleSave} disabled={!canSave} style={btnStyle(canSave ? '#238636' : '#21262d')}>
                  {saving ? 'Saving…' : editingId === 'new' ? 'Create' : 'Save'}
                </button>
                <button onClick={closeForm} style={btnStyle('#21262d', '#8b949e')}>Cancel</button>
              </div>
            </div>
          )}

          {schedules.length === 0 && editingId === null && (
            <div style={{ color: '#484f58', fontSize: 12, paddingTop: 8 }}>
              No schedules configured. Click "+ New Schedule" to run Claude on a timer.
            </div>
          )}

          {schedules.map(schedule => {
            const prompt = buildDisplayPrompt(schedule);
            return (
              <div key={schedule.id} style={{
                background: '#161b22',
                border: `1px solid ${schedule.enabled ? '#30363d' : '#21262d'}`,
                borderRadius: 8, padding: 12,
                opacity: schedule.enabled ? 1 : 0.55
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', flex: 1 }}>{schedule.name}</span>
                  <span style={{ fontSize: 10, color: '#8b949e', background: '#0d1117', border: '1px solid #30363d', padding: '2px 7px', borderRadius: 10 }}>
                    {formatInterval(schedule.intervalMinutes)}
                  </span>
                  <button
                    onClick={() => handleToggle(schedule)}
                    style={{
                      ...btnStyle(schedule.enabled ? '#0d2f1a' : '#21262d', schedule.enabled ? '#3fb950' : '#484f58'),
                      padding: '2px 8px', fontSize: 10,
                      border: `1px solid ${schedule.enabled ? '#238636' : '#30363d'}`
                    }}
                  >
                    {schedule.enabled ? '● On' : '○ Off'}
                  </button>
                  <button onClick={() => openEdit(schedule)} style={{ ...btnStyle('#21262d'), padding: '2px 8px', fontSize: 10 }}>Edit</button>
                  <button onClick={() => handleDelete(schedule.id)} style={{ ...btnStyle('#21262d', '#f85149'), padding: '2px 8px', fontSize: 10 }}>Delete</button>
                </div>

                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#79c0ff', background: '#0d1117', padding: '4px 8px', borderRadius: 4, marginBottom: 6, wordBreak: 'break-all' }}>
                  {prompt}
                </div>

                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#8b949e', marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ color: '#484f58', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {schedule.projectPath?.split('/').pop()}
                  </span>
                  <span style={{ color: '#484f58' }}>last: {timeAgo(schedule.lastRun)}</span>
                  <span style={{ color: schedule.enabled ? '#8b949e' : '#484f58', marginLeft: 'auto' }}>
                    next: {schedule.enabled ? timeUntil(schedule.nextRun) : 'paused'}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid #21262d', paddingTop: 8 }}>
                  <button
                    onClick={() => handleRunNow(schedule)}
                    disabled={runningId === schedule.id}
                    style={{ ...btnStyle('#1f4068', '#79c0ff'), padding: '4px 12px', fontSize: 11, border: '1px solid #1f6feb' }}
                  >
                    {runningId === schedule.id ? 'Triggering…' : '▶ Run Now'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function buildDisplayPrompt(schedule) {
  if (schedule.command) {
    return schedule.args?.trim() ? `/${schedule.command} ${schedule.args.trim()}` : `/${schedule.command}`;
  }
  return schedule.freePrompt || '(no prompt)';
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>
        {label}{hint && <span style={{ color: '#484f58', marginLeft: 6 }}>— {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function btnStyle(bg, color = '#e6edf3', border = 'none') {
  return { background: bg, color, border, borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' };
}

const inputStyle = {
  width: '100%', background: '#0d1117', color: '#e6edf3',
  border: '1px solid #30363d', borderRadius: 6, padding: '7px 10px',
  fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
};
