import Editor from '@monaco-editor/react';

function langFromPath(filePath) {
  if (!filePath) return 'markdown';
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'javascript';
  if (filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) return 'yaml';
  if (filePath.endsWith('.md')) return 'markdown';
  return 'plaintext';
}

export default function FileEditor({ filePath, content, onChange }) {
  if (!filePath) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', color: '#484f58', gap: 10
      }}>
        <div style={{ fontSize: 36 }}>✎</div>
        <div style={{ fontSize: 14 }}>Select a file to edit</div>
        <div style={{ fontSize: 12 }}>Click a file in the explorer or a node in the graph</div>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      language={langFromPath(filePath)}
      value={content}
      onChange={onChange}
      theme="vs-dark"
      options={{
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'gutter',
        cursorBlinking: 'smooth',
        smoothScrolling: true,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
        fontLigatures: true,
        tabSize: 2,
        bracketPairColorization: { enabled: true }
      }}
    />
  );
}
