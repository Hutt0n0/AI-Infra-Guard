// Monaco editor worker 入口 — IdeEditor.tsx 通过 new Worker(new URL(...)) 加载。
// 单独成文件解决 pnpm 符号链接下 Vite 无法解析 node_modules 内 worker 路径的问题。
// 注意子路径:monaco 0.56 exports map "./*" → "./esm/vs/*",目标文件是
// esm/vs/editor/editor.worker.js,所以写 monaco-editor/editor/editor.worker.js。
import 'monaco-editor/editor/editor.worker.js';
