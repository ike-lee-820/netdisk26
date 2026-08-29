// 绑定多个 KV：FILE_INDEX, DATA_KV_0 ~ DATA_KV_4, TASK_KV
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---------- 辅助函数 ----------
    function getDataKV(key, env) {
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
      }
      const idx = Math.abs(hash) % 5;
      return env['DATA_KV_' + idx];
    }

    async function getMeta(key, env) {
      const raw = await env.FILE_INDEX.get(key);
      return raw ? JSON.parse(raw) : null;
    }

    async function putMeta(key, meta, env) {
      await env.FILE_INDEX.put(key, JSON.stringify(meta));
    }

    async function deleteMeta(key, env) {
      await env.FILE_INDEX.delete(key);
    }

    async function listDir(dirPath, env) {
      dirPath = dirPath || '/';
      if (dirPath !== '/' && !dirPath.endsWith('/')) dirPath += '/';
      const prefix = dirPath;
      const list = await env.FILE_INDEX.list({ prefix });
      const items = [];
      for (const kv of list.keys) {
        const key = kv.name;
        const relative = key.slice(prefix.length);
        if (relative.includes('/')) continue;
        const meta = await getMeta(key, env);
        if (meta) {
          items.push({
            name: relative,
            isDir: meta.isDir || false,
            size: meta.size || 0,
            uploadedAt: meta.uploadedAt,
          });
        }
      }
      items.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return items;
    }

    // ---------- API 路由 ----------
    if (path === '/api/list' && request.method === 'GET') {
      const dir = url.searchParams.get('path') || '/';
      const items = await listDir(dir, env);
      return new Response(JSON.stringify({ items }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 新建文件夹
    if (path === '/api/mkdir' && request.method === 'POST') {
      const { path: dirPath, name } = await request.json();
      const fullPath = dirPath === '/' ? '/' + name : dirPath + '/' + name;
      const existing = await getMeta(fullPath, env);
      if (existing) return new Response('已存在', { status: 400 });
      await putMeta(fullPath, { isDir: true, createdAt: new Date().toISOString() }, env);
      return new Response('OK');
    }

    // 新建空白文件
    if (path === '/api/create_file' && request.method === 'POST') {
      const { path: dirPath, name } = await request.json();
      const fullPath = dirPath === '/' ? '/' + name : dirPath + '/' + name;
      const existing = await getMeta(fullPath, env);
      if (existing) return new Response('已存在', { status: 400 });
      // 生成一个空文件（0字节）
      const mainKey = crypto.randomUUID();
      const dataKV = getDataKV(mainKey, env);
      // 空内容
      await dataKV.put(mainKey, JSON.stringify({ content: '' }));
      const meta = {
        filename: name,
        path: fullPath,
        contentType: 'text/plain',
        size: 0,
        uploadedAt: new Date().toISOString(),
        kvIndex: parseInt(dataKV.bindingName.slice(-1)),
        dataKey: mainKey,
        isDir: false,
      };
      await putMeta(fullPath, meta, env);
      return new Response('OK');
    }

    // 重命名（支持文件和目录）
    if (path === '/api/rename' && request.method === 'POST') {
      const { oldPath, newName } = await request.json();
      const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
      const newPath = dir + newName;
      const meta = await getMeta(oldPath, env);
      if (!meta) return new Response('不存在', { status: 404 });
      // 如果是目录，需要递归移动所有子项（较复杂，暂不支持），这里只允许文件重命名
      if (meta.isDir) {
        // 简单处理：只移动目录元数据，子项不移动，会有问题，所以提示不支持
        return new Response('暂不支持目录重命名', { status: 400 });
      }
      await putMeta(newPath, meta, env);
      await deleteMeta(oldPath, env);
      return new Response('OK');
    }

    // 删除（支持文件和目录）
    if (path === '/api/delete' && request.method === 'POST') {
      const { path: targetPath } = await request.json();
      const meta = await getMeta(targetPath, env);
      if (!meta) return new Response('不存在', { status: 404 });
      if (meta.isDir) {
        // 删除目录：需递归删除所有子项（较复杂），暂不支持
        return new Response('暂不支持删除目录（请先清空）', { status: 400 });
      }
      // 删除文件：删除元数据和数据KV中的内容
      const dataKV = getDataKV(meta.dataKey, env);
      if (meta.type === 'multipart') {
        for (const partKey of meta.partKeys) {
          await dataKV.delete(partKey);
        }
      } else {
        await dataKV.delete(meta.dataKey);
      }
      await deleteMeta(targetPath, env);
      return new Response('OK');
    }

    // 上传文件
    if (path === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const targetPath = formData.get('path') || '/';
        if (!file) return new Response('未选择文件', { status: 400 });

        const fullPath = targetPath === '/' ? '/' + file.name : targetPath + '/' + file.name;
        const existing = await getMeta(fullPath, env);
        if (existing) return new Response('文件已存在', { status: 409 });

        const mainKey = crypto.randomUUID();
        const dataKV = getDataKV(mainKey, env);
        const CHUNK_SIZE = 10 * 1024 * 1024;
        const fileSize = file.size;
        let meta = {
          filename: file.name,
          path: fullPath,
          contentType: file.type || 'application/octet-stream',
          size: fileSize,
          uploadedAt: new Date().toISOString(),
          kvIndex: parseInt(dataKV.bindingName.slice(-1)),
          dataKey: mainKey,
          isDir: false,
        };

        if (fileSize > 20 * 1024 * 1024) {
          const chunks = Math.ceil(fileSize / CHUNK_SIZE);
          const partKeys = [];
          for (let i = 0; i < chunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileSize);
            const chunkBuffer = await file.slice(start, end).arrayBuffer();
            const bytes = new Uint8Array(chunkBuffer);
            const base64 = btoa(new TextDecoder('latin1').decode(bytes));
            const partKey = mainKey + '_part_' + i;
            await dataKV.put(partKey, JSON.stringify({ content: base64 }));
            partKeys.push(partKey);
          }
          meta.type = 'multipart';
          meta.chunks = chunks;
          meta.partKeys = partKeys;
        } else {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const base64 = btoa(new TextDecoder('latin1').decode(bytes));
          await dataKV.put(mainKey, JSON.stringify({ content: base64 }));
        }

        await putMeta(fullPath, meta, env);
        return new Response('OK');
      } catch (err) {
        return new Response('上传失败：' + err.message, { status: 500 });
      }
    }

    // 离线下载
    if (path === '/api/offline' && request.method === 'POST') {
      const { url: downloadUrl, targetPath } = await request.json();
      if (!downloadUrl) return new Response('缺少URL', { status: 400 });
      const taskId = crypto.randomUUID();
      const taskMeta = {
        type: 'download',
        url: downloadUrl,
        targetPath: targetPath || '/',
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      await env.TASK_KV.put(taskId, JSON.stringify(taskMeta));

      ctx.waitUntil((async () => {
        try {
          taskMeta.status = 'running';
          await env.TASK_KV.put(taskId, JSON.stringify(taskMeta));
          const resp = await fetch(downloadUrl);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const contentLength = parseInt(resp.headers.get('content-length')) || 0;
          const reader = resp.body.getReader();
          const CHUNK_SIZE = 10 * 1024 * 1024;
          let buffer = new Uint8Array(0);
          let partIndex = 0;
          const mainKey = crypto.randomUUID();
          const dataKV = getDataKV(mainKey, env);
          const partKeys = [];
          let downloaded = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;
            downloaded += value.length;
            if (contentLength > 0) {
              taskMeta.progress = Math.round((downloaded / contentLength) * 100);
              await env.TASK_KV.put(taskId, JSON.stringify(taskMeta));
            }
            while (buffer.length >= CHUNK_SIZE) {
              const chunk = buffer.slice(0, CHUNK_SIZE);
              buffer = buffer.slice(CHUNK_SIZE);
              const base64 = btoa(new TextDecoder('latin1').decode(chunk));
              const partKey = mainKey + '_part_' + partIndex;
              await dataKV.put(partKey, JSON.stringify({ content: base64 }));
              partKeys.push(partKey);
              partIndex++;
            }
          }
          if (buffer.length > 0) {
            const base64 = btoa(new TextDecoder('latin1').decode(buffer));
            const partKey = mainKey + '_part_' + partIndex;
            await dataKV.put(partKey, JSON.stringify({ content: base64 }));
            partKeys.push(partKey);
          }

          const filename = downloadUrl.split('/').pop() || 'downloaded';
          const fullPath = targetPath === '/' ? '/' + filename : targetPath + '/' + filename;
          const meta = {
            filename,
            path: fullPath,
            contentType: resp.headers.get('content-type') || 'application/octet-stream',
            size: downloaded,
            uploadedAt: new Date().toISOString(),
            kvIndex: parseInt(dataKV.bindingName.slice(-1)),
            dataKey: mainKey,
            isDir: false,
            type: 'multipart',
            chunks: partKeys.length,
            partKeys: partKeys,
          };
          await putMeta(fullPath, meta, env);
          taskMeta.status = 'completed';
          taskMeta.progress = 100;
          await env.TASK_KV.put(taskId, JSON.stringify(taskMeta));
        } catch (err) {
          taskMeta.status = 'failed';
          taskMeta.error = err.message;
          await env.TASK_KV.put(taskId, JSON.stringify(taskMeta));
        }
      })());

      return new Response(JSON.stringify({ taskId }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/api/tasks' && request.method === 'GET') {
      const list = await env.TASK_KV.list();
      const tasks = [];
      for (const kv of list.keys) {
        const raw = await env.TASK_KV.get(kv.name);
        if (raw) tasks.push(JSON.parse(raw));
      }
      tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return new Response(JSON.stringify({ tasks }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ---------- 文件下载 ----------
    if (path.startsWith('/file/')) {
      const filePath = path.slice(6);
      const meta = await getMeta(filePath, env);
      if (!meta) return new Response('文件不存在', { status: 404 });
      if (meta.isDir) return new Response('这是一个目录', { status: 400 });
      const dataKV = getDataKV(meta.dataKey, env);

      if (meta.type === 'multipart') {
        const { partKeys, contentType, filename, size } = meta;
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for (const partKey of partKeys) {
                const partRaw = await dataKV.get(partKey);
                if (!partRaw) throw new Error('Missing part: ' + partKey);
                const partData = JSON.parse(partRaw);
                const bytes = Uint8Array.from(atob(partData.content), c => c.charCodeAt(0));
                controller.enqueue(bytes);
              }
              controller.close();
            } catch (err) { controller.error(err); }
          }
        });
        return new Response(stream, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': 'inline; filename="' + encodeURIComponent(filename) + '"',
            'Content-Length': size,
          },
        });
      } else {
        const dataRaw = await dataKV.get(meta.dataKey);
        if (!dataRaw) return new Response('内容丢失', { status: 404 });
        const data = JSON.parse(dataRaw);
        const bytes = Uint8Array.from(atob(data.content), c => c.charCodeAt(0));
        return new Response(bytes, {
          headers: {
            'Content-Type': meta.contentType,
            'Content-Disposition': 'inline; filename="' + encodeURIComponent(meta.filename) + '"',
          },
        });
      }
    }

    // ---------- 主页 ----------
    if (path === '/') {
      return new Response(indexHtml, {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

// ---------- 移动友好的全新界面 ----------
const indexHtml = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>云盘</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f0f4f8;
      padding: 16px;
      min-height: 100vh;
      display: flex;
      justify-content: center;
    }
    .app {
      max-width: 800px;
      width: 100%;
    }
    .card {
      background: #ffffff;
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.08);
      margin-bottom: 20px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 18px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: #1e293b;
    }
    .header-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: 0.2s;
      background: #f1f5f9;
      color: #1e293b;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn:active { transform: scale(0.96); }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-success { background: #22c55e; color: white; }
    .btn-success:hover { background: #16a34a; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-outline { background: transparent; border: 1px solid #cbd5e1; }
    .btn-sm { padding: 4px 10px; font-size: 12px; border-radius: 8px; }

    .breadcrumb {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      font-size: 14px;
      color: #64748b;
      margin-bottom: 16px;
      padding: 8px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .breadcrumb span { cursor: pointer; }
    .breadcrumb span:hover { color: #3b82f6; text-decoration: underline; }

    .file-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: #f8fafc;
      border-radius: 12px;
      transition: 0.15s;
      flex-wrap: wrap;
      gap: 8px;
    }
    .file-item:hover { background: #f1f5f9; }
    .file-info {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }
    .file-info .icon { font-size: 20px; }
    .file-info .name {
      font-weight: 500;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-info .meta {
      font-size: 12px;
      color: #94a3b8;
      margin-left: auto;
      white-space: nowrap;
    }
    .file-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .empty-state {
      text-align: center;
      color: #94a3b8;
      padding: 40px 0;
    }
    .empty-state .icon { font-size: 48px; margin-bottom: 12px; }

    .task-panel {
      margin-top: 16px;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      display: none;
    }
    .task-panel.open { display: block; }
    .task-item {
      background: #f8fafc;
      padding: 10px 14px;
      border-radius: 10px;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .progress-bar {
      width: 80px;
      height: 6px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
      display: inline-block;
    }
    .progress-bar .fill {
      height: 100%;
      background: #3b82f6;
      width: 0%;
    }

    /* 模态框 */
    .modal {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15,23,42,0.5);
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 999;
    }
    .modal.open { display: flex; }
    .modal-content {
      background: white;
      border-radius: 20px;
      padding: 28px 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .modal-content h2 { font-size: 20px; margin-bottom: 16px; }
    .modal-content input, .modal-content select {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      font-size: 16px;
      margin-bottom: 12px;
      background: #f8fafc;
    }
    .modal-content .btn-group {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    @media (min-width: 600px) {
      .file-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 480px) {
      .header h1 { font-size: 20px; }
      .file-item { flex-direction: column; align-items: stretch; }
      .file-actions { justify-content: flex-end; }
      .btn { padding: 6px 12px; font-size: 13px; }
    }
  </style>
</head>
<body>
<div class="app">
  <div class="card">
    <div class="header">
      <h1>📁 云盘</h1>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="showModal('upload')">+ 上传</button>
        <button class="btn btn-success" onclick="showModal('newfile')">📄 新建</button>
        <button class="btn btn-outline" onclick="toggleTasks()">📋 任务</button>
      </div>
    </div>

    <div class="breadcrumb" id="breadcrumb"></div>

    <div class="file-grid" id="fileList"></div>
  </div>

  <div class="card" id="taskPanel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="font-weight:500;">任务列表</h3>
      <span style="font-size:12px;color:#94a3b8;">自动刷新</span>
    </div>
    <div id="taskList"></div>
  </div>
</div>

<!-- 上传模态框 -->
<div class="modal" id="uploadModal">
  <div class="modal-content">
    <h2>上传文件/文件夹</h2>
    <p style="font-size:14px;color:#64748b;margin-bottom:8px;">目标路径：<span id="uploadPathDisplay">/</span></p>
    <input type="file" id="fileInput" multiple webkitdirectory>
    <div class="btn-group">
      <button class="btn btn-primary" onclick="doUpload()">开始上传</button>
      <button class="btn btn-outline" onclick="closeModal('uploadModal')">取消</button>
    </div>
  </div>
</div>

<!-- 新建文件模态框 -->
<div class="modal" id="newFileModal">
  <div class="modal-content">
    <h2>新建空白文件</h2>
    <p style="font-size:14px;color:#64748b;margin-bottom:8px;">在 <span id="newFilePathDisplay">/</span> 下创建</p>
    <input type="text" id="newFileName" placeholder="文件名（如 readme.txt）" value="新文件.txt">
    <div class="btn-group">
      <button class="btn btn-success" onclick="doCreateFile()">创建</button>
      <button class="btn btn-outline" onclick="closeModal('newFileModal')">取消</button>
    </div>
  </div>
</div>

<script>
let currentPath = '/';
let fileItems = [];

// ===== 初始化 =====
window.onload = function() {
  refresh();
  refreshTasks();
  setInterval(refresh, 5000);
  setInterval(refreshTasks, 3000);
};

// ===== 文件列表 =====
async function refresh() {
  try {
    const resp = await fetch('/api/list?path=' + encodeURIComponent(currentPath));
    const data = await resp.json();
    fileItems = data.items || [];
    renderBreadcrumb();
    renderList();
  } catch(e) { console.error(e); }
}

function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  const parts = currentPath.split('/').filter(p => p);
  let html = '<span onclick="navigateTo(\'/\')">🏠 根目录</span>';
  let acc = '';
  for (let p of parts) {
    acc += '/' + p;
    html += ' <span>›</span> <span onclick="navigateTo(\'' + acc + '\')">' + p + '</span>';
  }
  el.innerHTML = html;
}

function navigateTo(path) {
  currentPath = path;
  refresh();
}

function renderList() {
  const container = document.getElementById('fileList');
  if (fileItems.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📂</div><p>此目录为空</p></div>';
    return;
  }
  let html = '';
  for (let item of fileItems) {
    const icon = item.isDir ? '📁' : '📄';
    const size = item.isDir ? '' : (item.size / 1024).toFixed(1) + ' KB';
    const date = item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '';
    const actions = item.isDir ?
      `<button class="btn btn-sm btn-outline" onclick="navigateTo('${currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name}')">打开</button>` :
      `<a href="/file${currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name}" target="_blank" class="btn btn-sm btn-primary">下载</a>`;
    const fullPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
    html += `
      <div class="file-item">
        <div class="file-info">
          <span class="icon">${icon}</span>
          <span class="name" onclick="${item.isDir ? 'navigateTo(\'' + fullPath + '\')' : ''}">${item.name}</span>
          <span class="meta">${size} ${date}</span>
        </div>
        <div class="file-actions">
          ${actions}
          <button class="btn btn-sm btn-outline" onclick="renameItem('${fullPath}')">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteItem('${fullPath}')">🗑️</button>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

// ===== 新建文件夹 =====
async function mkdir() {
  const name = prompt('请输入新文件夹名称');
  if (!name) return;
  const resp = await fetch('/api/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: currentPath, name })
  });
  if (resp.ok) refresh();
  else alert('创建失败');
}

// 直接暴露到全局（用于按钮）
window.mkdir = mkdir;

// ===== 新建文件 =====
function showModal(type) {
  if (type === 'upload') {
    document.getElementById('uploadPathDisplay').textContent = currentPath;
    document.getElementById('uploadModal').classList.add('open');
  } else if (type === 'newfile') {
    document.getElementById('newFilePathDisplay').textContent = currentPath;
    document.getElementById('newFileModal').classList.add('open');
  }
}

async function doCreateFile() {
  const name = document.getElementById('newFileName').value.trim();
  if (!name) return alert('请输入文件名');
  const resp = await fetch('/api/create_file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: currentPath, name })
  });
  if (resp.ok) {
    closeModal('newFileModal');
    refresh();
  } else {
    alert('创建失败：' + (await resp.text()));
  }
}

// ===== 上传 =====
async function doUpload() {
  const input = document.getElementById('fileInput');
  const files = input.files;
  if (files.length === 0) return alert('请选择文件');
  const path = currentPath;
  for (let file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('path', path);
    await fetch('/api/upload', { method: 'POST', body: fd });
  }
  closeModal('uploadModal');
  refresh();
}

// ===== 重命名 =====
function renameItem(fullPath) {
  const newName = prompt('请输入新名称', fullPath.split('/').pop());
  if (!newName) return;
  fetch('/api/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath: fullPath, newName })
  }).then(r => r.ok ? refresh() : alert('重命名失败'));
}

// ===== 删除 =====
function deleteItem(fullPath) {
  if (!confirm('确定要删除 "' + fullPath + '" 吗？')) return;
  fetch('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: fullPath })
  }).then(r => r.ok ? refresh() : alert('删除失败'));
}

// ===== 任务面板 =====
function toggleTasks() {
  const panel = document.getElementById('taskPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) refreshTasks();
}

async function refreshTasks() {
  try {
    const resp = await fetch('/api/tasks');
    const data = await resp.json();
    const list = document.getElementById('taskList');
    if (!data.tasks || data.tasks.length === 0) {
      list.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:12px;">暂无任务</div>';
      return;
    }
    let html = '';
    for (let t of data.tasks) {
      const statusMap = { 'pending': '⏸️ 等待', 'running': '⏳ 运行中', 'completed': '✅ 完成', 'failed': '❌ 失败' };
      const statusText = statusMap[t.status] || t.status;
      const progress = t.progress || 0;
      html += `
        <div class="task-item">
          <span>${t.url || '任务'} (${progress}%)</span>
          <span>
            <span class="progress-bar"><span class="fill" style="width:${progress}%"></span></span>
            ${statusText}
          </span>
        </div>
      `;
    }
    list.innerHTML = html;
  } catch(e) { console.error(e); }
}

// ===== 辅助 =====
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// 暴露全局函数供 onclick 调用
window.showModal = showModal;
window.doUpload = doUpload;
window.doCreateFile = doCreateFile;
window.closeModal = closeModal;
window.toggleTasks = toggleTasks;
window.refreshTasks = refreshTasks;
window.refresh = refresh;
window.navigateTo = navigateTo;
window.mkdir = mkdir;
window.renameItem = renameItem;
window.deleteItem = deleteItem;
</script>
</body>
</html>
`;
