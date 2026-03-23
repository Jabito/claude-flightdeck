const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const app = express();
const PORT = 3001;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');

const SKIP_DIRS = new Set([
  'cache', 'session-env', 'sessions', 'shell-snapshots', 'telemetry',
  'image-cache', 'paste-cache', 'debug', 'backups', 'downloads',
  'file-history', 'tasks', 'teams', 'plans', 'history.jsonl',
  'node_modules', '.git'
]);

app.use(express.json({ limit: '10mb' }));
app.use(require('cors')());

// ─── File tree ───────────────────────────────────────────────────────────────

function buildFileTree(dirPath, depth = 0) {
  if (depth > 6) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(e => !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(entry => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: fullPath,
            type: 'directory',
            children: buildFileTree(fullPath, depth + 1)
          };
        }
        return {
          name: entry.name,
          path: fullPath,
          type: 'file',
          ext: path.extname(entry.name)
        };
      });
  } catch {
    return [];
  }
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function getAllFiles(dir, exts = []) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        results.push(...getAllFiles(full, exts));
      } else if (exts.length === 0 || exts.includes(path.extname(e.name))) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

function getDirectories(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
      .map(e => path.join(dir, e.name));
  } catch {
    return [];
  }
}

// ─── Relationship parser ──────────────────────────────────────────────────────

// Known agent aliases (short name used in files → actual agent file basename)
const AGENT_ALIASES = {
  'cicd-engineer': 'game-cicd-engineer',
  'workflow-architect': 'workflow-architect'
};

