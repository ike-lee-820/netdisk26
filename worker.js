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
      return env[`DATA_KV_${idx}`];
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

    if (path === '/api/mkdir' && request.method === 'POST') {
      const { path: dirPath, name } = await request.json();
      const fullPath = dirPath === '/' ? '/' + name : dirPath + '/' + name;
      const existing = await getMeta(fullPath, env);
      if (existing) return new Response('已存在', { status: 400 });
      await putMeta(fullPath, { isDir: true, createdAt: new Date().toISOString() }, env);
      return new Response('OK');
    }

    if (path === '/api/rename' && request.method === 'POST') {
      const { oldPath, newName } = await request.json();
      const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
      const newPath = dir + newName;
      const meta = await getMeta(oldPath, env);
      if (!meta) return new Response('不存在', { status: 404 });
      if (meta.isDir) return new Response('暂不支持目录重命名', { status: 400 });
      await putMeta(newPath, meta, env);
      await deleteMeta(oldPath, env);
      return new Response('OK');
    }

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
            const partKey = `${mainKey}_part_${i}`;
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
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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
              const partKey = `${mainKey}_part_${partIndex}`;
              await dataKV.put(partKey, JSON.stringify({ content: base64 }));
              partKeys.push(partKey);
              partIndex++;
            }
          }
          if (buffer.length > 0) {
            const base64 = btoa(new TextDecoder('latin1').decode(buffer));
            const partKey = `${mainKey}_part_${partIndex}`;
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
                if (!partRaw) throw new Error(`Missing part: ${partKey}`);
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
            'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
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
            'Content-Disposition': `inline; filename="${encodeURIComponent(meta.filename)}"`,
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

// ---------- HTML 页面 ----------
const indexHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>云盘管理器</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#f5f7fb;padding:20px}
.container{max-width:1000px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 4px 12px rgba(0,0,0,0.06)}
.header{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.header h1{font-weight:500;font-size:20px}
.breadcrumb{display:flex;align-items:center;gap:6px;font-size:14px;color:#555;flex-wrap:wrap;cursor:pointer}
.breadcrumb span:hover{text-decoration:underline}
.toolbar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.toolbar button{background:#f0f2f5;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:14px}
.toolbar button:hover{background:#e5e7eb}
.toolbar .primary{background:#2563eb;color:#fff}
.toolbar .primary:hover{background:#1d4ed8}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:10px 8px;text-align:left;border-bottom:1px solid #eee}
th{background:#f8f9fa;font-weight:500}
td .name{display:flex;align-items:center;gap:6px;cursor:pointer}
td .name:hover{color:#2563eb}
.folder{font-weight:500}
.actions a{margin-right:8px;color:#2563eb;text-decoration:none}
.actions a:hover{text-decoration:underline}
.modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);align-items:center;justify-content:center}
.modal.active{display:flex}
.modal-content{background:#fff;padding:24px;border-radius:12px;max-width:400px;width:100%}
.modal-content h2{margin-bottom:12px;font-weight:500}
.modal-content input{width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px}
.modal-content button{margin-right:8px;padding:8px 16px;border:none;border-radius:6px;cursor:pointer}
.modal-content .primary{background:#2563eb;color:#fff}
.modal-content .primary:hover{background:#1d4ed8}
.task-panel{margin-top:20px;border-top:1px solid #eee;padding-top:16px}
.task-panel h3{font-weight:500;margin-bottom:8px}
.task-item{background:#f8f9fa;padding:8px 12px;border-radius:6px;margin-bottom:6px;font-size:13px;display:flex;justify-content:space-between}
.progress-bar{width:100px;height:6px;background:#ddd;border-radius:3px;overflow:hidden;display:inline-block;vertical-align:middle}
.progress-bar .fill{height:100%;background:#2563eb;width:0%}
</style>
</head>
<body>
<div class="container" id="app">
  <div class="header">
    <h1>📁 云盘</h1>
    <span style="flex:1"></span>
    <button class="primary" onclick="showUpload()">+ 上传</button>
    <button onclick="showOffline()">⬇ 离线下载</button>
    <button onclick="refreshTasks()">🔄 任务</button>
  </div>
  <div class="toolbar">
    <button onclick="mkdir()">新建文件夹</button>
    <button onclick="renameFile()">重命名</button>
    <button onclick="refresh()">刷新</button>
  </div>
  <div class="breadcrumb" id="breadcrumb"></div>
  <table>
    <thead><tr><th>名称</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead>
    <tbody id="fileList"></tbody>
  </table>
  <div id="taskPanel" class="task-panel" style="display:none">
    <h3>任务列表</h3>
    <div id="taskList"></div>
  </div>
</div>

<!-- 上传弹窗 -->
<div class="modal" id="uploadModal">
  <div class="modal-content">
    <h2>上传文件/文件夹</h2>
    <p style="font-size:13px;color:#888;margin-bottom:8px">目标路径：<span id="uploadPathDisplay">/</span></p>
    <input type="file" id="fileInput" multiple webkitdirectory style="margin-bottom:12px">
    <button class="primary" onclick="doUpload()">开始上传</button>
    <button onclick="closeModal('uploadModal')">取消</button>
  </div>
</div>

<!-- 离线下载弹窗 -->
<div class="modal" id="offlineModal">
  <div class="modal-content">
    <h2>离线下载</h2>
    <p style="font-size:13px;color:#888;margin-bottom:8px">支持 HTTP/HTTPS 链接（单文件）</p>
    <input type="text" id="downloadUrl" placeholder="下载链接" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px">
    <input type="text" id="downloadPath" placeholder="保存路径（如 /）" value="/" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px">
    <button class="primary" onclick="doOffline()">开始下载</button>
    <button onclick="closeModal('offlineModal')">取消</button>
  </div>
</div>

<!-- 重命名弹窗 -->
<div class="modal" id="renameModal">
  <div class="modal-content">
    <h2>重命名</h2>
    <input type="text" id="renameOld" placeholder="旧路径（自动填充）" readonly style="background:#f0f2f5">
    <input type="text" id="renameNew" placeholder="新名称">
    <button class="primary" onclick="doRename()">确认</button>
    <button onclick="closeModal('renameModal')">取消</button>
  </div>
</div>

<script>
let currentPath = '/';
let fileItems = [];
let selectedItem = null;

window.onload = function() {
  refresh();
  refreshTasks();
};

async function refresh() {
  const resp = await fetch('/api/list?path=' + encodeURIComponent(currentPath));
  const data = await resp.json();
  fileItems = data.items;
  renderBreadcrumb();
  renderList();
}

function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  const parts = currentPath.split('/').filter(p => p);
  let html = '<span onclick="navigateTo(\'/\')">根目录</span>';
  let acc = '';
  for (let p of parts) {
    acc += '/' + p;
    html += ' / <span onclick="navigateTo(\'' + acc + '\')">' + p + '</span>';
  }
  el.innerHTML = html;
}

function navigateTo(path) {
  currentPath = path;
  refresh();
}

function renderList() {
  const tbody = document.getElementById('fileList');
  if (fileItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888">空目录</td></tr>';
    return;
  }
  let html = '';
  for (let item of fileItems) {
    const icon = item.isDir ? '📁' : '📄';
    const size = item.isDir ? '-' : (item.size / 1024 / 1024).toFixed(2) + ' MB';
    const date = item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '-';
    const actions = item.isDir ? 
      `<a href="#" onclick="navigateTo('${currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name}')">打开</a>` :
      `<a href="/file${currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name}" target="_blank">下载</a> <a href="#" onclick="shareFile('${currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name}')">分享</a>`;
    html += \`<tr>
      <td><span class="name" onclick="\${item.isDir ? 'navigateTo(\\'' + (currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name) + '\\')' : ''}">\${icon} \${item.name}</span></td>
      <td>\${size}</td>
      <td>\${date}</td>
      <td class="actions">\${actions}</td>
    </tr>\`;
  }
  tbody.innerHTML = html;
}

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

function renameFile() {
  const name = prompt('请输入要重命名的文件路径（相对当前目录）');
  if (!name) return;
  const newName = prompt('请输入新名称');
  if (!newName) return;
  const oldPath = currentPath === '/' ? '/' + name : currentPath + '/' + name;
  fetch('/api/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newName })
  }).then(r => r.ok ? refresh() : alert('重命名失败'));
}

function showUpload() {
  document.getElementById('uploadPathDisplay').textContent = currentPath;
  document.getElementById('uploadModal').classList.add('active');
}

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

function showOffline() {
  document.getElementById('offlineModal').classList.add('active');
}

async function doOffline() {
  const url = document.getElementById('downloadUrl').value.trim();
  const targetPath = document.getElementById('downloadPath').value.trim() || '/';
  if (!url) return alert('请输入下载链接');
  const resp = await fetch('/api/offline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, targetPath })
  });
  if (resp.ok) {
    alert('任务已创建，请查看任务列表');
    closeModal('offlineModal');
    refreshTasks();
  } else {
    alert('启动失败');
  }
}

async function refreshTasks() {
  const resp = await fetch('/api/tasks');
  const data = await resp.json();
  const panel = document.getElementById('taskPanel');
  const list = document.getElementById('taskList');
  if (data.tasks.length === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  let html = '';
  for (let t of data.tasks) {
    const status = t.status === 'running' ? '⏳' : t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏸️';
    const progress = t.progress || 0;
    html += \`<div class="task-item">
      <span>\${status} \${t.url || '上传任务'} (\${progress}%)</span>
      <span><span class="progress-bar"><span class="fill" style="width:\${progress}%"></span></span> \${t.status}</span>
    </div>\`;
  }
  list.innerHTML = html;
}

function shareFile(path) {
  const url = window.location.origin + '/file' + path;
  navigator.clipboard.writeText(url).then(() => alert('链接已复制')).catch(() => alert('复制失败'));
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

setInterval(refreshTasks, 3000);
</script>
</body>
</html>`;
