import { useState, useEffect, useCallback } from 'react';
import {
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  getWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, runWorkflowNow,
  getProjects, getCommands, runClaude,
} from '../api.js';

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  input: {
    background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
    color: '#e6edf3', fontSize: 12, padding: '5px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  textarea: {
    background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
    color: '#e6edf3', fontSize: 12, padding: '5px 9px', outline: 'none', width: '100%',
    resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  select: {
    background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
    color: '#e6edf3', fontSize: 12, padding: '5px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  label: { fontSize: 11, color: '#8b949e', marginBottom: 4, display: 'block' },
  btn: (bg = '#21262d', color = '#e6edf3', border = '#30363d') => ({
    background: bg, color, border: `1px solid ${border}`,
    borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  }),
  field: { marginBottom: 10 },
};

function Field({ label, children }) {
  return (
    <div style={S.field}>
      {label && <div style={S.label}>{label}</div>}
      {children}
    </div>
  );
}

function TokenHint({ tokens }) {
  return (
    <div style={{ fontSize: 10, color: '#484f58', marginTop: 4, lineHeight: 1.5 }}>
      Available tokens: {tokens.map(t => (
        <code key={t} style={{ background: '#161b22', borderRadius: 3, padding: '0 4px', marginRight: 4, color: '#79c0ff' }}>{t}</code>
      ))}
    </div>
  );
}

// ─── Template Form ────────────────────────────────────────────────────────────

const BLANK_TMPL = { name: '', description: '', command: '', args: '', freePrompt: '', projectPath: '', allowPermissions: true };

function TemplateForm({ initial, commands, projects, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...BLANK_TMPL, ...(initial || {}) });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const useCmd = !!form.command || !form.freePrompt;

  const dominated = commands.reduce((acc, c) => {
    const d = c.id.split(':')[0]; if (!acc[d]) acc[d] = []; acc[d].push(c); return acc;
  }, {});

  const canSave = form.name.trim() && form.projectPath && (form.command || form.freePrompt.trim());

  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <Field label="Name *">
        <input style={S.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Deploy to staging" />
      </Field>
      <Field label="Description">
        <input style={S.input} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description" />
      </Field>

      {/* Command or Free Prompt toggle */}
      <Field label="Prompt type">
        <div style={{ display: 'flex', gap: 4 }}>
          {[['command', 'Command'], ['free', 'Free prompt']].map(([k, lbl]) => (
            <button key={k}
              onClick={() => { if (k === 'command') set('freePrompt', ''); else set('command', ''); }}
              style={{ ...S.btn(useCmd === (k === 'command') ? '#1f4068' : '#21262d', useCmd === (k === 'command') ? '#79c0ff' : '#8b949e', useCmd === (k === 'command') ? '#1f6feb' : '#30363d'), fontSize: 11 }}>
              {lbl}
            </button>
          ))}
        </div>
      </Field>

      {useCmd ? (
        <>
          <Field label="Command">
            <select style={S.select} value={form.command} onChange={e => set('command', e.target.value)}>
              <option value="">— select command —</option>
              {Object.entries(dominated).map(([domain, cmds]) => (
                <optgroup key={domain} label={domain}>
                  {cmds.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Args">
            <input style={S.input} value={form.args} onChange={e => set('args', e.target.value)} placeholder="Optional args for the command" />
          </Field>
        </>
      ) : (
        <Field label="Prompt">
          <textarea style={{ ...S.textarea, minHeight: 72 }} value={form.freePrompt} onChange={e => set('freePrompt', e.target.value)} placeholder="Enter your prompt…" />
        </Field>
      )}

      <Field label="Project *">
        <select style={S.select} value={form.projectPath} onChange={e => set('projectPath', e.target.value)}>
          <option value="">— select project —</option>
          {projects.map(p => <option key={p.path} value={p.path}>{p.name}</option>)}
        </select>
      </Field>

      <Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.allowPermissions} onChange={e => set('allowPermissions', e.target.checked)} />
          <span style={{ fontSize: 11, color: '#8b949e' }}>Allow all permissions (--dangerously-skip-permissions)</span>
        </label>
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => onSave(form)} disabled={!canSave || saving} style={S.btn('#238636', '#fff', '#238636')}>
          {saving ? 'Saving…' : 'Save template'}
        </button>
        <button onClick={onCancel} style={S.btn()}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Workflow Step Editor ─────────────────────────────────────────────────────

function StepEditor({ steps, templates, onChange }) {
  const addStep = () => onChange([...steps, { stepId: `step-${Date.now()}`, label: '', templateId: '', argsOverride: '' }]);
  const removeStep = (i) => onChange(steps.filter((_, j) => j !== i));
  const setStep = (i, patch) => onChange(steps.map((s, j) => j === i ? { ...s, ...patch } : s));
  const moveUp = (i) => { if (i === 0) return; const a = [...steps]; [a[i-1], a[i]] = [a[i], a[i-1]]; onChange(a); };
  const moveDown = (i) => { if (i === steps.length - 1) return; const a = [...steps]; [a[i], a[i+1]] = [a[i+1], a[i]]; onChange(a); };

  return (
    <div>
      {steps.map((step, i) => (
        <div key={step.stepId} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: '#484f58', flexShrink: 0 }}>Step {i + 1}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => moveUp(i)} style={{ ...S.btn(), padding: '2px 7px' }} disabled={i === 0}>↑</button>
            <button onClick={() => moveDown(i)} style={{ ...S.btn(), padding: '2px 7px' }} disabled={i === steps.length - 1}>↓</button>
            <button onClick={() => removeStep(i)} style={{ ...S.btn('transparent', '#f85149', '#6e2828'), padding: '2px 7px' }}>✕</button>
          </div>
          <Field label="Step label">
            <input style={S.input} value={step.label} onChange={e => setStep(i, { label: e.target.value })} placeholder="e.g. Investigate" />
          </Field>
          <Field label="Template *">
            <select style={S.select} value={step.templateId} onChange={e => setStep(i, { templateId: e.target.value })}>
              <option value="">— select template —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Args override">
            <input style={S.input} value={step.argsOverride} onChange={e => setStep(i, { argsOverride: e.target.value })} placeholder="Leave blank to use template's args" />
            <TokenHint tokens={['{{prev.field}}', '{{input.arg0}}', '{{input.key=value}}']} />
          </Field>
        </div>
      ))}
      <button onClick={addStep} style={S.btn('#1f4068', '#79c0ff', '#1f6feb')}>+ Add step</button>
    </div>
  );
}

// ─── Workflow Form ────────────────────────────────────────────────────────────

const BLANK_WF = { name: '', description: '', steps: [] };

function WorkflowForm({ initial, templates, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...BLANK_WF, ...(initial ? { ...initial, steps: initial.steps ? [...initial.steps] : [] } : {}) });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSave = form.name.trim() && form.steps.length > 0 && form.steps.every(s => s.templateId);

  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <Field label="Name *">
        <input style={S.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Investigate + Fix" />
      </Field>
      <Field label="Description">
        <input style={S.input} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description" />
      </Field>
      <Field label={`Steps * (${form.steps.length})`}>
        <StepEditor steps={form.steps} templates={templates} onChange={s => set('steps', s)} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => onSave(form)} disabled={!canSave || saving} style={S.btn('#238636', '#fff', '#238636')}>
          {saving ? 'Saving…' : 'Save workflow'}
        </button>
        <button onClick={onCancel} style={S.btn()}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function promptPreview(t) {
  if (t.command) return `/${t.command}${t.args ? ' ' + t.args : ''}`;
  return t.freePrompt?.slice(0, 60) || '—';
}

function TemplatesTab({ commands, projects, onLoadTemplate, addRun, onRunStarted }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await getTemplates()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = (msg) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(''), 4000); };

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (editingId === 'new') await createTemplate(form);
      else await updateTemplate(editingId, form);
      await load();
      setEditingId(null);
    } catch (e) { setStatus(`✗ ${e.message}`); }
    setSaving(false);
  };

  const handleDelete = async (t) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await deleteTemplate(t.id);
    await load();
  };

  const handleRunDirect = async (t) => {
    if (!t.projectPath) return;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const prompt = t.command
      ? (t.args?.trim() ? `/${t.command} ${t.args.trim()}` : `/${t.command}`)
      : t.freePrompt;
    if (!prompt) return;
    setRunning(t.id);
    const run = {
      id: runId, label: t.name,
      command: t.command, args: t.args, prompt,
      projectPath: t.projectPath,
      projectName: t.projectPath.split('/').pop(),
      allowPermissions: t.allowPermissions,
      status: 'running', output: [],
      startTime: new Date().toISOString(), endTime: null, exitCode: null,
    };
    addRun(run);
    onRunStarted?.();
    runClaude(t.projectPath, prompt, t.allowPermissions, runId, () => {});
    setRunning(null);
  };

  const editingTemplate = editingId && editingId !== 'new' ? templates.find(t => t.id === editingId) : null;

  return (
    <div>
      {statusMsg && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12, background: '#2d0f0f', color: '#f85149', border: '1px solid #6e2828' }}>
          {statusMsg}
        </div>
      )}

      {editingId && (
        <TemplateForm
          initial={editingTemplate}
          commands={commands} projects={projects}
          onSave={handleSave} onCancel={() => setEditingId(null)} saving={saving}
        />
      )}

      {!editingId && (
        <button onClick={() => setEditingId('new')} style={{ ...S.btn('#1f4068', '#79c0ff', '#1f6feb'), marginBottom: 14 }}>
          + New template
        </button>
      )}

      {loading ? (
        <div style={{ color: '#8b949e', fontSize: 12 }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div style={{ color: '#484f58', fontSize: 12, fontStyle: 'italic' }}>No templates yet. Create one to get started.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 2 }}>{t.name}</div>
                  {t.description && <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>{t.description}</div>}
                  <code style={{ fontSize: 11, color: '#56d364', background: '#071d12', border: '1px solid #2ea04333', borderRadius: 4, padding: '2px 7px', display: 'inline-block' }}>
                    {promptPreview(t)}
                  </code>
                  {t.projectPath && (
                    <span style={{ fontSize: 10, color: '#484f58', marginLeft: 8 }}>
                      {t.projectPath.split('/').pop()}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => onLoadTemplate(t)} style={S.btn('#1f4068', '#79c0ff', '#1f6feb')}>Load</button>
                  <button onClick={() => handleRunDirect(t)} disabled={running === t.id} style={S.btn('#1a3a1a', '#3fb950', '#238636')}>
                    {running === t.id ? '…' : '▶ Run'}
                  </button>
                  <button onClick={() => setEditingId(t.id)} style={S.btn()}>Edit</button>
                  <button onClick={() => handleDelete(t)} style={S.btn('transparent', '#f85149', '#6e2828')}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Workflows Tab ────────────────────────────────────────────────────────────

function WorkflowsTab({ onViewRuns }) {
  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [initialArgs, setInitialArgs] = useState('');
  const [showArgsFor, setShowArgsFor] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wfs, tmpls] = await Promise.all([getWorkflows(), getTemplates()]);
      setWorkflows(wfs);
      setTemplates(tmpls);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = (msg) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(''), 4000); };

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (editingId === 'new') await createWorkflow(form);
      else await updateWorkflow(editingId, form);
      await load();
      setEditingId(null);
    } catch (e) { setStatus(`✗ ${e.message}`); }
    setSaving(false);
  };

  const handleDelete = async (wf) => {
    if (!confirm(`Delete workflow "${wf.name}"?`)) return;
    await deleteWorkflow(wf.id);
    await load();
  };

  const handleRun = async (wf) => {
    setRunningId(wf.id);
    try {
      await runWorkflowNow(wf.id, initialArgs);
      setShowArgsFor(null);
      setInitialArgs('');
      onViewRuns?.();
      setStatus(`✓ Workflow "${wf.name}" started`);
    } catch (e) { setStatus(`✗ ${e.message}`); }
    setRunningId(null);
  };

  const editingWorkflow = editingId && editingId !== 'new' ? workflows.find(w => w.id === editingId) : null;

  const getTemplateName = (id) => templates.find(t => t.id === id)?.name || id;

  return (
    <div>
      {statusMsg && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12,
          background: statusMsg.startsWith('✓') ? '#0d2f1a' : '#2d0f0f',
          color: statusMsg.startsWith('✓') ? '#3fb950' : '#f85149',
          border: `1px solid ${statusMsg.startsWith('✓') ? '#1b4f2a' : '#6e2828'}` }}>
          {statusMsg}
        </div>
      )}

      {editingId && (
        <WorkflowForm
          initial={editingWorkflow}
          templates={templates}
          onSave={handleSave} onCancel={() => setEditingId(null)} saving={saving}
        />
      )}

      {!editingId && (
        <button onClick={() => setEditingId('new')} style={{ ...S.btn('#1f4068', '#79c0ff', '#1f6feb'), marginBottom: 14 }}>
          + New workflow
        </button>
      )}

      {loading ? (
        <div style={{ color: '#8b949e', fontSize: 12 }}>Loading…</div>
      ) : workflows.length === 0 ? (
        <div style={{ color: '#484f58', fontSize: 12, fontStyle: 'italic' }}>No workflows yet. Build one by connecting templates.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workflows.map(wf => (
            <div key={wf.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 2 }}>{wf.name}</div>
                  {wf.description && <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>{wf.description}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(wf.steps || []).map((step, i) => (
                      <span key={step.stepId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                        {i > 0 && <span style={{ color: '#484f58' }}>→</span>}
                        <span style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 4, padding: '2px 7px', color: '#8b949e' }}>
                          {step.label || getTemplateName(step.templateId)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {showArgsFor === wf.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        style={{ ...S.input, width: 160 }}
                        value={initialArgs}
                        onChange={e => setInitialArgs(e.target.value)}
                        placeholder="Initial args (optional)"
                        onKeyDown={e => e.key === 'Enter' && handleRun(wf)}
                        autoFocus
                      />
                      <button onClick={() => handleRun(wf)} disabled={runningId === wf.id} style={S.btn('#1a3a1a', '#3fb950', '#238636')}>
                        {runningId === wf.id ? '…' : '▶'}
                      </button>
                      <button onClick={() => { setShowArgsFor(null); setInitialArgs(''); }} style={S.btn()}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowArgsFor(wf.id)} style={S.btn('#1a3a1a', '#3fb950', '#238636')}>▶ Run</button>
                  )}
                  <button onClick={() => setEditingId(wf.id)} style={S.btn()}>Edit</button>
                  <button onClick={() => handleDelete(wf)} style={S.btn('transparent', '#f85149', '#6e2828')}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ScriptsManager ──────────────────────────────────────────────────────

export default function ScriptsManager({ onLoadTemplate, addRun, updateRun, appendRunOutput, onRunStarted, onViewRuns }) {
  const [tab, setTab] = useState('templates');
  const [commands, setCommands] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
    getCommands().then(setCommands).catch(() => {});
  }, []);

  const TAB_BTN = (key, label) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      style={{
        background: tab === key ? '#1f4068' : 'transparent',
        color: tab === key ? '#79c0ff' : '#8b949e',
        border: 'none', padding: '5px 14px', fontSize: 12, cursor: 'pointer',
        borderBottom: `2px solid ${tab === key ? '#1f6feb' : 'transparent'}`,
      }}
    >{label}</button>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
        {TAB_BTN('templates', '⊞ Templates')}
        {TAB_BTN('workflows', '⇉ Workflows')}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'templates' && (
          <TemplatesTab
            commands={commands} projects={projects}
            onLoadTemplate={onLoadTemplate}
            addRun={addRun} onRunStarted={onRunStarted}
          />
        )}
        {tab === 'workflows' && (
          <WorkflowsTab onViewRuns={onViewRuns} />
        )}
      </div>
    </div>
  );
}