function parseRelationships() {
  const nodes = [];
  const edges = [];
  const entityMap = new Map(); // name/alias -> node id
  const skillPathMap = new Map(); // 'domain/skill-name' -> node id  (for skills/domain/name/ path refs)
  const sourceFiles = []; // { id, path, type } to scan for references

  const agentsDir = path.join(CLAUDE_DIR, 'agents');
  const commandsDir = path.join(CLAUDE_DIR, 'commands');
  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');

  // ── Agents
  try {
    fs.readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .forEach(file => {
        const name = path.basename(file, '.md');
        const fullPath = path.join(agentsDir, file);
        const id = `agent:${name}`;
        nodes.push({ id, type: 'agent', label: name, path: fullPath });
        entityMap.set(name, id);
        sourceFiles.push({ id, path: fullPath, type: 'agent' });
      });

    // Register aliases → same node id
    Object.entries(AGENT_ALIASES).forEach(([alias, realName]) => {
      const realId = entityMap.get(realName);
      if (realId && !entityMap.has(alias)) entityMap.set(alias, realId);
    });
  } catch {}

  // ── Commands (commands/{domain}/{name}.md)
  try {
    const allCmdFiles = getAllFiles(commandsDir, ['.md']);
    allCmdFiles.forEach(filePath => {
      const name = path.basename(filePath, '.md');
      const domain = path.basename(path.dirname(filePath));
      const id = `command:${domain}:${name}`;
      nodes.push({ id, type: 'command', label: name, path: filePath, domain });
      if (!entityMap.has(name)) entityMap.set(name, id);
      entityMap.set(`${domain}/${name}`, id);
      sourceFiles.push({ id, path: filePath, type: 'command' });
    });
  } catch {}

  // ── Skills (skills/{domain}/{skill-name}/ or skills/{name}/)
  // Also handles plain .md files inside skill domain dirs
  try {
    const topDirs = getDirectories(skillsDir);
    topDirs.forEach(topDir => {
      const topName = path.basename(topDir);
      const subDirs = getDirectories(topDir);

      if (subDirs.length > 0) {
        subDirs.forEach(subDir => {
          const skillName = path.basename(subDir);
          const id = `skill:${topName}:${skillName}`;
          nodes.push({ id, type: 'skill', label: skillName, path: subDir, domain: topName });
          if (!entityMap.has(skillName)) entityMap.set(skillName, id);
          entityMap.set(`${topName}/${skillName}`, id);
          // Register path patterns: skills/domain/skill-name/
          skillPathMap.set(`${topName}/${skillName}`, id);
          skillPathMap.set(`skills/${topName}/${skillName}`, id);
        });
      }

      // Also handle .md files at top-level of domain dir (e.g. skills/bitbucket/http-api.md)
      try {
        fs.readdirSync(topDir)
          .filter(f => f.endsWith('.md'))
          .forEach(file => {
            const skillName = path.basename(file, '.md');
            const fullPath = path.join(topDir, file);
            const id = `skill:${topName}:${skillName}`;
            if (!nodes.find(n => n.id === id)) {
              nodes.push({ id, type: 'skill', label: skillName, path: fullPath, domain: topName });
              if (!entityMap.has(skillName)) entityMap.set(skillName, id);
              entityMap.set(`${topName}/${skillName}`, id);
              skillPathMap.set(`${topName}/${skillName}`, id);
              skillPathMap.set(`skills/${topName}/${skillName}`, id);
            }
          });
      } catch {}

      // Top-level skill dir with no subdirs AND no flat .md files (rare fallback)
      const hasFlatFiles = fs.readdirSync(topDir).some(f => f.endsWith('.md'));
      if (subDirs.length === 0 && !hasFlatFiles) {
        const id = `skill:${topName}`;
        if (!nodes.find(n => n.id === id)) {
          nodes.push({ id, type: 'skill', label: topName, path: topDir });
          if (!entityMap.has(topName)) entityMap.set(topName, id);
          skillPathMap.set(topName, id);
        }
      }
    });
  } catch {}

  // ── Hooks from settings.json
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.hooks) {
      Object.entries(settings.hooks).forEach(([event, hookList]) => {
        if (!Array.isArray(hookList)) return;
        hookList.forEach((hook, i) => {
          const id = `hook:${event}:${i}`;
          const cmd = hook.hooks?.[0]?.command || hook.command || '';
          nodes.push({ id, type: 'hook', label: event, path: settingsPath, command: cmd });
        });
      });
    }
  } catch {}

  // ── Parse references in agent and command files
  const edgeSet = new Set();

  sourceFiles.forEach(({ id: sourceId, path: filePath }) => {
    let content = '';
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return; }

    // 1. Explicit skills/domain/skill-name/ path references → uses edge
    const skillPathRefs = content.match(/skills\/[\w-]+\/[\w-]+\/?/g) || [];
    skillPathRefs.forEach(ref => {
      const key = ref.replace(/^skills\//, '').replace(/\/$/, ''); // domain/skill-name
      const targetId = skillPathMap.get(`skills/${key}`) || skillPathMap.get(key);
      if (targetId && targetId !== sourceId) addEdge(edges, edgeSet, sourceId, targetId, 'uses', false);
    });

    // 2. "Spawn `agent-name`" or "Spawn agent-name" patterns → spawns edge (animated)
    const spawnRefs = content.match(/[Ss]pawn\s+`?([a-z][\w-]+)`?/g) || [];
    spawnRefs.forEach(ref => {
      const name = ref.replace(/[Ss]pawn\s+`?/, '').replace(/`$/, '').trim();
      if (entityMap.has(name)) {
        const targetId = entityMap.get(name);
        if (targetId !== sourceId) addEdge(edges, edgeSet, sourceId, targetId, 'spawns', true);
      }
    });

    // 3. Backtick references to other agents (not already caught by spawn) → spawns edge
    const backtickRefs = content.match(/`([a-z][\w-]+-(?:director|agent|architect|engineer|designer|writer|builder|publisher|manager|frontend|backend|networking))`/g) || [];
    backtickRefs.forEach(match => {
      const name = match.slice(1, -1).trim();
      if (entityMap.has(name)) {
        const targetId = entityMap.get(name);
        if (targetId !== sourceId && targetId.startsWith('agent:')) {
          addEdge(edges, edgeSet, sourceId, targetId, 'spawns', true);
        }
      }
    });

    // 4. "Skills: name1, name2" inline list from command invocation blocks → uses edges
    const skillsInvoke = content.match(/Skills:\s+([^\n]+)/g) || [];
    skillsInvoke.forEach(line => {
      const names = line.replace(/Skills:\s+/, '').split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
      names.forEach(name => {
        if (entityMap.has(name)) {
          const targetId = entityMap.get(name);
          if (targetId !== sourceId && targetId.startsWith('skill:')) {
            addEdge(edges, edgeSet, sourceId, targetId, 'uses', false);
          }
        }
      });
    });

    // 5. Bare skill name references (short name only, require exact match in entityMap)
    //    Only match known skill names that don't conflict with common words
    entityMap.forEach((targetId, name) => {
      if (targetId === sourceId || name.length < 5) return;
      if (!targetId.startsWith('skill:')) return;
      // Already covered by path refs above? skip if so
      if (edgeSet.has(`${sourceId}-->${targetId}`)) return;
      // Require the name to appear in a relevant context (after colon, in backticks, after "load")
      const contextRegex = new RegExp(`(?:skills?:|Load|load|use|Use)\\s*[:\\s]*\`?\\b${name}\\b\`?`, 'i');
      if (contextRegex.test(content)) {
        addEdge(edges, edgeSet, sourceId, targetId, 'uses', false);
      }
    });
  });

  // ── External service nodes + edges ────────────────────────────────────────
  // Services derived from mcpServers in settings.json
  const SERVICE_DEFS = {
    jira:       { label: 'Jira',       icon: 'J', keywords: ['Jira REST API', 'jira REST API', 'list_jira_projects', 'read_jira_issue', 'create_jira_issue'] },
    confluence: { label: 'Confluence', icon: 'C', keywords: ['Confluence REST API', 'confluence REST API', 'read_confluence_page', 'create_confluence_page', 'update_confluence_page', 'Confluence API'] },
    bitbucket:  { label: 'Bitbucket', icon: 'B', keywords: ['mcp__bitbucket', 'Bitbucket MCP', 'bitbucket MCP', 'Bitbucket REST API', 'BITBUCKET_TOKEN', 'api.bitbucket.org'] },
    github:     { label: 'GitHub',    icon: 'G', keywords: ['mcp__github', 'GitHub MCP', 'github MCP'] }
  };

  // Which agent/command names map to which services (by name prefix + domain)
  const NAME_TO_SERVICES = {
    'jira-agent':           ['jira'],
    'jira-director':        ['jira', 'confluence'],  // jira-director reads Jira, sometimes fetches Confluence
    'confluence-publisher': ['confluence'],
    'confluence-content-writer': ['confluence'],
    'confluence-diagram-builder': ['confluence'],
    'confluence-director':  ['confluence'],
    'confluence-template-manager': ['confluence'],
    'bitbucket-agent':      ['bitbucket'],
    'bitbucket-director':   ['bitbucket']
  };

  // Command domain → service
  const DOMAIN_TO_SERVICES = {
    jira:       ['jira'],
    confluence: ['confluence'],
    bitbucket:  ['bitbucket']
  };

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const mcpServers = settings.mcpServers || {};
    const enabledServices = new Set();

    // Determine which services are configured (MCP or env-var based)
    const envVars = settings.env || {};
    if (mcpServers.atlassian || envVars.ATLASSIAN_API_TOKEN) { enabledServices.add('jira'); enabledServices.add('confluence'); }
    if (mcpServers.bitbucket || envVars.BITBUCKET_TOKEN) enabledServices.add('bitbucket');
    if (mcpServers.github || envVars.GITHUB_PERSONAL_ACCESS_TOKEN || envVars.GITHUB_TOKEN) enabledServices.add('github');

    // Create service nodes
    enabledServices.forEach(svcKey => {
      const def = SERVICE_DEFS[svcKey];
      const id = `service:${svcKey}`;
      nodes.push({ id, type: 'service', service: svcKey, label: def.label, icon: def.icon, path: settingsPath });
    });

    // Create edges: agents/commands → services they access
    const svcEdgeSet = new Set();

    sourceFiles.forEach(({ id: sourceId, path: filePath, type: srcType }) => {
      let content = '';
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { return; }

      const agentOrCmdName = path.basename(filePath, '.md');
      const domain = srcType === 'command' ? path.basename(path.dirname(filePath)) : null;

      enabledServices.forEach(svcKey => {
        const def = SERVICE_DEFS[svcKey];
        const svcId = `service:${svcKey}`;

        // 1. Name-based match
        const nameMatch = NAME_TO_SERVICES[agentOrCmdName]?.includes(svcKey);
        // 2. Domain-based match (commands)
        const domainMatch = domain && DOMAIN_TO_SERVICES[domain]?.includes(svcKey);
        // 3. Content keyword match
        const contentMatch = def.keywords.some(kw => content.includes(kw));

        if ((nameMatch || domainMatch || contentMatch) && !svcEdgeSet.has(`${sourceId}-->${svcId}`)) {
          svcEdgeSet.add(`${sourceId}-->${svcId}`);
          edges.push({ id: `${sourceId}-->${svcId}`, source: sourceId, target: svcId, label: 'accesses', type: 'smoothstep', animated: false });
        }
      });
    });
  } catch {}

  return { nodes, edges };
}

