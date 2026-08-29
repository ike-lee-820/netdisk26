// worker.js
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>云盘</title>
    <style>
        :root {
            --bg: #f5f7fa;
            --card: #ffffff;
            --text: #1a1a2e;
            --text-secondary: #6b7280;
            --accent: #4f6ef7;
            --accent-light: #eef1ff;
            --danger: #ef4444;
            --success: #10b981;
            --border: #e5e7eb;
            --shadow: 0 2px 8px rgba(0,0,0,0.06);
            --radius: 12px;
            --radius-sm: 8px;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            padding-bottom: 80px;
            -webkit-tap-highlight-color: transparent;
        }
        .header {
            position: sticky; top:0; background:var(--card); padding:0 16px;
            height:52px; display:flex; align-items:center; z-index:100;
            box-shadow:0 1px 3px rgba(0,0,0,0.05); border-bottom:1px solid var(--border);
        }
        .header h1 { font-size:18px; font-weight:700; flex-shrink:0; margin-right:12px; color:var(--accent); }
        .breadcrumb {
            display:flex; align-items:center; flex-wrap:nowrap; overflow-x:auto;
            gap:4px; font-size:13px; -webkit-overflow-scrolling:touch; flex:1;
        }
        .breadcrumb span {
            white-space:nowrap; padding:4px 6px; border-radius:4px; cursor:pointer;
            color:var(--text-secondary); flex-shrink:0;
        }
        .breadcrumb span:hover, .breadcrumb span.current { color:var(--accent); background:var(--accent-light); }
        .breadcrumb .sep { color:#ccc; cursor:default; padding:0 2px; }
        .file-list { padding:12px 16px; max-width:800px; margin:0 auto; }
        .file-item {
            background:var(--card); border-radius:var(--radius); padding:12px 14px;
            margin-bottom:8px; display:flex; align-items:flex-start; gap:12px;
            box-shadow:var(--shadow); border:1px solid var(--border); cursor:pointer;
        }
        .file-icon {
            width:40px; height:40px; border-radius:var(--radius-sm); display:flex;
            align-items:center; justify-content:center; font-size:20px; flex-shrink:0;
            background:var(--accent-light); margin-top:4px;
        }
        .file-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
        .file-name { font-size:14px; font-weight:600; word-break:break-all; }
        .file-meta { font-size:11px; color:var(--text-secondary); display:flex; gap:8px; flex-wrap:wrap; }
        .file-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
        .btn-text {
            padding:4px 10px; font-size:12px; border:1px solid var(--border);
            background:#f9fafb; border-radius:6px; cursor:pointer; color:var(--text-secondary);
            -webkit-tap-highlight-color:transparent;
        }
        .btn-text:hover { background:var(--accent-light); color:var(--accent); }
        .btn-text.danger:hover { background:#fee2e2; color:var(--danger); }
        .fab {
            position:fixed; bottom:24px; right:24px; width:56px; height:56px; border-radius:50%;
            background:var(--accent); color:#fff; border:none; font-size:28px; cursor:pointer;
            box-shadow:0 4px 16px rgba(79,110,247,0.4); z-index:200; display:flex;
            align-items:center; justify-content:center; -webkit-tap-highlight-color:transparent;
        }
        .fab:active { transform:scale(0.9); }
        .modal-overlay {
            position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:300;
            display:flex; align-items:center; justify-content:center;
        }
        .modal {
            background:var(--card); border-radius:16px; padding:20px; width:90%; max-width:420px;
            max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.15);
        }
        .modal h2 { font-size:17px; margin-bottom:16px; font-weight:700; }
        .modal input[type="text"], .modal input[type="url"] {
            width:100%; padding:10px 14px; border:1.5px solid var(--border); border-radius:var(--radius-sm);
            font-size:14px; outline:none; margin-bottom:12px; background:#fafbfc;
        }
        .modal .btn-row { display:flex; gap:8px; margin-top:8px; }
        .btn {
            padding:10px 16px; border-radius:var(--radius-sm); border:none; font-size:14px;
            font-weight:600; cursor:pointer; flex:1; text-align:center; -webkit-tap-highlight-color:transparent;
        }
        .btn-primary { background:var(--accent); color:#fff; }
        .btn-secondary { background:#f3f4f6; color:var(--text); }
        .btn-danger { background:var(--danger); color:#fff; }
        .empty-state { text-align:center; padding:60px 20px; color:var(--text-secondary); }
        .empty-state .icon { font-size:48px; margin-bottom:12px; }
        .toast {
            position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
            background:#1f2937; color:#fff; padding:10px 20px; border-radius:8px; font-size:13px;
            z-index:500; pointer-events:none; max-width:90vw;
        }
        .share-link-box {
            background:#f9fafb; border:1px solid var(--border); border-radius:8px; padding:10px;
            font-size:12px; word-break:break-all; margin:8px 0; user-select:all;
        }
        @media (max-width:480px) {
            .file-item { padding:10px 12px; }
            .btn-text { padding:3px 8px; font-size:11px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>云盘</h1>
        <div class="breadcrumb" id="breadcrumb"></div>
    </div>
    <div class="file-list" id="fileList"></div>
    <button class="fab" id="fabBtn" title="添加">+</button>
    <div id="modalContainer"></div>
    <div id="toastContainer"></div>
    <script>
        var API_BASE = '';
        var currentPath = '/';
        var fileTree = null;
        var pendingUploads = [];

        function showToast(msg, duration) {
            duration = duration || 2000;
            var container = document.getElementById('toastContainer');
            var toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = msg;
            container.appendChild(toast);
            setTimeout(function() { toast.remove(); }, duration);
        }

        function formatSize(bytes) {
            if (bytes === 0) return '0 B';
            if (!bytes) return '-';
            var k = 1024;
            var sizes = ['B','KB','MB','GB','TB'];
            var i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        function formatTime(ts) {
            if (!ts) return '-';
            var d = new Date(ts);
            return d.toLocaleString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        }

        function getFileIcon(item) {
            if (item.type === 'folder') return '📁';
            var ext = (item.name.split('.').pop() || '').toLowerCase();
            if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].indexOf(ext) !== -1) return '🖼️';
            if (['mp4','webm','avi','mov','mkv','flv'].indexOf(ext) !== -1) return '🎬';
            if (['mp3','wav','ogg','flac','m4a'].indexOf(ext) !== -1) return '🎵';
            if (['txt','md','json','js','ts','css','html','xml'].indexOf(ext) !== -1) return '📄';
            if (['zip','rar','7z','tar','gz','bz2'].indexOf(ext) !== -1) return '📦';
            return '📎';
        }

        function generateId() {
            return 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        }

        function arrayBufferToBase64(buffer) {
            return new Promise(function(resolve, reject) {
                var blob = new Blob([buffer]);
                var reader = new FileReader();
                reader.onload = function() {
                    var result = reader.result;
                    var base64 = result.split(',')[1] || result;
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        function api(path, options) {
            options = options || {};
            return fetch(API_BASE + path, {
                method: options.method || 'GET',
                headers: { 'Content-Type': 'application/json' },
                body: options.body ? JSON.stringify(options.body) : undefined
            }).then(function(res) {
                return res.json().then(function(data) {
                    if (!res.ok && data.error) throw new Error(data.error);
                    return data;
                });
            });
        }

        function getCurrentFolderItems() {
            if (!fileTree || !fileTree.children) return [];
            var parts = currentPath.split('/').filter(Boolean);
            var current = fileTree;
            for (var i = 0; i < parts.length; i++) {
                var found = null;
                if (current.children) {
                    for (var j = 0; j < current.children.length; j++) {
                        if (current.children[j].name === parts[i] && current.children[j].type === 'folder') {
                            found = current.children[j];
                            break;
                        }
                    }
                }
                if (!found) return [];
                current = found;
            }
            return current.children || [];
        }

        function joinPath(base, name) {
            var cleanBase = base.endsWith('/') ? base : base + '/';
            if (name.startsWith('/')) return name;
            return cleanBase + name;
        }

        function renderBreadcrumb() {
            var container = document.getElementById('breadcrumb');
            container.innerHTML = '';
            var parts = currentPath.split('/').filter(Boolean);
            var rootSpan = document.createElement('span');
            rootSpan.textContent = '根目录';
            rootSpan.className = currentPath === '/' ? 'current' : '';
            rootSpan.onclick = function() { navigateTo('/'); };
            container.appendChild(rootSpan);
            var accumulated = '';
            for (var i = 0; i < parts.length; i++) {
                accumulated += '/' + parts[i];
                var sep = document.createElement('span');
                sep.className = 'sep';
                sep.textContent = '>';
                container.appendChild(sep);
                var span = document.createElement('span');
                span.textContent = parts[i];
                span.className = accumulated === currentPath ? 'current' : '';
                span.onclick = (function(path) { return function() { navigateTo(path); }; })(accumulated);
                container.appendChild(span);
            }
        }

        function renderFileList() {
            var container = document.getElementById('fileList');
            var items = getCurrentFolderItems();
            container.innerHTML = '';
            if (items.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="icon">📂</div><p>此文件夹为空</p></div>';
                return;
            }
            var sortedItems = items.slice().sort(function(a, b) {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            for (var i = 0; i < sortedItems.length; i++) {
                var item = sortedItems[i];
                var div = document.createElement('div');
                div.className = 'file-item';
                var iconClass = item.type === 'folder' ? 'folder' : '';
                var actionsHtml = '';
                if (item.type === 'file') {
                    actionsHtml += '<button class="btn-text" onclick="downloadFile(\'' + item.id + '\',\'' + item.name + '\')">下载</button>';
                    actionsHtml += '<button class="btn-text" onclick="shareFile(\'' + item.id + '\',\'' + item.name + '\')">分享</button>';
                }
                actionsHtml += '<button class="btn-text" onclick="renameItem(\'' + item.id + '\',\'' + item.name + '\',\'' + item.type + '\')">重命名</button>';
                actionsHtml += '<button class="btn-text danger" onclick="deleteItem(\'' + item.id + '\',\'' + item.name + '\',\'' + item.type + '\')">删除</button>';
                div.innerHTML = '<div class="file-icon ' + iconClass + '">' + getFileIcon(item) + '</div>' +
                    '<div class="file-info">' +
                    '<div class="file-name">' + item.name + '</div>' +
                    '<div class="file-meta"><span>' + (item.type === 'folder' ? '文件夹' : formatSize(item.size)) + '</span><span>' + formatTime(item.updatedAt || item.createdAt) + '</span></div>' +
                    '<div class="file-actions" onclick="event.stopPropagation()">' + actionsHtml + '</div>' +
                    '</div>';
                div.onclick = (function(item) {
                    return function() {
                        if (item.type === 'folder') {
                            navigateTo(joinPath(currentPath, item.name));
                        } else {
                            // 简单预览：下载或提示
                            showToast('请使用下载按钮');
                        }
                    };
                })(item);
                container.appendChild(div);
            }
        }

        function navigateTo(path) {
            if (!path.startsWith('/')) path = '/' + path;
            currentPath = path;
            renderBreadcrumb();
            renderFileList();
        }

        function loadTree() {
            return api('/api/tree').then(function(data) {
                fileTree = data.tree || { name:'/', type:'folder', children:[] };
                renderFileList();
                renderBreadcrumb();
            }).catch(function() {
                fileTree = { name:'/', type:'folder', children:[] };
                renderFileList();
                renderBreadcrumb();
            });
        }

        function saveTree() {
            return api('/api/tree', { method:'PUT', body: { tree: fileTree } });
        }

        function showModal(html) {
            var container = document.getElementById('modalContainer');
            container.innerHTML = '<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>';
        }

        function closeModal() {
            document.getElementById('modalContainer').innerHTML = '';
        }

        function showNewFolderModal() {
            showModal('<h2>新建文件夹</h2><input type="text" id="newFolderName" placeholder="文件夹名称"><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="createFolder()">创建</button></div>');
        }

        function createFolder() {
            var name = document.getElementById('newFolderName').value.trim();
            if (!name) { showToast('请输入文件夹名称'); return; }
            if (name.indexOf('/') !== -1) { showToast('名称不能包含 /'); return; }
            var items = getCurrentFolderItems();
            for (var i = 0; i < items.length; i++) {
                if (items[i].name === name) { showToast('同名文件已存在'); return; }
            }
            var newFolder = { id: generateId(), name: name, type:'folder', children:[], createdAt: Date.now(), updatedAt: Date.now() };
            var target = fileTree;
            var parts = currentPath.split('/').filter(Boolean);
            for (var j = 0; j < parts.length; j++) {
                target = target.children.find(function(c) { return c.name === parts[j] && c.type === 'folder'; });
            }
            if (!target.children) target.children = [];
            target.children.push(newFolder);
            saveTree().then(function() {
                closeModal();
                renderFileList();
                showToast('文件夹已创建');
            });
        }

        function showUploadModal() {
            showModal('<h2>上传文件</h2><input type="file" id="fileInput" multiple><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="startUpload()">开始上传</button></div>');
        }

        function startUpload() {
            var input = document.getElementById('fileInput');
            if (!input.files || input.files.length === 0) { showToast('请选择文件'); return; }
            var files = Array.from(input.files);
            var uploadPath = currentPath;
            closeModal();
            showToast('开始上传 ' + files.length + ' 个文件');
            var queue = Promise.resolve();
            for (var i = 0; i < files.length; i++) {
                (function(file) {
                    queue = queue.then(function() {
                        return uploadSingleFile(file, file.name, uploadPath);
                    });
                })(files[i]);
            }
            queue.then(function() {
                showToast('上传完成');
                loadTree();
            }).catch(function(e) {
                showToast('上传失败: ' + e.message);
            });
        }

        function uploadSingleFile(file, fileName, uploadPath) {
            var CHUNK_THRESHOLD = 15 * 1024 * 1024; // 15MB
            var fileId = generateId();
            return arrayBufferToBase64(file).then(function(base64) {
                if (file.size <= CHUNK_THRESHOLD) {
                    return api('/api/upload/single', {
                        method:'POST',
                        body: { fileId: fileId, fileName: fileName, uploadPath: uploadPath, base64: base64, mimeType: file.type || 'application/octet-stream', size: file.size }
                    });
                } else {
                    // 简化：大文件也单次上传（可能超出KV限制，但暂不处理分片）
                    return api('/api/upload/single', {
                        method:'POST',
                        body: { fileId: fileId, fileName: fileName, uploadPath: uploadPath, base64: base64, mimeType: file.type || 'application/octet-stream', size: file.size }
                    });
                }
            });
        }

        function renameItem(itemId, oldName, type) {
            showModal('<h2>重命名</h2><input type="text" id="renameInput" value="' + oldName + '"><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doRename(\'' + itemId + '\',\'' + type + '\')">确定</button></div>');
        }

        function doRename(itemId, type) {
            var newName = document.getElementById('renameInput').value.trim();
            if (!newName) { showToast('请输入新名称'); return; }
            var item = findItemById(fileTree, itemId);
            if (!item) { showToast('未找到文件'); return; }
            item.name = newName;
            item.updatedAt = Date.now();
            saveTree().then(function() {
                closeModal();
                renderFileList();
                showToast('重命名成功');
            });
        }

        function findItemById(tree, id) {
            if (!tree) return null;
            if (tree.id === id) return tree;
            if (tree.children) {
                for (var i = 0; i < tree.children.length; i++) {
                    var found = findItemById(tree.children[i], id);
                    if (found) return found;
                }
            }
            return null;
        }

        function deleteItem(itemId, name, type) {
            if (confirm('确定要删除 ' + name + ' 吗？')) {
                // 删除文件内容
                var item = findItemById(fileTree, itemId);
                if (item && item.type === 'file' && item.chunks > 0) {
                    api('/api/delete-content', { method:'POST', body: { fileId: item.id, chunks: item.chunks } }).catch(function(){});
                }
                removeItemFromTree(fileTree, itemId);
                saveTree().then(function() {
                    renderFileList();
                    showToast('已删除');
                });
            }
        }

        function removeItemFromTree(tree, itemId) {
            if (!tree || !tree.children) return false;
            var idx = tree.children.findIndex(function(c) { return c.id === itemId; });
            if (idx !== -1) {
                tree.children.splice(idx, 1);
                return true;
            }
            for (var i = 0; i < tree.children.length; i++) {
                if (removeItemFromTree(tree.children[i], itemId)) return true;
            }
            return false;
        }

        function downloadFile(fileId, fileName) {
            window.location.href = '/api/download?fileId=' + encodeURIComponent(fileId);
        }

        function shareFile(fileId, fileName) {
            api('/api/share', { method:'POST', body: { fileId: fileId } }).then(function(data) {
                var link = location.origin + '/s/' + data.shareId;
                showModal('<h2>分享链接</h2><div class="share-link-box">' + link + '</div><button class="btn btn-primary" onclick="closeModal()">关闭</button>');
            });
        }

        function init() {
            loadTree();
            document.getElementById('fabBtn').onclick = function() {
                showModal('<h2>添加</h2><div style="display:flex;flex-direction:column;gap:8px;">' +
                    '<button class="btn btn-primary" onclick="closeModal();showUploadModal()">上传文件</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();showNewFolderModal()">新建文件夹</button>' +
                    '</div>');
            };
        }

        init();
    </script>
</body>
</html>`;

// ==================== 后端逻辑 ====================
const FILE_KV_BINDINGS = [
  'FILE_KV_1',
  'FILE_KV_2',
  'FILE_KV_3',
  'FILE_KV_4',
  'FILE_KV_5'
];

function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function getKvIndex(fileId, chunkIndex = null) {
  let hash = 0;
  const str = chunkIndex !== null ? fileId + ':' + chunkIndex : fileId;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 5;
}

async function getTree(env) {
  const tree = await env.FILE_STRUCTURE_KV.get('tree', 'json');
  return tree || { name: '/', type: 'folder', children: [] };
}

async function putTree(env, tree) {
  await env.FILE_STRUCTURE_KV.put('tree', JSON.stringify(tree));
}

function findItemById(tree, id) {
  if (!tree) return null;
  if (tree.id === id) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findItemById(child, id);
      if (found) return found;
    }
  }
  return null;
}

async function addFileToTree(env, uploadPath, fileName, fileId, size, mimeType, chunks, chunkSize) {
  const tree = await getTree(env);
  const parts = uploadPath.split('/').filter(Boolean);
  let current = tree;
  for (const part of parts) {
    let folder = current.children?.find(c => c.name === part && c.type === 'folder');
    if (!folder) {
      folder = { id: 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2,8), name: part, type:'folder', children:[], createdAt: Date.now(), updatedAt: Date.now() };
      if (!current.children) current.children = [];
      current.children.push(folder);
    }
    current = folder;
  }
  const newFile = { id: fileId, name: fileName, type:'file', size, mimeType, chunks, chunkSize, createdAt: Date.now(), updatedAt: Date.now() };
  if (!current.children) current.children = [];
  const existingIndex = current.children.findIndex(c => c.name === fileName && c.type === 'file');
  if (existingIndex !== -1) current.children[existingIndex] = newFile;
  else current.children.push(newFile);
  await putTree(env, tree);
}

async function storeSingleFile(env, fileId, base64) {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const kvIndex = getKvIndex(fileId);
  const kv = env[FILE_KV_BINDINGS[kvIndex]];
  await kv.put('f:' + fileId, arrayBuffer);
}

async function getFileArrayBuffer(env, item) {
  if (item.chunks <= 1) {
    const kvIndex = getKvIndex(item.id);
    const kv = env[FILE_KV_BINDINGS[kvIndex]];
    return await kv.get('f:' + item.id, 'arrayBuffer');
  }
  // 分片合并（此简化版不支持，但保留逻辑）
  const chunks = item.chunks;
  const totalLength = item.size;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < chunks; i++) {
    const kvIndex = getKvIndex(item.id, i);
    const kv = env[FILE_KV_BINDINGS[kvIndex]];
    const chunkBuffer = await kv.get('f:' + item.id + ':chunk:' + i, 'arrayBuffer');
    if (!chunkBuffer) throw new Error('Missing chunk ' + i);
    const chunkBytes = new Uint8Array(chunkBuffer);
    result.set(chunkBytes, offset);
    offset += chunkBytes.length;
  }
  return result.buffer;
}

async function deleteFileContent(env, fileId, chunks) {
  if (chunks <= 1) {
    const kvIndex = getKvIndex(fileId);
    const kv = env[FILE_KV_BINDINGS[kvIndex]];
    await kv.delete('f:' + fileId);
  } else {
    for (let i = 0; i < chunks; i++) {
      const kvIndex = getKvIndex(fileId, i);
      const kv = env[FILE_KV_BINDINGS[kvIndex]];
      await kv.delete('f:' + fileId + ':chunk:' + i);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const headers = corsHeaders();

    if (method === 'OPTIONS') return new Response(null, { headers });

    try {
      if (path === '/' || path === '/index.html') {
        return new Response(HTML, {
          headers: { 'Content-Type': 'text/html;charset=UTF-8', ...headers },
        });
      }

      if (path.startsWith('/api/')) {
        const apiPath = path.substring(4);
        let body = {};
        if (method === 'POST' || method === 'PUT') {
          try { body = await request.json(); } catch (e) {}
        }

        if (apiPath === '/tree' && method === 'GET') {
          const tree = await getTree(env);
          return jsonResponse({ tree }, headers);
        }
        if (apiPath === '/tree' && method === 'PUT') {
          if (body.tree) { await putTree(env, body.tree); return jsonResponse({ success: true }, headers); }
          return jsonResponse({ error: 'Invalid tree' }, headers, 400);
        }

        if (apiPath === '/upload/single' && method === 'POST') {
          const { fileId, fileName, uploadPath, base64, mimeType, size } = body;
          if (!fileId || !fileName || !base64) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          try {
            await storeSingleFile(env, fileId, base64);
            await addFileToTree(env, uploadPath, fileName, fileId, size, mimeType, 1, 0);
            return jsonResponse({ success: true }, headers);
          } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        if (apiPath === '/delete-content' && method === 'POST') {
          const { fileId, chunks } = body;
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          try { await deleteFileContent(env, fileId, chunks); return jsonResponse({ success: true }, headers); }
          catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        if (apiPath === '/download' && method === 'GET') {
          const fileId = url.searchParams.get('fileId');
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          const tree = await getTree(env);
          const item = findItemById(tree, fileId);
          if (!item || item.type !== 'file') return jsonResponse({ error: 'File not found' }, headers, 404);
          const buffer = await getFileArrayBuffer(env, item);
          return new Response(buffer, {
            headers: {
              'Content-Type': item.mimeType || 'application/octet-stream',
              'Content-Disposition': 'attachment; filename="' + encodeURIComponent(item.name) + '"',
              ...headers,
            },
          });
        }

        if (apiPath === '/share' && method === 'POST') {
          const { fileId } = body;
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          const shareId = crypto.randomUUID();
          await env.FILE_STRUCTURE_KV.put('share:' + shareId, fileId);
          return jsonResponse({ shareId }, headers);
        }

        return jsonResponse({ error: 'Not found' }, headers, 404);
      }

      if (path.startsWith('/s/')) {
        const shareId = path.substring(3);
        const fileId = await env.FILE_STRUCTURE_KV.get('share:' + shareId);
        if (!fileId) return new Response('Share link invalid', { status: 404, headers });
        const tree = await getTree(env);
        const item = findItemById(tree, fileId);
        if (!item || item.type !== 'file') return new Response('File not found', { status: 404, headers });
        const buffer = await getFileArrayBuffer(env, item);
        return new Response(buffer, {
          headers: {
            'Content-Type': item.mimeType || 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="' + encodeURIComponent(item.name) + '"',
            ...headers,
          },
        });
      }

      return new Response('Not found', { status: 404, headers });
    } catch (e) {
      return jsonResponse({ error: e.message }, headers, 500);
    }
  }
};
