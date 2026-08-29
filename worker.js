// worker.js
// 前端页面
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
            --header-height: 52px;
            --fab-size: 56px;
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
            height:var(--header-height); display:flex; align-items:center; z-index:100;
            box-shadow:0 1px 3px rgba(0,0,0,0.05); border-bottom:1px solid var(--border);
        }
        .header h1 { font-size:18px; font-weight:700; flex-shrink:0; margin-right:12px; color:var(--accent); }
        .breadcrumb {
            display:flex; align-items:center; flex-wrap:nowrap; overflow-x:auto;
            gap:4px; font-size:13px; -webkit-overflow-scrolling:touch;
            scrollbar-width:none; flex:1;
        }
        .breadcrumb::-webkit-scrollbar { display:none; }
        .breadcrumb span {
            white-space:nowrap; padding:4px 6px; border-radius:4px; cursor:pointer;
            color:var(--text-secondary); transition:all 0.15s; flex-shrink:0;
        }
        .breadcrumb span:hover, .breadcrumb span.current { color:var(--accent); background:var(--accent-light); }
        .breadcrumb .sep { color:#ccc; cursor:default; padding:0 2px; }
        .file-list { padding:12px 16px; max-width:800px; margin:0 auto; }
        .file-item {
            background:var(--card); border-radius:var(--radius); padding:12px 14px;
            margin-bottom:8px; display:flex; align-items:center; gap:12px;
            box-shadow:var(--shadow); border:1px solid var(--border);
            transition:all 0.15s; cursor:pointer; position:relative;
        }
        .file-item:active { transform:scale(0.98); background:#fafafa; }
        .file-icon {
            width:40px; height:40px; border-radius:var(--radius-sm); display:flex;
            align-items:center; justify-content:center; font-size:20px; flex-shrink:0;
            background:var(--accent-light);
        }
        .file-icon.folder { background:#fef3c7; }
        .file-icon.image { background:#dcfce7; }
        .file-icon.video { background:#fee2e2; }
        .file-icon.text { background:#e0e7ff; }
        .file-info { flex:1; min-width:0; }
        .file-name {
            font-size:14px; font-weight:600; word-break:break-all; line-height:1.3;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .file-meta {
            font-size:11px; color:var(--text-secondary); margin-top:2px;
            display:flex; gap:8px; flex-wrap:wrap;
        }
        .file-actions { display:flex; gap:4px; flex-shrink:0; opacity:0.7; transition:opacity 0.2s; }
        .file-item:hover .file-actions, .file-actions:focus-within { opacity:1; }
        .btn-icon {
            width:32px; height:32px; border:none; background:none; border-radius:6px;
            cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center;
            color:var(--text-secondary); transition:all 0.15s; padding:0;
        }
        .btn-icon:hover { background:var(--accent-light); color:var(--accent); }
        .btn-icon.danger:hover { background:#fee2e2; color:var(--danger); }
        .fab {
            position:fixed; bottom:24px; right:24px; width:var(--fab-size); height:var(--fab-size);
            border-radius:50%; background:var(--accent); color:#fff; border:none; font-size:28px;
            cursor:pointer; box-shadow:0 4px 16px rgba(79,110,247,0.4); z-index:200;
            display:flex; align-items:center; justify-content:center; transition:all 0.2s;
            -webkit-tap-highlight-color:transparent;
        }
        .fab:active { transform:scale(0.9); box-shadow:0 2px 8px rgba(79,110,247,0.3); }
        .modal-overlay {
            position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:300;
            display:flex; align-items:center; justify-content:center; animation:fadeIn 0.2s ease;
        }
        .modal {
            background:var(--card); border-radius:16px; padding:20px; width:90%; max-width:420px;
            max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.15);
            animation:slideUp 0.25s ease;
        }
        .modal h2 { font-size:17px; margin-bottom:16px; font-weight:700; }
        .modal input[type="text"], .modal input[type="url"], .modal select {
            width:100%; padding:10px 14px; border:1.5px solid var(--border); border-radius:var(--radius-sm);
            font-size:14px; outline:none; transition:border-color 0.2s; margin-bottom:12px; background:#fafbfc;
        }
        .modal input:focus, .modal select:focus { border-color:var(--accent); background:#fff; }
        .modal .btn-row { display:flex; gap:8px; margin-top:8px; }
        .btn {
            padding:10px 16px; border-radius:var(--radius-sm); border:none; font-size:14px;
            font-weight:600; cursor:pointer; transition:all 0.15s; flex:1; text-align:center;
            -webkit-tap-highlight-color:transparent;
        }
        .btn-primary { background:var(--accent); color:#fff; }
        .btn-primary:active { background:#3b53d4; }
        .btn-secondary { background:#f3f4f6; color:var(--text); }
        .btn-secondary:active { background:#e5e7eb; }
        .btn-danger { background:var(--danger); color:#fff; }
        .btn-danger:active { background:#dc2626; }
        .empty-state { text-align:center; padding:60px 20px; color:var(--text-secondary); }
        .empty-state .icon { font-size:48px; margin-bottom:12px; opacity:0.5; }
        .empty-state p { font-size:14px; }
        .task-panel {
            position:fixed; top:0; right:0; bottom:0; width:320px; max-width:90vw;
            background:var(--card); z-index:250; box-shadow:-4px 0 20px rgba(0,0,0,0.1);
            transform:translateX(100%); transition:transform 0.3s ease; overflow-y:auto; padding:16px;
        }
        .task-panel.open { transform:translateX(0); }
        .task-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .task-panel-header h3 { font-size:16px; }
        .task-item {
            padding:10px; border-radius:var(--radius-sm); background:#f9fafb;
            margin-bottom:8px; border:1px solid var(--border);
        }
        .task-item .task-name { font-size:13px; font-weight:600; word-break:break-all; }
        .task-item .task-status { font-size:11px; color:var(--text-secondary); margin-top:4px; }
        .progress-bar { height:4px; background:#e5e7eb; border-radius:2px; margin-top:6px; overflow:hidden; }
        .progress-bar .fill { height:100%; background:var(--accent); border-radius:2px; transition:width 0.3s ease; }
        .progress-bar .fill.completed { background:var(--success); }
        .progress-bar .fill.failed { background:var(--danger); }
        .task-panel-backdrop {
            position:fixed; inset:0; background:rgba(0,0,0,0.3); z-index:240;
            opacity:0; pointer-events:none; transition:opacity 0.3s ease;
        }
        .task-panel-backdrop.open { opacity:1; pointer-events:auto; }
        .upload-area {
            border:2px dashed var(--border); border-radius:var(--radius); padding:32px 16px;
            text-align:center; cursor:pointer; transition:all 0.2s; margin-bottom:12px; background:#fafbfc;
        }
        .upload-area:active, .upload-area.dragover { border-color:var(--accent); background:var(--accent-light); }
        .upload-area .icon { font-size:40px; margin-bottom:8px; }
        .upload-area p { font-size:13px; color:var(--text-secondary); }
        .file-preview-grid {
            display:grid; grid-template-columns:repeat(auto-fill,minmax(80px,1fr));
            gap:8px; margin:12px 0; max-height:200px; overflow-y:auto; padding:4px;
        }
        .file-preview-item {
            background:#f9fafb; border-radius:8px; padding:8px; text-align:center;
            font-size:11px; word-break:break-all; border:1px solid var(--border);
        }
        .file-preview-item .fp-icon { font-size:24px; display:block; margin-bottom:4px; }
        .toast {
            position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
            background:#1f2937; color:#fff; padding:10px 20px; border-radius:8px; font-size:13px;
            z-index:500; animation:fadeIn 0.2s ease; pointer-events:none; max-width:90vw; text-align:center;
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @media (max-width:480px) {
            .file-item { padding:10px 12px; }
            .file-actions { gap:2px; }
            .btn-icon { width:28px; height:28px; font-size:14px; }
            .fab { bottom:16px; right:16px; }
        }
        .hidden { display:none !important; }
        .share-link-box {
            background:#f9fafb; border:1px solid var(--border); border-radius:8px; padding:10px;
            font-size:12px; word-break:break-all; margin:8px 0; user-select:all; -webkit-user-select:all;
        }
        .task-btn {
            position:fixed; bottom:24px; right:96px; width:44px; height:44px; border-radius:50%;
            background:var(--card); color:var(--text); border:1px solid var(--border); font-size:18px;
            cursor:pointer; box-shadow:var(--shadow); z-index:200; display:flex; align-items:center;
            justify-content:center; -webkit-tap-highlight-color:transparent;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📁 云盘</h1>
        <div class="breadcrumb" id="breadcrumb"></div>
    </div>

    <div class="file-list" id="fileList"></div>

    <button class="task-btn" id="taskBtn" title="任务列表">📋</button>
    <button class="fab" id="fabBtn" title="添加">+</button>

    <div class="task-panel-backdrop" id="taskBackdrop"></div>
    <div class="task-panel" id="taskPanel">
        <div class="task-panel-header">
            <h3>📋 任务列表</h3>
            <button class="btn-icon" id="closeTaskPanel">✕</button>
        </div>
        <div id="taskList"></div>
    </div>

    <div id="modalContainer"></div>
    <div id="toastContainer"></div>

    <script>
        const API_BASE = '';
        let currentPath = '/';
        let fileTree = null;
        let tasks = [];
        let pendingUploads = [];
        let currentTaskId = null;

        function showToast(msg, duration = 2000) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = msg;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), duration);
        }

        function formatSize(bytes) {
            if (bytes === 0) return '0 B';
            if (!bytes) return '-';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        function formatTime(ts) {
            if (!ts) return '-';
            const d = new Date(ts);
            return d.toLocaleString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        }

        function getFileIcon(item) {
            if (item.type === 'folder') return '📁';
            const ext = (item.name.split('.').pop() || '').toLowerCase();
            if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) return '🖼️';
            if (['mp4','webm','avi','mov','mkv','flv'].includes(ext)) return '🎬';
            if (['mp3','wav','ogg','flac','m4a'].includes(ext)) return '🎵';
            if (['txt','md','json','js','ts','css','html','xml','yml','yaml','log'].includes(ext)) return '📄';
            if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) return '📦';
            if (['pdf','doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) return '📑';
            return '📎';
        }

        function getIconClass(item) {
            if (item.type === 'folder') return 'folder';
            const ext = (item.name.split('.').pop() || '').toLowerCase();
            if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) return 'image';
            if (['mp4','webm','avi','mov','mkv','flv'].includes(ext)) return 'video';
            if (['txt','md','json','js','ts','css','html','xml'].includes(ext)) return 'text';
            return '';
        }

        function generateId() {
            return 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        }

        function arrayBufferToBase64(buffer) {
            return new Promise((resolve, reject) => {
                const blob = new Blob([buffer]);
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result;
                    const base64 = result.split(',')[1] || result;
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        function base64ToArrayBuffer(base64) {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        async function api(path, options = {}) {
            const res = await fetch(API_BASE + path, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {}),
                },
            });
            const data = await res.json();
            if (!res.ok && data.error) {
                throw new Error(data.error);
            }
            return data;
        }

        function getCurrentFolderItems() {
            if (!fileTree || !fileTree.children) return [];
            const parts = currentPath.split('/').filter(Boolean);
            let current = fileTree;
            for (const part of parts) {
                const found = current.children?.find(c => c.name === part && c.type === 'folder');
                if (!found) return [];
                current = found;
            }
            return current.children || [];
        }

        function joinPath(base, name) {
            const cleanBase = base.endsWith('/') ? base : base + '/';
            if (name.startsWith('/')) return name;
            return cleanBase + name;
        }

        function renderBreadcrumb() {
            const container = document.getElementById('breadcrumb');
            container.innerHTML = '';
            const parts = currentPath.split('/').filter(Boolean);
            const rootSpan = document.createElement('span');
            rootSpan.textContent = '根目录';
            rootSpan.className = currentPath === '/' ? 'current' : '';
            rootSpan.onclick = () => navigateTo('/');
            container.appendChild(rootSpan);

            let accumulated = '';
            for (const part of parts) {
                accumulated += '/' + part;
                const sep = document.createElement('span');
                sep.className = 'sep';
                sep.textContent = '›';
                container.appendChild(sep);
                const span = document.createElement('span');
                span.textContent = part;
                span.className = accumulated === currentPath ? 'current' : '';
                span.onclick = () => navigateTo(accumulated);
                container.appendChild(span);
            }
            container.scrollLeft = container.scrollWidth;
        }

        function renderFileList() {
            const container = document.getElementById('fileList');
            const items = getCurrentFolderItems();
            container.innerHTML = '';

            if (items.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="icon">📂</div><p>此文件夹为空</p><p style="font-size:12px;margin-top:4px;">点击右下角 + 上传文件</p></div>';
                return;
            }

            const sortedItems = [...items].sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            for (const item of sortedItems) {
                const div = document.createElement('div');
                div.className = 'file-item';
                const iconClass = getIconClass(item);
                div.innerHTML = '<div class="file-icon ' + iconClass + '">' + getFileIcon(item) + '</div>' +
                    '<div class="file-info"><div class="file-name">' + item.name + '</div>' +
                    '<div class="file-meta"><span>' + (item.type === 'folder' ? '文件夹' : formatSize(item.size)) + '</span>' +
                    '<span>' + formatTime(item.updatedAt || item.createdAt) + '</span>' +
                    (item.type === 'file' && item.chunks > 1 ? '<span>🔗 分片</span>' : '') +
                    '</div></div>' +
                    '<div class="file-actions" onclick="event.stopPropagation()">' +
                    (item.type === 'file' ? '<button class="btn-icon" title="下载" onclick="downloadFile(\\'' + item.id + '\\',\\'' + item.name + '\\')">⬇️</button>' +
                    '<button class="btn-icon" title="分享" onclick="shareFile(\\'' + item.id + '\\',\\'' + item.name + '\\')">🔗</button>' +
                    (['txt','md','json','js','ts','css','html','xml','log'].includes((item.name.split('.').pop()||'').toLowerCase()) ? '<button class="btn-icon" title="编辑" onclick="editFile(\\'' + item.id + '\\',\\'' + item.name + '\\')">✏️</button>' : '') : '') +
                    '<button class="btn-icon" title="重命名" onclick="renameItem(\\'' + item.id + '\\',\\'' + item.name + '\\',\\'' + item.type + '\\')">✏️</button>' +
                    '<button class="btn-icon danger" title="删除" onclick="deleteItem(\\'' + item.id + '\\',\\'' + item.name + '\\',\\'' + item.type + '\\')">🗑️</button>' +
                    '</div>';
                div.onclick = () => {
                    if (item.type === 'folder') {
                        navigateTo(joinPath(currentPath, item.name));
                    } else {
                        previewFile(item);
                    }
                };
                container.appendChild(div);
            }
        }

        function navigateTo(path) {
            if (!path.startsWith('/')) path = '/' + path;
            currentPath = path;
            renderBreadcrumb();
            renderFileList();
        }

        async function loadTree() {
            try {
                const data = await api('/api/tree');
                fileTree = data.tree || { name:'/', type:'folder', children:[] };
                renderFileList();
                renderBreadcrumb();
            } catch (e) {
                fileTree = { name:'/', type:'folder', children:[] };
                renderFileList();
                renderBreadcrumb();
            }
        }

        async function saveTree() {
            await api('/api/tree', { method:'PUT', body: JSON.stringify({ tree: fileTree }) });
        }

        function findItemInTree(tree, itemId) {
            if (!tree) return null;
            if (tree.id === itemId) return tree;
            if (tree.children) {
                for (const child of tree.children) {
                    const found = findItemInTree(child, itemId);
                    if (found) return found;
                }
            }
            return null;
        }

        function removeItemFromTree(tree, itemId) {
            if (!tree || !tree.children) return false;
            const idx = tree.children.findIndex(c => c.id === itemId);
            if (idx !== -1) {
                tree.children.splice(idx, 1);
                return true;
            }
            for (const child of tree.children) {
                if (removeItemFromTree(child, itemId)) return true;
            }
            return false;
        }

        function showModal(html) {
            const container = document.getElementById('modalContainer');
            container.innerHTML = '<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>';
        }

        function closeModal() {
            document.getElementById('modalContainer').innerHTML = '';
        }

        function showNewFolderModal() {
            showModal('<h2>📁 新建文件夹</h2><input type="text" id="newFolderName" placeholder="文件夹名称" autofocus><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="createFolder()">创建</button></div>');
            document.getElementById('newFolderName').focus();
            document.getElementById('newFolderName').onkeydown = (e) => { if (e.key === 'Enter') createFolder(); };
        }

        async function createFolder() {
            const name = document.getElementById('newFolderName').value.trim();
            if (!name) { showToast('请输入文件夹名称'); return; }
            if (name.includes('/')) { showToast('名称不能包含 /'); return; }
            const items = getCurrentFolderItems();
            if (items.some(i => i.name === name)) { showToast('同名文件已存在'); return; }
            const newFolder = { id: generateId(), name, type:'folder', children:[], createdAt: Date.now(), updatedAt: Date.now() };
            let target = fileTree;
            const parts = currentPath.split('/').filter(Boolean);
            for (const part of parts) {
                target = target.children.find(c => c.name === part && c.type === 'folder');
            }
            if (!target.children) target.children = [];
            target.children.push(newFolder);
            await saveTree();
            closeModal();
            renderFileList();
            showToast('文件夹已创建');
        }

        function showNewFileModal() {
            showModal('<h2>📄 新建文本文件</h2><input type="text" id="newFileName" placeholder="文件名（如 note.txt）" autofocus><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="createNewFile()">创建</button></div>');
            document.getElementById('newFileName').focus();
            document.getElementById('newFileName').onkeydown = (e) => { if (e.key === 'Enter') createNewFile(); };
        }

        async function createNewFile() {
            const name = document.getElementById('newFileName').value.trim();
            if (!name) { showToast('请输入文件名'); return; }
            const items = getCurrentFolderItems();
            if (items.some(i => i.name === name)) { showToast('同名文件已存在'); return; }
            const fileId = generateId();
            const newFile = { id: fileId, name, type:'file', size:0, mimeType:'text/plain', chunks:0, chunkSize:0, createdAt: Date.now(), updatedAt: Date.now() };
            let target = fileTree;
            const parts = currentPath.split('/').filter(Boolean);
            for (const part of parts) {
                target = target.children.find(c => c.name === part && c.type === 'folder');
            }
            if (!target.children) target.children = [];
            target.children.push(newFile);
            await saveTree();
            closeModal();
            renderFileList();
            showToast('文件已创建');
        }

        function renameItem(itemId, oldName, type) {
            showModal('<h2>✏️ 重命名' + (type === 'folder' ? '文件夹' : '文件') + '</h2><input type="text" id="renameInput" value="' + oldName + '" autofocus><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doRename(\\'' + itemId + '\\',\\'' + type + '\\')">确定</button></div>');
            const input = document.getElementById('renameInput');
            input.focus();
            input.select();
            input.onkeydown = (e) => { if (e.key === 'Enter') doRename(itemId, type); };
        }

        async function doRename(itemId, type) {
            const newName = document.getElementById('renameInput').value.trim();
            if (!newName) { showToast('请输入新名称'); return; }
            if (newName.includes('/')) { showToast('名称不能包含 /'); return; }
            const item = findItemInTree(fileTree, itemId);
            if (!item) { showToast('未找到文件'); return; }
            const parentItems = getCurrentFolderItems();
            if (parentItems.some(i => i.name === newName && i.id !== itemId)) { showToast('同名文件已存在'); return; }
            item.name = newName;
            item.updatedAt = Date.now();
            await saveTree();
            closeModal();
            renderFileList();
            showToast('重命名成功');
        }

        function deleteItem(itemId, name, type) {
            const isFolder = type === 'folder';
            showModal('<h2>🗑️ 确认删除</h2><p style="font-size:14px;margin-bottom:16px;color:var(--text-secondary);">确定要删除 ' + (isFolder ? '文件夹' : '文件') + '「' + name + '」吗？' + (isFolder ? '其中的所有内容都会被删除。' : '') + '此操作不可撤销。</p><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-danger" onclick="doDelete(\\'' + itemId + '\\')">删除</button></div>');
        }

        async function doDelete(itemId) {
            try {
                const item = findItemInTree(fileTree, itemId);
                if (!item) { showToast('未找到文件'); closeModal(); return; }
                if (item.type === 'file' && item.chunks > 0) {
                    await api('/api/delete-content', { method:'POST', body: JSON.stringify({ fileId: item.id, chunks: item.chunks }) });
                }
                removeItemFromTree(fileTree, itemId);
                await saveTree();
                closeModal();
                renderFileList();
                showToast('已删除');
            } catch (e) {
                showToast('删除失败: ' + e.message);
            }
        }

        async function previewFile(item) {
            const ext = (item.name.split('.').pop() || '').toLowerCase();
            const previewableExts = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','txt','md','json','js','ts','css','html','xml','log','mp4','webm','mp3','wav','pdf'];
            if (!previewableExts.includes(ext)) { showToast('此文件类型不支持预览，请下载查看'); return; }
            try {
                showToast('正在加载预览...', 1000);
                const data = await api('/api/preview?path=' + encodeURIComponent(joinPath(currentPath, item.name)));
                if (data.base64) {
                    const binary = base64ToArrayBuffer(data.base64);
                    const blob = new Blob([binary], { type: item.mimeType || 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                } else {
                    showToast('预览失败');
                }
            } catch (e) {
                showToast('预览失败: ' + e.message);
            }
        }

        async function downloadFile(fileId, fileName) {
            try {
                showToast('正在准备下载...', 1500);
                const res = await fetch(API_BASE + '/api/download?fileId=' + encodeURIComponent(fileId));
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || '下载失败');
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                showToast('下载已开始');
            } catch (e) {
                showToast('下载失败: ' + e.message);
            }
        }

        async function shareFile(fileId, fileName) {
            try {
                showModal('<h2>🔗 分享文件</h2><p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">' + fileName + '</p><div class="share-link-box" id="shareLink">正在生成分享链接...</div><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="copyShareLink()">复制链接</button></div>');
                const data = await api('/api/share', { method:'POST', body: JSON.stringify({ fileId }) });
                const link = location.origin + '/s/' + data.shareId;
                document.getElementById('shareLink').textContent = link;
                document.getElementById('shareLink').dataset.link = link;
            } catch (e) {
                closeModal();
                showToast('分享失败: ' + e.message);
            }
        }

        function copyShareLink() {
            const el = document.getElementById('shareLink');
            const link = el?.dataset?.link || el?.textContent;
            if (link && link !== '正在生成分享链接...') {
                navigator.clipboard.writeText(link).then(() => showToast('链接已复制')).catch(() => showToast('复制失败，请手动复制'));
            }
        }

        async function editFile(fileId, fileName) {
            try {
                const path = joinPath(currentPath, fileName);
                showModal('<h2>✏️ 编辑文件</h2><p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">' + fileName + '</p><textarea id="editContent" style="width:100%;min-height:200px;border:1.5px solid var(--border);border-radius:8px;padding:10px;font-size:13px;font-family:monospace;resize:vertical;outline:none;margin-bottom:12px;"></textarea><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveEditFile(\\'' + fileId + '\\',\\'' + fileName + '\\')">保存</button></div>');
                const data = await api('/api/file-content?path=' + encodeURIComponent(path));
                if (data.base64) {
                    const content = atob(data.base64);
                    document.getElementById('editContent').value = content;
                }
            } catch (e) {
                closeModal();
                showToast('加载文件失败: ' + e.message);
            }
        }

        async function saveEditFile(fileId, fileName) {
            try {
                const content = document.getElementById('editContent').value;
                const base64 = btoa(unescape(encodeURIComponent(content)));
                const path = joinPath(currentPath, fileName);
                await api('/api/save-content', { method:'POST', body: JSON.stringify({ path, base64, fileId }) });
                closeModal();
                await loadTree();
                showToast('已保存');
            } catch (e) {
                showToast('保存失败: ' + e.message);
            }
        }

        function showUploadModal() {
            showModal('<h2>📤 上传文件</h2><div style="margin-bottom:12px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">上传到：</label><div style="display:flex;gap:8px;align-items:center;"><input type="text" id="uploadPath" value="' + currentPath + '" style="flex:1;" readonly><button class="btn btn-secondary" style="flex:0;padding:8px 10px;" onclick="chooseUploadDir()">选择</button></div></div><div class="upload-area" id="fileUploadArea"><div class="icon">📄</div><p>点击选择文件上传</p><input type="file" id="fileInput" multiple style="display:none;"></div><div class="upload-area" id="folderUploadArea" style="margin-top:8px;"><div class="icon">📁</div><p>点击选择文件夹上传</p><input type="file" id="folderInput" webkitdirectory multiple style="display:none;"></div><div id="filePreviewGrid" class="file-preview-grid hidden"></div><div id="uploadProgress" class="hidden" style="margin-top:12px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span id="uploadProgressText">准备上传...</span><span id="uploadProgressPct">0%</span></div><div class="progress-bar"><div class="fill" id="uploadProgressBar" style="width:0%"></div></div></div><div class="btn-row" style="margin-top:12px;"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" id="startUploadBtn" onclick="startUpload()" disabled>开始上传</button></div>');
            document.getElementById('fileUploadArea').onclick = () => document.getElementById('fileInput').click();
            document.getElementById('folderUploadArea').onclick = () => document.getElementById('folderInput').click();
            document.getElementById('fileInput').onchange = (e) => {
                pendingUploads = [];
                const files = Array.from(e.target.files);
                for (const f of files) pendingUploads.push({ file: f, relativePath: f.name });
                renderUploadPreview();
            };
            document.getElementById('folderInput').onchange = (e) => {
                pendingUploads = [];
                const files = Array.from(e.target.files);
                for (const f of files) pendingUploads.push({ file: f, relativePath: f.webkitRelativePath || f.name });
                renderUploadPreview();
            };
        }

        function chooseUploadDir() {
            showModal('<h2>📂 选择上传目录</h2><div id="dirList" style="max-height:300px;overflow-y:auto;">' + renderDirOptions() + '</div><div class="btn-row" style="margin-top:8px;"><button class="btn btn-secondary" onclick="closeModal()">取消</button></div>');
            document.querySelectorAll('.dir-option').forEach(el => {
                el.onclick = () => {
                    const path = el.dataset.path;
                    document.getElementById('uploadPath').value = path;
                    closeModal();
                };
            });
        }

        function renderDirOptions(currentPathStr = '', depth = 0) {
            let html = '';
            const items = currentPathStr === '' ? (fileTree?.children || []) : getChildrenOfPath(currentPathStr);
            const indent = '&nbsp;'.repeat(depth * 4);
            html += '<div class="dir-option" data-path="/" style="padding:8px;cursor:pointer;border-radius:6px;font-size:13px;">' + indent + '📁 / (根目录)</div>';
            if (fileTree && fileTree.children) {
                for (const item of fileTree.children) {
                    if (item.type === 'folder') {
                        html += '<div class="dir-option" data-path="/' + item.name + '" style="padding:8px;cursor:pointer;border-radius:6px;font-size:13px;">' + indent + '📁 ' + item.name + '</div>';
                        html += renderDirOptionsRecursive(item, '/' + item.name, depth + 1);
                    }
                }
            }
            return html;
        }

        function renderDirOptionsRecursive(folder, path, depth) {
            let html = '';
            const indent = '&nbsp;'.repeat(depth * 4);
            if (folder.children) {
                for (const item of folder.children) {
                    if (item.type === 'folder') {
                        html += '<div class="dir-option" data-path="' + path + '/' + item.name + '" style="padding:8px;cursor:pointer;border-radius:6px;font-size:13px;">' + indent + '📁 ' + item.name + '</div>';
                        html += renderDirOptionsRecursive(item, path + '/' + item.name, depth + 1);
                    }
                }
            }
            return html;
        }

        function getChildrenOfPath(path) {
            const parts = path.split('/').filter(Boolean);
            let current = fileTree;
            for (const part of parts) {
                current = current?.children?.find(c => c.name === part && c.type === 'folder');
                if (!current) return [];
            }
            return current.children || [];
        }

        function renderUploadPreview() {
            const grid = document.getElementById('filePreviewGrid');
            if (pendingUploads.length === 0) {
                grid.classList.add('hidden');
                document.getElementById('startUploadBtn').disabled = true;
                return;
            }
            grid.classList.remove('hidden');
            grid.innerHTML = '';
            for (const item of pendingUploads) {
                const div = document.createElement('div');
                div.className = 'file-preview-item';
                div.innerHTML = '<span class="fp-icon">' + getFileIcon({name: item.file.name, type:'file'}) + '</span>' + item.file.name + ' (' + formatSize(item.file.size) + ')';
                grid.appendChild(div);
            }
            document.getElementById('startUploadBtn').disabled = false;
        }

        async function startUpload() {
            if (pendingUploads.length === 0) { showToast('请先选择文件'); return; }
            const uploadPath = document.getElementById('uploadPath').value || '/';
            const startBtn = document.getElementById('startUploadBtn');
            startBtn.disabled = true;
            document.getElementById('uploadProgress').classList.remove('hidden');
            const progressBar = document.getElementById('uploadProgressBar');
            const progressText = document.getElementById('uploadProgressText');
            const progressPct = document.getElementById('uploadProgressPct');
            let totalSize = 0, uploadedSize = 0;
            for (const item of pendingUploads) totalSize += item.file.size;
            let completedCount = 0;
            for (const item of pendingUploads) {
                const file = item.file;
                const relativePath = item.relativePath;
                progressText.textContent = '正在上传: ' + file.name + ' (' + (completedCount + 1) + '/' + pendingUploads.length + ')';
                try {
                    await uploadSingleFile(file, relativePath, uploadPath, (progress) => {
                        const totalProgress = (uploadedSize + file.size * progress) / totalSize * 100;
                        progressBar.style.width = Math.min(totalProgress, 100) + '%';
                        progressPct.textContent = Math.round(Math.min(totalProgress, 100)) + '%';
                    });
                    uploadedSize += file.size;
                    completedCount++;
                } catch (e) {
                    showToast('上传 ' + file.name + ' 失败: ' + e.message);
                }
            }
            progressBar.style.width = '100%';
            progressBar.classList.add('completed');
            progressText.textContent = '上传完成 (' + completedCount + '/' + pendingUploads.length + ')';
            progressPct.textContent = '100%';
            setTimeout(() => { closeModal(); loadTree(); loadTasks(); }, 800);
            showToast('上传完成');
        }

        async function uploadSingleFile(file, relativePath, uploadPath, onProgress) {
            const CHUNK_THRESHOLD = 15 * 1024 * 1024;
            const CHUNK_SIZE = 18 * 1024 * 1024;
            const fileId = generateId();
            const fileBase64 = await arrayBufferToBase64(await file.arrayBuffer());
            if (file.size <= CHUNK_THRESHOLD) {
                onProgress(0.3);
                await api('/api/upload/single', {
                    method:'POST',
                    body: JSON.stringify({
                        fileId,
                        fileName: file.name,
                        relativePath,
                        uploadPath,
                        base64: fileBase64,
                        mimeType: file.type || 'application/octet-stream',
                        size: file.size
                    })
                });
                onProgress(1);
            } else {
                const chunks = Math.ceil(fileBase64.length / (CHUNK_SIZE * 1.37));
                const chunkList = [];
                for (let i = 0; i < chunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunkBlob = file.slice(start, end);
                    const chunkArrayBuffer = await chunkBlob.arrayBuffer();
                    const chunkBase64 = await arrayBufferToBase64(chunkArrayBuffer);
                    chunkList.push(chunkBase64);
                }
                await api('/api/upload/init', {
                    method:'POST',
                    body: JSON.stringify({
                        fileId,
                        fileName: file.name,
                        relativePath,
                        uploadPath,
                        chunks: chunkList.length,
                        chunkSize: CHUNK_SIZE,
                        mimeType: file.type || 'application/octet-stream',
                        size: file.size
                    })
                });
                for (let i = 0; i < chunkList.length; i++) {
                    await api('/api/upload/chunk', {
                        method:'POST',
                        body: JSON.stringify({ fileId, chunkIndex: i, base64: chunkList[i] })
                    });
                    onProgress((i + 1) / chunkList.length);
                }
                await api('/api/upload/complete', {
                    method:'POST',
                    body: JSON.stringify({ fileId, chunks: chunkList.length })
                });
            }
        }

        function showOfflineDownloadModal() {
            showModal('<h2>📥 离线下载</h2><p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">支持 HTTP/HTTPS 链接（BT/ED2K暂不支持）</p><input type="url" id="offlineUrl" placeholder="https://example.com/file.zip"><div style="margin-bottom:12px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">保存到：</label><input type="text" id="offlinePath" value="' + currentPath + '" readonly></div><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="startOfflineDownload()">开始下载</button></div>');
        }

        async function startOfflineDownload() {
            const url = document.getElementById('offlineUrl').value.trim();
            const savePath = document.getElementById('offlinePath').value || '/';
            if (!url) { showToast('请输入下载链接'); return; }
            if (!url.startsWith('http://') && !url.startsWith('https://')) { showToast('仅支持 HTTP/HTTPS 链接'); return; }
            try {
                closeModal();
                showToast('离线下载任务已创建');
                await api('/api/offline', { method:'POST', body: JSON.stringify({ url, savePath }) });
                loadTasks();
                setTimeout(() => { loadTree(); loadTasks(); }, 3000);
            } catch (e) {
                showToast('创建下载任务失败: ' + e.message);
            }
        }

        async function loadTasks() {
            try {
                const data = await api('/api/tasks');
                tasks = data.tasks || [];
                renderTasks();
            } catch (e) {
                tasks = [];
                renderTasks();
            }
        }

        function renderTasks() {
            const container = document.getElementById('taskList');
            if (tasks.length === 0) {
                container.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);text-align:center;padding:20px;">暂无任务</p>';
                return;
            }
            container.innerHTML = '';
            const sorted = [...tasks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            for (const task of sorted) {
                const div = document.createElement('div');
                div.className = 'task-item';
                const statusClass = task.status === 'completed' ? 'completed' : task.status === 'failed' ? 'failed' : '';
                const statusText = task.status === 'completed' ? '✅ 完成' : task.status === 'failed' ? '❌ 失败' : task.status === 'processing' ? '⏳ 处理中' : '⏸ 等待中';
                div.innerHTML = '<div class="task-name">' + (task.type === 'upload' ? '📤' : '📥') + ' ' + (task.name || task.url || '未知任务') + '</div><div class="task-status">' + statusText + (task.progress ? ' · ' + Math.round(task.progress) + '%' : '') + '</div><div class="progress-bar"><div class="fill ' + statusClass + '" style="width:' + (task.progress || 0) + '%"></div></div>' + (task.error ? '<div style="font-size:11px;color:var(--danger);margin-top:4px;">' + task.error + '</div>' : '');
                container.appendChild(div);
            }
        }

        function openTaskPanel() {
            document.getElementById('taskPanel').classList.add('open');
            document.getElementById('taskBackdrop').classList.add('open');
            loadTasks();
        }

        function closeTaskPanel() {
            document.getElementById('taskPanel').classList.remove('open');
            document.getElementById('taskBackdrop').classList.remove('open');
        }

        async function init() {
            await loadTree();
            await loadTasks();
            document.getElementById('fabBtn').onclick = () => {
                showModal('<h2>➕ 添加</h2><div style="display:flex;flex-direction:column;gap:8px;"><button class="btn btn-primary" onclick="closeModal();showUploadModal()">📤 上传文件</button><button class="btn btn-secondary" onclick="closeModal();showNewFolderModal()">📁 新建文件夹</button><button class="btn btn-secondary" onclick="closeModal();showNewFileModal()">📄 新建文本文件</button><button class="btn btn-secondary" onclick="closeModal();showOfflineDownloadModal()">📥 离线下载</button><button class="btn btn-secondary" onclick="closeModal();openTaskPanel()">📋 查看任务</button></div>');
            };
            document.getElementById('taskBtn').onclick = openTaskPanel;
            document.getElementById('closeTaskPanel').onclick = closeTaskPanel;
            document.getElementById('taskBackdrop').onclick = closeTaskPanel;
            setInterval(loadTasks, 5000);
        }

        init();
    <\/script>
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

// 工具函数
function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
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
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 根据文件ID选择KV索引
function getKvIndex(fileId, chunkIndex = null) {
  let hash = 0;
  const str = chunkIndex !== null ? fileId + ':' + chunkIndex : fileId;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 5;
}

// 文件树操作
async function getTree(env) {
  const tree = await env.FILE_STRUCTURE_KV.get('tree', 'json');
  return tree || { name: '/', type: 'folder', children: [] };
}

async function putTree(env, tree) {
  await env.FILE_STRUCTURE_KV.put('tree', JSON.stringify(tree));
}

function findItemByPathInTree(tree, path) {
  const parts = path.split('/').filter(Boolean);
  let current = tree;
  for (const part of parts) {
    if (!current.children) return null;
    current = current.children.find(c => c.name === part);
    if (!current) return null;
  }
  return current;
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
      // 创建缺失的文件夹
      folder = {
        id: 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
        name: part,
        type: 'folder',
        children: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      if (!current.children) current.children = [];
      current.children.push(folder);
    }
    current = folder;
  }
  const newFile = {
    id: fileId,
    name: fileName,
    type: 'file',
    size,
    mimeType,
    chunks,
    chunkSize,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  if (!current.children) current.children = [];
  // 检查是否已存在同名文件，若存在则替换
  const existingIndex = current.children.findIndex(c => c.name === fileName && c.type === 'file');
  if (existingIndex !== -1) {
    current.children[existingIndex] = newFile;
  } else {
    current.children.push(newFile);
  }
  await putTree(env, tree);
}

// 存储文件
async function storeSingleFile(env, fileId, base64) {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const kvIndex = getKvIndex(fileId);
  const kv = env[FILE_KV_BINDINGS[kvIndex]];
  await kv.put(`f:${fileId}`, arrayBuffer);
}

async function storeChunk(env, fileId, chunkIndex, base64) {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const kvIndex = getKvIndex(fileId, chunkIndex);
  const kv = env[FILE_KV_BINDINGS[kvIndex]];
  await kv.put(`f:${fileId}:chunk:${chunkIndex}`, arrayBuffer);
}

async function getFileArrayBuffer(env, item) {
  if (item.chunks <= 1) {
    const kvIndex = getKvIndex(item.id);
    const kv = env[FILE_KV_BINDINGS[kvIndex]];
    return await kv.get(`f:${item.id}`, 'arrayBuffer');
  } else {
    const chunks = item.chunks;
    const totalLength = item.size;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < chunks; i++) {
      const kvIndex = getKvIndex(item.id, i);
      const kv = env[FILE_KV_BINDINGS[kvIndex]];
      const chunkBuffer = await kv.get(`f:${item.id}:chunk:${i}`, 'arrayBuffer');
      if (!chunkBuffer) throw new Error('Missing chunk ' + i);
      const chunkBytes = new Uint8Array(chunkBuffer);
      result.set(chunkBytes, offset);
      offset += chunkBytes.length;
    }
    return result.buffer;
  }
}

async function getFileContentBase64(env, item) {
  const arrayBuffer = await getFileArrayBuffer(env, item);
  return arrayBufferToBase64(arrayBuffer);
}

async function deleteFileContent(env, fileId, chunks) {
  if (chunks <= 1) {
    const kvIndex = getKvIndex(fileId);
    const kv = env[FILE_KV_BINDINGS[kvIndex]];
    await kv.delete(`f:${fileId}`);
  } else {
    for (let i = 0; i < chunks; i++) {
      const kvIndex = getKvIndex(fileId, i);
      const kv = env[FILE_KV_BINDINGS[kvIndex]];
      await kv.delete(`f:${fileId}:chunk:${i}`);
    }
  }
}

// 任务管理
async function addTask(env, type, name, status, progress, error = '') {
  const tasks = await env.TASK_KV.get('tasks', 'json') || [];
  const task = {
    id: crypto.randomUUID(),
    type,
    name,
    status,
    progress,
    error,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  tasks.push(task);
  await env.TASK_KV.put('tasks', JSON.stringify(tasks));
  return task.id;
}

async function updateTask(env, taskId, status, progress, error = '') {
  const tasks = await env.TASK_KV.get('tasks', 'json') || [];
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    tasks[idx].status = status;
    tasks[idx].progress = progress;
    tasks[idx].error = error;
    tasks[idx].updatedAt = Date.now();
    await env.TASK_KV.put('tasks', JSON.stringify(tasks));
  }
}

// 离线下载处理（简化版，仅支持小文件）
async function handleOfflineDownload(env, url, savePath, taskId) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('下载失败: HTTP ' + response.status);
    }
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength > 25 * 1024 * 1024) {
      throw new Error('文件过大，超过25MB限制');
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new Error('文件内容为空');
    }
    // 提取文件名
    let fileName = 'download_' + Date.now();
    const disposition = response.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/i);
      if (match) fileName = match[1];
    } else {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const parts = pathname.split('/');
      if (parts.length > 0 && parts[parts.length - 1]) {
        fileName = decodeURIComponent(parts[parts.length - 1]);
      }
    }
    const fileId = 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    // 存储为单文件
    const kvIndex = getKvIndex(fileId);
    const kv = env[FILE_KV_BINDINGS[kvIndex]];
    await kv.put(`f:${fileId}`, arrayBuffer);
    // 添加到文件树
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    await addFileToTree(env, savePath, fileName, fileId, arrayBuffer.byteLength, mimeType, 1, 0);
    await updateTask(env, taskId, 'completed', 100);
  } catch (e) {
    await updateTask(env, taskId, 'failed', 0, e.message);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const headers = corsHeaders();

    // 处理 CORS 预检
    if (method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // 主页面
      if (path === '/' || path === '/index.html') {
        return new Response(HTML, {
          headers: { 'Content-Type': 'text/html;charset=UTF-8', ...headers },
        });
      }

      // API 路由
      if (path.startsWith('/api/')) {
        const apiPath = path.substring(4); // 去掉 '/api'
        let body = {};
        if (method === 'POST' || method === 'PUT') {
          try {
            body = await request.json();
          } catch (e) {
            // 忽略
          }
        }

        // 文件树
        if (apiPath === '/tree' && method === 'GET') {
          const tree = await getTree(env);
          return jsonResponse({ tree }, headers);
        }
        if (apiPath === '/tree' && method === 'PUT') {
          if (body.tree) {
            await putTree(env, body.tree);
            return jsonResponse({ success: true }, headers);
          }
          return jsonResponse({ error: 'Invalid tree' }, headers, 400);
        }

        // 单文件上传
        if (apiPath === '/upload/single' && method === 'POST') {
          const { fileId, fileName, uploadPath, base64, mimeType, size } = body;
          if (!fileId || !fileName || !base64) {
            return jsonResponse({ error: 'Missing fields' }, headers, 400);
          }
          try {
            await storeSingleFile(env, fileId, base64);
            await addFileToTree(env, uploadPath, fileName, fileId, size, mimeType, 1, 0);
            await addTask(env, 'upload', fileName, 'completed', 100);
            return jsonResponse({ success: true }, headers);
          } catch (e) {
            return jsonResponse({ error: e.message }, headers, 500);
          }
        }

        // 分片上传初始化
        if (apiPath === '/upload/init' && method === 'POST') {
          const { fileId, fileName, uploadPath, chunks, chunkSize, mimeType, size } = body;
          if (!fileId || !fileName || !chunks) {
            return jsonResponse({ error: 'Missing fields' }, headers, 400);
          }
          const taskId = await addTask(env, 'upload', fileName, 'processing', 0);
          // 存储元数据
          await env.FILE_STRUCTURE_KV.put('meta:' + fileId, JSON.stringify({
            fileName,
            uploadPath,
            mimeType,
            size,
            chunkSize,
            taskId
          }));
          return jsonResponse({ success: true, taskId }, headers);
        }

        // 分片上传
        if (apiPath === '/upload/chunk' && method === 'POST') {
          const { fileId, chunkIndex, base64 } = body;
          if (!fileId || chunkIndex === undefined || !base64) {
            return jsonResponse({ error: 'Missing fields' }, headers, 400);
          }
          try {
            await storeChunk(env, fileId, chunkIndex, base64);
            return jsonResponse({ success: true }, headers);
          } catch (e) {
            return jsonResponse({ error: e.message }, headers, 500);
          }
        }

        // 分片上传完成
        if (apiPath === '/upload/complete' && method === 'POST') {
          const { fileId, chunks } = body;
          if (!fileId || !chunks) {
            return jsonResponse({ error: 'Missing fields' }, headers, 400);
          }
          const metaKey = 'meta:' + fileId;
          const meta = await env.FILE_STRUCTURE_KV.get(metaKey, 'json');
          if (!meta) {
            return jsonResponse({ error: 'Upload metadata not found' }, headers, 400);
          }
          const { fileName, uploadPath, mimeType, size, chunkSize, taskId } = meta;
          await addFileToTree(env, uploadPath, fileName, fileId, size, mimeType, chunks, chunkSize || 0);
          await env.FILE_STRUCTURE_KV.delete(metaKey);
          if (taskId) {
            await updateTask(env, taskId, 'completed', 100);
          }
          return jsonResponse({ success: true }, headers);
        }

        // 删除文件内容
        if (apiPath === '/delete-content' && method === 'POST') {
          const { fileId, chunks } = body;
          if (!fileId) {
            return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          }
          try {
            await deleteFileContent(env, fileId, chunks);
            return jsonResponse({ success: true }, headers);
          } catch (e) {
            return jsonResponse({ error: e.message }, headers, 500);
          }
        }

        // 预览文件（返回 Base64）
        if (apiPath === '/preview' && method === 'GET') {
          const filePath = url.searchParams.get('path');
          if (!filePath) {
            return jsonResponse({ error: 'Missing path' }, headers, 400);
          }
          const tree = await getTree(env);
          const item = findItemByPathInTree(tree, filePath);
          if (!item || item.type !== 'file') {
            return jsonResponse({ error: 'File not found' }, headers, 404);
          }
          try {
            const base64 = await getFileContentBase64(env, item);
            return jsonResponse({ base64 }, headers);
          } catch (e) {
            return jsonResponse({ error: e.message }, headers, 500);
          }
        }

        // 下载文件（二进制流）
        if (apiPath === '/download' && method === 'GET') {
          const fileId = url.searchParams.get('fileId');
          if (!fileId) {
            return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          }
          const tree = await getTree(env);
          const item = findItemById(tree, fileId);
          if (!item || item.type !== 'file') {
            return jsonResponse({ error: 'File not found' }, headers, 404);
          }
          try {
            const buffer = await getFileArrayBuffer(env, item);
            return new Response(buffer, {
              headers: {
                'Content-Type': item.mimeType || 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="' + encodeURIComponent(item.name) + '"',
                ...headers,
              },
            });
          } catch (e) {
            return jsonResponse({ error: e.message }, headers, 500);
          }
        }

        // 获取文本内容（用于编辑）
        if (apiPath === '/file-content' && method === 'GET') {
          const filePath = url.searchParams.get('path');
          if (!filePath) {
            return jsonResponse({ error: 'Missing path' }, headers, 400);
          }
          const tree = await getTree(env);
          const item = findItemByPathInTree(tree, filePath);
          if (!item || item.type !== 'file') {
            return jsonResponse({ error: 'File not found' }, headers, 404);
          }
          try {
            const base64 = await getFileContentBase64(env, item);
            return jsonResponse({ base64 }, headers);
          } catch (e) {
            return jsonResponse({ error: e.message }, headers, 500);
          }
        }

        // 保存文本编辑
        if (apiPath === '/save-content' && method === 'POST') {
          const { path, base64, fileId } = body;
          if (!path || !base64 || !fileId) {
            return jsonResponse({ error: 'Missing fields' }, headers, 400);
          }
          const tree = await getTree(env);
          const item = findItemById(tree, fileId);
          if (!item) {
            return jsonResponse({ error: 'File not found' }, headers, 404);
          }
          try {
            // 删除旧内容
            await deleteFileContent(env, fileId, item.chunks);
            // 存储新内容
            await storeSingleFile(env, fileId, base64);
            // 更新元数据
            item.size = base64.length * 3 / 4;
            item.chunks = 1;
            item.chunkSize = 0;
            item.updatedAt = Date.now();
            await putTree(env, tree);
            return jsonResponse({ success: true }, headers);
          } catch (e) {
            return jsonResponse({ error: e.message }, headers, 500);
          }
        }

        // 创建分享
        if (apiPath === '/share' && method === 'POST') {
          const { fileId } = body;
          if (!fileId) {
            return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          }
          const shareId = crypto.randomUUID();
          await env.FILE_STRUCTURE_KV.put('share:' + shareId, fileId);
          return jsonResponse({ shareId }, headers);
        }

        // 离线下载
        if (apiPath === '/offline' && method === 'POST') {
          const { url, savePath } = body;
          if (!url || !savePath) {
            return jsonResponse({ error: 'Missing url or savePath' }, headers, 400);
          }
          const taskId = await addTask(env, 'download', url, 'processing', 0);
          // 异步处理
          ctx.waitUntil(handleOfflineDownload(env, url, savePath, taskId));
          return jsonResponse({ success: true, taskId }, headers);
        }

        // 任务列表
        if (apiPath === '/tasks' && method === 'GET') {
          const tasks = await env.TASK_KV.get('tasks', 'json') || [];
          return jsonResponse({ tasks }, headers);
        }

        // 分享链接访问（/s/:shareId）
        if (path.startsWith('/s/')) {
          const shareId = path.substring(3);
          const fileId = await env.FILE_STRUCTURE_KV.get('share:' + shareId);
          if (!fileId) {
            return new Response('分享链接不存在', { status: 404, headers });
          }
          // 重定向到下载
          return Response.redirect(new URL('/api/download?fileId=' + fileId, url.origin), 302);
        }

        // 未匹配的 API 路径
        return jsonResponse({ error: 'Not found' }, headers, 404);
      }

      // 其他路径
      return new Response('Not found', { status: 404, headers });
    } catch (e) {
      return jsonResponse({ error: e.message }, headers, 500);
    }
  }
};