function addEdge(edges, edgeSet, source, target, label, animated = false) {
  const key = `${source}-->${target}`;
  if (!edgeSet.has(key)) {
    edgeSet.add(key);
    edges.push({ id: key, source, target, label, type: 'smoothstep', animated });
  }
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/file-tree', (_req, res) => {
  res.json(buildFileTree(CLAUDE_DIR));
});

app.get('/api/file', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath || !filePath.startsWith(os.homedir())) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.json({ type: 'directory', files: fs.readdirSync(filePath) });
    }
    const content = await fsp.readFile(filePath, 'utf8');
    res.json({ content, path: filePath });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.put('/api/file', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || !filePath.startsWith(os.homedir())) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    await fsp.writeFile(filePath, content, 'utf8');
    const relationships = parseRelationships();
    res.json({ success: true, relationships });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/move', async (req, res) => {
  try {
    // Supports batch: { moves: [{from, to}] } or single: { from, to }
    const moves = req.body.moves || [{ from: req.body.from, to: req.body.to }];
    for (const { from, to } of moves) {
      if (!from?.startsWith(os.homedir()) || !to?.startsWith(os.homedir())) {
        return res.status(400).json({ error: `Invalid path: ${from} → ${to}` });
      }
      await fsp.rename(from, to);
    }
    res.json({ success: true, tree: buildFileTree(CLAUDE_DIR), relationships: parseRelationships() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mkdir', async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath?.startsWith(os.homedir())) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    await fsp.mkdir(dirPath, { recursive: true });
    res.json({ success: true, tree: buildFileTree(CLAUDE_DIR) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/delete', async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    if (!targetPath?.startsWith(os.homedir())) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    // Safety: never delete the root claude dir itself
    if (targetPath === CLAUDE_DIR) {
      return res.status(400).json({ error: 'Cannot delete root claude directory' });
    }
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      await fsp.unlink(targetPath);
    }
    res.json({ success: true, tree: buildFileTree(CLAUDE_DIR), relationships: parseRelationships() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/relationships', (_req, res) => {
  try {
    res.json(parseRelationships());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Returns configured MCP services with metadata
app.get('/api/services', (_req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
    const mcpServers = settings.mcpServers || {};
    const services = [];

    if (mcpServers.atlassian) {
      const env = mcpServers.atlassian.env || {};
      services.push({ key: 'jira',       label: 'Jira',       baseUrl: env.ATLASSIAN_BASE_URL, email: env.ATLASSIAN_EMAIL });
      services.push({ key: 'confluence', label: 'Confluence', baseUrl: env.ATLASSIAN_BASE_URL, email: env.ATLASSIAN_EMAIL });
    }
    if (mcpServers.bitbucket) {
      const args = mcpServers.bitbucket.args || [];
      const wsIdx = args.indexOf('--default-workspace');
      services.push({ key: 'bitbucket', label: 'Bitbucket', workspace: wsIdx >= 0 ? args[wsIdx + 1] : 'unknown' });
    }
    if (mcpServers.github) {
      services.push({ key: 'github', label: 'GitHub' });
    }
    res.json(services);
  } catch (e) {
    res.json([]);
  }
});

// Lists Bitbucket repos from the configured workspace
app.get('/api/bitbucket-repos', async (_req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
    const bbConfig = settings.mcpServers?.bitbucket;
    if (!bbConfig) return res.json([]);

    const args = bbConfig.args || [];
    const tokenIdx = args.indexOf('--bitbucket-token');
    const wsIdx    = args.indexOf('--default-workspace');
    const token     = tokenIdx >= 0 ? args[tokenIdx + 1] : null;
    const workspace = wsIdx    >= 0 ? args[wsIdx    + 1] : 'maxicare';

    if (!token) return res.json({ error: 'No Bitbucket token configured' });

    const resp = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${workspace}?pagelen=50&sort=-updated_on`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );

    if (!resp.ok) return res.status(resp.status).json({ error: `Bitbucket API error: ${resp.status}` });

    const data = await resp.json();
    const repos = (data.values || []).map(r => ({
      name:      r.name,
      slug:      r.slug,
      workspace,
      fullName:  r.full_name,
      language:  r.language || '',
      isPrivate: r.is_private,
      cloneUrl:  r.links?.clone?.find(c => c.name === 'https')?.href || '',
      sshUrl:    r.links?.clone?.find(c => c.name === 'ssh')?.href   || '',
      webUrl:    r.links?.html?.href || '',
      updatedOn: r.updated_on,
      description: r.description || ''
    }));

    // Check if each repo is cloned locally in common locations
    const searchBases = [
      path.join(os.homedir(), 'Documents/Repos'),
      path.join(os.homedir(), 'Projects'),
      path.join(os.homedir(), 'code')
    ];
    repos.forEach(repo => {
      repo.localPath = null;
      for (const base of searchBases) {
        const candidate = path.join(base, repo.slug);
        if (fs.existsSync(candidate)) { repo.localPath = candidate; break; }
        const candidate2 = path.join(base, repo.name);
        if (fs.existsSync(candidate2)) { repo.localPath = candidate2; break; }
      }
    });

    res.json(repos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/projects', (_req, res) => {
  const searchBases = [
    path.join(os.homedir(), 'Documents/Repos'),
    path.join(os.homedir(), 'Projects'),
    path.join(os.homedir(), 'code'),
    path.join(os.homedir(), 'dev'),
    os.homedir()
  ];
  const projects = [];
  const seen = new Set();
  searchBases.forEach(base => {
    try {
      fs.readdirSync(base, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .forEach(e => {
          const p = path.join(base, e.name);
          if (!seen.has(p)) {
            seen.add(p);
            const hasClaudeMd = fs.existsSync(path.join(p, 'CLAUDE.md'));
            projects.push({ name: e.name, path: p, hasClaudeMd });
          }
        });
    } catch {}
  });
  res.json(projects);
});

app.get('/api/commands', (_req, res) => {
  const commandsDir = path.join(CLAUDE_DIR, 'commands');
  const commands = [];
  try {
    const domains = fs.readdirSync(commandsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name));
    domains.forEach(domain => {
      try {
        fs.readdirSync(path.join(commandsDir, domain.name))
          .filter(f => f.endsWith('.md'))
          .forEach(file => {
            const name = path.basename(file, '.md');
            commands.push({ id: `${domain.name}:${name}`, domain: domain.name, name });
          });
      } catch {}
    });
  } catch {}
  res.json(commands);
});

app.post('/api/run-claude', (req, res) => {
  const { projectPath, prompt, allowPermissions } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: 'start', message: `Running in ${projectPath}` });

  const args = ['-p', prompt];
  if (allowPermissions) args.push('--dangerously-skip-permissions');

  const proc = spawn('claude', args, {
    cwd: projectPath,
    env: { ...process.env }
  });

  proc.stdout.on('data', d => send({ type: 'output', message: d.toString() }));
  proc.stderr.on('data', d => send({ type: 'error', message: d.toString() }));
  proc.on('close', code => { send({ type: 'done', code }); res.end(); });
  proc.on('error', err => { send({ type: 'error', message: err.message }); res.end(); });
  req.on('close', () => proc.kill());
});

// Serve built client
app.use(express.static(path.join(__dirname, 'client/dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Claude Manager → http://localhost:${PORT}\n`);
});
