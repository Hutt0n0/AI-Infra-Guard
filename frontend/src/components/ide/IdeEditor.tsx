import React from 'react';
import Editor, { loader } from '@monaco-editor/react';
// 只引核心 API(不含各语言 contribution 的 worker 注册),Python 高亮是
// tokenizer 内置;避免把 ts/css/html/json 等无关语言 worker 打进构建。
// (exports map "./*" → "./esm/vs/*":editor/editor.api.js → esm/vs/editor/editor.api.js)
import * as monaco from 'monaco-editor/editor/editor.api.js';

// 本地 bundle(内网/离线部署不能依赖 CDN):@monaco-editor/react 默认从
// jsdelivr 加载,这里用 npm 版 monaco 覆盖。Python 高亮是 tokenizer 内置,
// 只需 editor worker(vite worker 构造器语法)。
let configured = false;
function ensureLocalMonaco() {
  if (configured) return;
  loader.config({ monaco });
  (self as any).MonacoEnvironment = {
    getWorker() {
      return new Worker(new URL('./monacoWorker.ts', import.meta.url), { type: 'module' });
    },
  };
  configured = true;
}
ensureLocalMonaco();

/** 平台 CSS 变量 → Monaco 主题(浅色) */
function definePlatformTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  monaco.editor.defineTheme('aig-platform', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: v('--plat-muted', '8a8f98'), fontStyle: 'italic' },
      { token: 'keyword', foreground: v('--brand', '5d5fef') },
      { token: 'string', foreground: '0a7d3f' },
      { token: 'number', foreground: 'b2580a' },
    ],
    colors: {
      'editor.background': v('--surface', '#ffffff'),
      'editor.foreground': v('--ink', '#1a1d26'),
      'editorLineNumber.foreground': v('--plat-muted', '8a8f98'),
      'editor.selectionBackground': '#5d5fef22',
      'editor.lineHighlightBackground': v('--plat-surface-low', '#f6f7fb'),
    },
  });
}

export const IdeEditor: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSaveShortcut?: () => void;
}> = ({ value, onChange, onSaveShortcut }) => {
  const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  return (
    <Editor
      language="python"
      theme="aig-platform"
      value={value}
      beforeMount={definePlatformTheme}
      onMount={(editor) => {
        editorRef.current = editor;
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          onSaveShortcut?.();
        });
      }}
      onChange={(v) => onChange(v ?? '')}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        automaticLayout: true,
        tabSize: 4,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line',
        padding: { top: 10 },
      }}
      loading={
        <div className="flex items-center justify-center h-full text-xs text-plat-muted">
          加载编辑器…
        </div>
      }
    />
  );
};

export default IdeEditor;
