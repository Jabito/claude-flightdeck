const BASE = '/api';

export async function getFileTree() {
  const r = await fetch(`${BASE}/file-tree`);
  return r.json();
}

export async function getFile(filePath) {
  const r = await fetch(`${BASE}/file?path=${encodeURIComponent(filePath)}`);
  return r.json();
}

export async function saveFile(filePath, content) {
  const r = await fetch(`${BASE}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content })
  });
  return r.json();
}

export async function moveFile(from, to) {
  const r = await fetch(`${BASE}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to })
  });
  return r.json();
}

// Move multiple files at once into a destination folder
export async function moveFiles(paths, destFolder) {
  const moves = paths.map(from => {
    const name = from.split('/').pop();
    return { from, to: `${destFolder}/${name}` };
  });
  const r = await fetch(`${BASE}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moves })
  });
  return r.json();
}

export async function createFolder(dirPath) {
  const r = await fetch(`${BASE}/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath })
  });
  return r.json();
}

export async function deletePath(targetPath) {
  const r = await fetch(`${BASE}/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: targetPath })
  });
  return r.json();
}

export async function getRelationships() {
  const r = await fetch(`${BASE}/relationships`);
  return r.json();
}

export async function getProjects() {
  const r = await fetch(`${BASE}/projects`);
  return r.json();
}

export function runClaude(projectPath, prompt, onData) {
  return fetch(`${BASE}/run-claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, prompt })
  }).then(response => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    function pump() {
      return reader.read().then(({ done, value }) => {
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onData(data);
            } catch {}
          }
        });
        return pump();
      });
    }
    return pump();
  });
}
