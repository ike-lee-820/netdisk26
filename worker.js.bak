// worker.js
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>云盘</title>
    <link rel="stylesheet" href="https://unpkg.com/@wangeditor/editor@latest/dist/css/style.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mui-player@latest/dist/mui-player.min.css">
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
        .refresh-btn {
            background:none; border:none; font-size:20px; cursor:pointer; padding:4px 8px;
            color:var(--text-secondary); flex-shrink:0;
        }
        .refresh-btn:hover { color:var(--accent); }
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
            margin-bottom:8px; display:flex; align-items:flex-start; gap:12px;
            box-shadow:var(--shadow); border:1px solid var(--border);
            transition:all 0.15s; cursor:pointer; position:relative;
        }
        .file-item:active { transform:scale(0.98); background:#fafafa; }
        .file-icon {
            width:40px; height:40px; border-radius:var(--radius-sm); display:flex;
            align-items:center; justify-content:center; font-size:20px; flex-shrink:0;
            background:var(--accent-light); margin-top:4px;
        }
        .file-icon.folder { background:#fef3c7; }
        .file-icon.image { background:#dcfce7; }
        .file-icon.video { background:#fee2e2; }
        .file-icon.text { background:#e0e7ff; }
        .file-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
        .file-name {
            font-size:14px; font-weight:600; word-break:break-all; line-height:1.3;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .file-meta {
            font-size:11px; color:var(--text-secondary);
            display:flex; gap:8px; flex-wrap:wrap;
        }
        .file-actions {
            display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;
        }
        .btn-text {
            padding:4px 10px; font-size:12px; border:1px solid var(--border);
            background:#f9fafb; border-radius:6px; cursor:pointer;
            color:var(--text-secondary); transition:all 0.15s;
            -webkit-tap-highlight-color:transparent;
        }
        .btn-text:hover {
            background:var(--accent-light); color:var(--accent); border-color:var(--accent);
        }
        .btn-text.danger:hover {
            background:#fee2e2; color:var(--danger); border-color:var(--danger);
        }
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
            .file-actions { gap:4px; }
            .btn-text { padding:3px 8px; font-size:11px; }
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
        /* 详情页样式 */
        .detail-page { max-width:800px; margin:0 auto; padding:16px; }
        .detail-card {
            background:var(--card); border-radius:var(--radius); padding:16px;
            box-shadow:var(--shadow); border:1px solid var(--border);
        }
        .detail-header { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
        .detail-title { font-size:18px; font-weight:700; word-break:break-all; }
        .detail-meta { font-size:13px; color:var(--text-secondary); margin-bottom:16px; }
        .detail-actions { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
        .preview-container { margin-top:16px; }
        .preview-container img { max-width:100%; border-radius:8px; }
        .preview-container video, .preview-container audio { width:100%; border-radius:8px; }
        .text-preview {
            white-space:pre-wrap; word-break:break-all; font-family:monospace;
            background:#f9fafb; padding:12px; border-radius:8px; max-height:400px; overflow-y:auto;
        }
        .editor-wrapper { border:1px solid #ccc; z-index:100; }
        .toolbar-container { border-bottom:1px solid #ccc; }
        .editor-container { height:400px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>云盘</h1>
        <button class="refresh-btn" id="refreshBtn" title="刷新">⟳</button>
        <div class="breadcrumb" id="breadcrumb"></div>
    </div>

    <div id="mainView">
        <div class="file-list" id="fileList"></div>
        <button class="task-btn" id="taskBtn" title="任务列表">任务</button>
        <button class="fab" id="fabBtn" title="添加">+</button>
    </div>

    <div id="detailView" class="hidden">
        <div class="detail-page">
            <button class="btn btn-secondary" id="backBtn" style="margin-bottom:12px;">返回</button>
            <div class="detail-card" id="detailCard"></div>
        </div>
    </div>

    <div class="task-panel-backdrop" id="taskBackdrop"></div>
    <div class="task-panel" id="taskPanel">
        <div class="task-panel-header">
            <h3>任务列表</h3>
            <button class="btn-text" id="closeTaskPanel">关闭</button>
        </div>
        <div id="taskList"></div>
    </div>

    <div id="modalContainer"></div>
    <div id="toastContainer"></div>

    <script src="https://unpkg.com/@wangeditor/editor@latest/dist/index.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mui-player@latest/dist/mui-player.min.js"></script>
    <script>
        // ========== 全局变量 ==========
        const API_BASE = '';
        let currentPath = '/';
        let fileTree = null;
        let tasks = [];
        let pendingUploads = [];
        let currentView = 'list';
        let currentDetailItem = null;

        // ========== 工具函数 ==========
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
            const sizes = ['B','KB','MB','GB','TB'];
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

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ========== 渲染函数 ==========
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
                sep.textContent = '>';
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
                
                let actionsHtml = '';
                if (item.type === 'file') {
                    actionsHtml += '<button class="btn-text" onclick="downloadFile(\'' + item.id + '\',\'' + item.name + '\')">下载</button>';
                    actionsHtml += '<button class="btn-text" onclick="shareFile(\'' + item.id + '\',\'' + item.name + '\')">分享</button>';
                    const ext = (item.name.split('.').pop() || '').toLowerCase();
                    if (['txt','md','json','js','ts','css','html','xml','log'].includes(ext)) {
                        actionsHtml += '<button class="btn-text" onclick="editFile(\'' + item.id + '\',\'' + item.name + '\')">编辑</button>';
                    }
                }
                actionsHtml += '<button class="btn-text" onclick="renameItem(\'' + item.id + '\',\'' + item.name + '\',\'' + item.type + '\')">重命名</button>';
                actionsHtml += '<button class="btn-text danger" onclick="deleteItem(\'' + item.id + '\',\'' + item.name + '\',\'' + item.type + '\')">删除</button>';

                div.innerHTML = '<div class="file-icon ' + iconClass + '">' + getFileIcon(item) + '</div>' +
                    '<div class="file-info">' +
                    '<div class="file-name">' + item.name + '</div>' +
                    '<div class="file-meta"><span>' + (item.type === 'folder' ? '文件夹' : formatSize(item.size)) + '</span>' +
                    '<span>' + formatTime(item.updatedAt || item.createdAt) + '</span>' +
                    (item.type === 'file' && item.chunks > 1 ? '<span>分片</span>' : '') +
                    '</div>' +
                    '<div class="file-actions" onclick="event.stopPropagation()">' + actionsHtml + '</div>' +
                    '</div>';

                div.onclick = () => {
                    if (item.type === 'folder') {
                        navigateTo(joinPath(currentPath, item.name));
                    } else {
                        openDetail(item);
                    }
                };
                container.appendChild(div);
            }
        }

        function navigateTo(path) {
            if (!path.startsWith('/')) path = '/' + path;
            currentPath = path;
            currentView = 'list';
            document.getElementById('mainView').classList.remove('hidden');
            document.getElementById('detailView').classList.add('hidden');
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

        async function refreshFileList() {
            await loadTree();
            if (currentView === 'list') {
                renderFileList();
                renderBreadcrumb();
            }
        }

        // ========== 文件操作 ==========
        function showNewFolderModal() { /* ... 同原有 ... */ }
        async function createFolder() { /* ... */ }
        function showNewFileModal() { /* ... */ }
        async function createNewFile() { /* ... */ }
        function renameItem(itemId, oldName, type) { /* ... */ }
        async function doRename(itemId, type) { /* ... */ }
        function deleteItem(itemId, name, type) { /* ... */ }
        async function doDelete(itemId) { /* ... */ }

        // ========== 上传相关 ==========
        function showUploadModal() { /* ... */ }
        function chooseUploadDir() { /* ... */ }
        function renderDirOptions() { /* ... */ }
        function renderDirOptionsRecursive(folder, path, depth) { /* ... */ }
        function getChildrenOfPath(path) { /* ... */ }
        function renderUploadPreview() { /* ... */ }
        async function startUpload() { /* ... */ }
        async function uploadSingleFile(file, relativePath, uploadPath, onProgress) { /* ... */ }

        // ========== 离线下载 ==========
        function showOfflineDownloadModal() { /* ... */ }
        async function startOfflineDownload() { /* ... */ }

        // ========== 任务管理 ==========
        async function loadTasks() { /* ... */ }
        function renderTasks() { /* ... */ }
        function openTaskPanel() { /* ... */ }
        function closeTaskPanel() { /* ... */ }

        // ========== 下载与分享 ==========
        async function downloadFile(fileId, fileName) { /* ... */ }
        async function shareFile(fileId, fileName) { /* ... */ }
        function copyShareLink() { /* ... */ }

        // ========== 编辑文件（快速入口） ==========
        async function editFile(fileId, fileName) {
            // 打开详情页并触发编辑
            const item = findItemInTree(fileTree, fileId);
            if (item) {
                await openDetail(item);
                editDetailText();
            }
        }

        // ========== 详情页 ==========
        async function openDetail(item) {
            currentDetailItem = item;
            currentView = 'detail';
            document.getElementById('mainView').classList.add('hidden');
            document.getElementById('detailView').classList.remove('hidden');
            await renderDetail();
        }

        function closeDetail() {
            currentView = 'list';
            currentDetailItem = null;
            document.getElementById('detailView').classList.add('hidden');
            document.getElementById('mainView').classList.remove('hidden');
            refreshFileList();
        }

        async function renderDetail() {
            const item = currentDetailItem;
            const card = document.getElementById('detailCard');
            let actionsHtml = '<button class="btn btn-primary" onclick="downloadDetailFile()">下载</button>' +
                '<button class="btn btn-secondary" onclick="shareDetailFile()">分享</button>' +
                '<button class="btn btn-secondary" onclick="getDetailDirectLink()">获取直链</button>' +
                '<button class="btn btn-secondary" onclick="renameDetailItem()">重命名</button>' +
                '<button class="btn btn-danger" onclick="deleteDetailItem()">删除</button>';
            const ext = (item.name.split('.').pop() || '').toLowerCase();
            if (['txt','md','json','js','ts','css','html','xml','log'].includes(ext)) {
                actionsHtml += '<button class="btn btn-secondary" onclick="editDetailText()">编辑</button>';
            }
            card.innerHTML = `
                <div class="detail-header">
                    <div class="file-icon ${getIconClass(item)}" style="width:48px;height:48px;font-size:24px;">${getFileIcon(item)}</div>
                    <div class="detail-title">${item.name}</div>
                </div>
                <div class="detail-meta">
                    <span>大小: ${formatSize(item.size)}</span> · 
                    <span>修改时间: ${formatTime(item.updatedAt || item.createdAt)}</span> · 
                    <span>类型: ${item.mimeType || '未知'}</span>
                </div>
                <div class="detail-actions">${actionsHtml}</div>
                <div class="preview-container" id="previewContainer"></div>
            `;
            await loadPreview(item);
        }

        async function loadPreview(item) {
            const container = document.getElementById('previewContainer');
            const ext = (item.name.split('.').pop() || '').toLowerCase();
            const textExts = ['txt','md','json','js','ts','css','html','xml','log'];
            const imageExts = ['jpg','jpeg','png','gif','webp','svg','bmp','ico'];
            const videoExts = ['mp4','webm','ogg','mov'];
            const audioExts = ['mp3','wav','ogg','flac','m4a'];

            if (imageExts.includes(ext)) {
                container.innerHTML = '<img src="/api/preview-image?fileId=' + item.id + '" alt="预览">';
            } else if (videoExts.includes(ext)) {
                container.innerHTML = '<div id="video-player"></div>';
                new MuiPlayer({
                    container: '#video-player',
                    title: item.name,
                    src: '/api/download?fileId=' + item.id,
                    autoplay: false,
                    width: '100%',
                    height: 'auto',
                });
            } else if (audioExts.includes(ext)) {
                container.innerHTML = '<audio controls src="/api/download?fileId=' + item.id + '" style="width:100%;"></audio>';
            } else if (textExts.includes(ext)) {
                try {
                    const data = await api('/api/file-content?path=' + encodeURIComponent(joinPath(currentPath, item.name)));
                    if (data.base64) {
                        const content = atob(data.base64);
                        container.innerHTML = '<div class="text-preview">' + escapeHtml(content) + '</div>';
                    }
                } catch (e) {
                    container.innerHTML = '<p>无法加载文本预览</p>';
                }
            } else {
                container.innerHTML = '<p>该文件类型不支持预览，请下载后查看。</p>';
            }
        }

        // 详情页操作
        function downloadDetailFile() { if (currentDetailItem) downloadFile(currentDetailItem.id, currentDetailItem.name); }
        function shareDetailFile() { if (currentDetailItem) shareFile(currentDetailItem.id, currentDetailItem.name); }
        function getDetailDirectLink() {
            if (currentDetailItem) {
                const link = location.origin + '/d/' + currentDetailItem.id;
                showModal('<h2>直链</h2><div class="share-link-box">' + link + '</div><button class="btn btn-primary" onclick="copyText(\'' + link + '\')">复制</button>');
            }
        }
        function copyText(text) { navigator.clipboard.writeText(text).then(() => showToast('已复制')); }
        function renameDetailItem() { if (currentDetailItem) renameItem(currentDetailItem.id, currentDetailItem.name, currentDetailItem.type); }
        function deleteDetailItem() { if (currentDetailItem) deleteItem(currentDetailItem.id, currentDetailItem.name, currentDetailItem.type); }

        function editDetailText() {
            const item = currentDetailItem;
            if (!item) return;
            showModal('<h2>编辑文本</h2><div id="editor-wrapper"><div id="toolbar-container"></div><div id="editor-container"></div></div><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveDetailText()">保存</button></div>');
            const { createEditor, createToolbar } = window.wangEditor;
            const editorConfig = { placeholder: '请输入内容...' };
            const editor = createEditor({
                selector: '#editor-container',
                html: '<p><br></p>',
                config: editorConfig,
                mode: 'default',
            });
            const toolbarConfig = {};
            createToolbar({
                editor,
                selector: '#toolbar-container',
                config: toolbarConfig,
                mode: 'default',
            });
            // 加载现有内容
            (async () => {
                try {
                    const path = joinPath(currentPath, item.name);
                    const data = await api('/api/file-content?path=' + encodeURIComponent(path));
                    if (data.base64) {
                        const content = atob(data.base64);
                        editor.setHtml(content);
                    }
                } catch (e) { showToast('加载内容失败'); }
            })();
            window._editor = editor;
        }

        async function saveDetailText() {
            const editor = window._editor;
            if (!editor) return;
            const html = editor.getHtml();
            const base64 = btoa(unescape(encodeURIComponent(html)));
            const item = currentDetailItem;
            if (item) {
                try {
                    await api('/api/save-content', {
                        method: 'POST',
                        body: JSON.stringify({ path: joinPath(currentPath, item.name), base64, fileId: item.id }),
                    });
                    closeModal();
                    await loadTree();
                    showToast('保存成功');
                    await renderDetail();
                } catch (e) {
                    showToast('保存失败: ' + e.message);
                }
            }
        }

        // ========== 初始化 ==========
        async function init() {
            await loadTree();
            await loadTasks();
            document.getElementById('refreshBtn').onclick = refreshFileList;
            document.getElementById('backBtn').onclick = closeDetail;
            document.getElementById('fabBtn').onclick = () => {
                showModal('<h2>添加</h2><div style="display:flex;flex-direction:column;gap:8px;">' +
                    '<button class="btn btn-primary" onclick="closeModal();showUploadModal()">上传文件</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();showNewFolderModal()">新建文件夹</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();showNewFileModal()">新建文本文件</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();showOfflineDownloadModal()">离线下载</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();openTaskPanel()">查看任务</button></div>');
            };
            document.getElementById('taskBtn').onclick = openTaskPanel;
            document.getElementById('closeTaskPanel').onclick = closeTaskPanel;
            document.getElementById('taskBackdrop').onclick = closeTaskPanel;
            // 任务自动刷新
            setInterval(async () => {
                const oldTasks = JSON.stringify(tasks);
                await loadTasks();
                const newTasks = JSON.stringify(tasks);
                if (oldTasks !== newTasks) {
                    const hasCompleted = tasks.some(t => t.status === 'completed' || t.status === 'failed');
                    if (hasCompleted) {
                        await refreshFileList();
                    }
                }
            }, 5000);
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

// 文件树
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

// 存储
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

function streamFile(env, item) {
  if (item.chunks <= 1) {
    return getFileArrayBuffer(env, item).then(buffer => new Response(buffer, {
      headers: {
        'Content-Type': item.mimeType || 'application/octet-stream',
        'Content-Length': item.size,
        'Content-Disposition': 'attachment; filename="' + encodeURIComponent(item.name) + '"',
      },
    }));
  }
  let chunkIndex = 0;
  const totalChunks = item.chunks;
  const stream = new ReadableStream({
    async pull(controller) {
      if (chunkIndex >= totalChunks) { controller.close(); return; }
      try {
        const kvIndex = getKvIndex(item.id, chunkIndex);
        const kv = env[FILE_KV_BINDINGS[kvIndex]];
        const chunkBuffer = await kv.get(`f:${item.id}:chunk:${chunkIndex}`, 'arrayBuffer');
        if (!chunkBuffer) throw new Error('Missing chunk ' + chunkIndex);
        controller.enqueue(new Uint8Array(chunkBuffer));
        chunkIndex++;
      } catch (e) { controller.error(e); }
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': item.mimeType || 'application/octet-stream',
      'Content-Length': item.size,
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(item.name) + '"',
    },
  });
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

// 任务
async function addTask(env, type, name, status, progress, error = '') {
  const tasks = await env.TASK_KV.get('tasks', 'json') || [];
  const task = { id: crypto.randomUUID(), type, name, status, progress, error, createdAt: Date.now(), updatedAt: Date.now() };
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

// 离线下载
async function handleOfflineDownload(env, url, savePath, taskId) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('下载失败: HTTP ' + response.status);
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength > 25 * 1024 * 1024) throw new Error('文件过大，超过25MB限制');
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) throw new Error('文件内容为空');
    let fileName = 'download_' + Date.now();
    const disposition = response.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/i);
      if (match) fileName = match[1];
    } else {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/');
      if (parts.length > 0 && parts[parts.length - 1]) fileName = decodeURIComponent(parts[parts.length - 1]);
    }
    const fileId = 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2,8);
    const kvIndex = getKvIndex(fileId);
    const kv = env[FILE_KV_BINDINGS[kvIndex]];
    await kv.put(`f:${fileId}`, arrayBuffer);
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    await addFileToTree(env, savePath, fileName, fileId, arrayBuffer.byteLength, mimeType, 1, 0);
    await updateTask(env, taskId, 'completed', 100);
  } catch (e) {
    await updateTask(env, taskId, 'failed', 0, e.message);
  }
}

// 导出 fetch 处理函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const headers = corsHeaders();

    if (method === 'OPTIONS') return new Response(null, { headers });

    try {
      // 主页面
      if (path === '/' || path === '/index.html') {
        return new Response(HTML, {
          headers: { 'Content-Type': 'text/html;charset=UTF-8', ...headers },
        });
      }

      // 直链 /d/:fileId
      if (path.startsWith('/d/')) {
        const fileId = path.substring(3);
        const tree = await getTree(env);
        const item = findItemById(tree, fileId);
        if (!item || item.type !== 'file') return new Response('File not found', { status: 404, headers });
        try { return await streamFile(env, item); } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
      }

      // 分享链接 /s/:shareId
      if (path.startsWith('/s/')) {
        const shareId = path.substring(3);
        const fileId = await env.FILE_STRUCTURE_KV.get('share:' + shareId);
        if (!fileId) return new Response('Share link invalid', { status: 404, headers });
        const tree = await getTree(env);
        const item = findItemById(tree, fileId);
        if (!item || item.type !== 'file') return new Response('File not found', { status: 404, headers });
        try { return await streamFile(env, item); } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
      }

      // API
      if (path.startsWith('/api/')) {
        const apiPath = path.substring(4);
        let body = {};
        if (method === 'POST' || method === 'PUT') {
          try { body = await request.json(); } catch (e) {}
        }

        // 文件树
        if (apiPath === '/tree' && method === 'GET') {
          const tree = await getTree(env);
          return jsonResponse({ tree }, headers);
        }
        if (apiPath === '/tree' && method === 'PUT') {
          if (body.tree) { await putTree(env, body.tree); return jsonResponse({ success: true }, headers); }
          return jsonResponse({ error: 'Invalid tree' }, headers, 400);
        }

        // 单文件上传
        if (apiPath === '/upload/single' && method === 'POST') {
          const { fileId, fileName, uploadPath, base64, mimeType, size } = body;
          if (!fileId || !fileName || !base64) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          try {
            await storeSingleFile(env, fileId, base64);
            await addFileToTree(env, uploadPath, fileName, fileId, size, mimeType, 1, 0);
            await addTask(env, 'upload', fileName, 'completed', 100);
            return jsonResponse({ success: true }, headers);
          } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        // 分片上传初始化
        if (apiPath === '/upload/init' && method === 'POST') {
          const { fileId, fileName, uploadPath, chunks, chunkSize, mimeType, size } = body;
          if (!fileId || !fileName || !chunks) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          const taskId = await addTask(env, 'upload', fileName, 'processing', 0);
          await env.FILE_STRUCTURE_KV.put('meta:' + fileId, JSON.stringify({ fileName, uploadPath, mimeType, size, chunkSize, taskId }));
          return jsonResponse({ success: true, taskId }, headers);
        }

        // 分片上传
        if (apiPath === '/upload/chunk' && method === 'POST') {
          const { fileId, chunkIndex, base64 } = body;
          if (!fileId || chunkIndex === undefined || !base64) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          try { await storeChunk(env, fileId, chunkIndex, base64); return jsonResponse({ success: true }, headers); }
          catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        // 分片上传完成
        if (apiPath === '/upload/complete' && method === 'POST') {
          const { fileId, chunks } = body;
          if (!fileId || !chunks) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          const meta = await env.FILE_STRUCTURE_KV.get('meta:' + fileId, 'json');
          if (!meta) return jsonResponse({ error: 'Upload metadata not found' }, headers, 400);
          const { fileName, uploadPath, mimeType, size, chunkSize, taskId } = meta;
          await addFileToTree(env, uploadPath, fileName, fileId, size, mimeType, chunks, chunkSize || 0);
          await env.FILE_STRUCTURE_KV.delete('meta:' + fileId);
          if (taskId) await updateTask(env, taskId, 'completed', 100);
          return jsonResponse({ success: true }, headers);
        }

        // 删除文件内容
        if (apiPath === '/delete-content' && method === 'POST') {
          const { fileId, chunks } = body;
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          try { await deleteFileContent(env, fileId, chunks); return jsonResponse({ success: true }, headers); }
          catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        // 预览文件（返回 Base64）
        if (apiPath === '/preview' && method === 'GET') {
          const filePath = url.searchParams.get('path');
          if (!filePath) return jsonResponse({ error: 'Missing path' }, headers, 400);
          const tree = await getTree(env);
          const item = findItemByPathInTree(tree, filePath);
          if (!item || item.type !== 'file') return jsonResponse({ error: 'File not found' }, headers, 404);
          try {
            const base64 = await getFileContentBase64(env, item);
            return jsonResponse({ base64 }, headers);
          } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        // 预览图片（直接返回二进制）
        if (apiPath === '/preview-image' && method === 'GET') {
          const fileId = url.searchParams.get('fileId');
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          const tree = await getTree(env);
          const item = findItemById(tree, fileId);
          if (!item || item.type !== 'file') return jsonResponse({ error: 'File not found' }, headers, 404);
          const buffer = await getFileArrayBuffer(env, item);
          return new Response(buffer, {
            headers: {
              'Content-Type': item.mimeType || 'application/octet-stream',
              'Cache-Control': 'public, max-age=3600',
              ...headers,
            },
          });
        }

        // 下载文件
        if (apiPath === '/download' && method === 'GET') {
          const fileId = url.searchParams.get('fileId');
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          const tree = await getTree(env);
          const item = findItemById(tree, fileId);
          if (!item || item.type !== 'file') return jsonResponse({ error: 'File not found' }, headers, 404);
          try { return await streamFile(env, item); } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        // 获取文本内容
        if (apiPath === '/file-content' && method === 'GET') {
          const filePath = url.searchParams.get('path');
          if (!filePath) return jsonResponse({ error: 'Missing path' }, headers, 400);
          const tree = await getTree(env);
          const item = findItemByPathInTree(tree, filePath);
          if (!item || item.type !== 'file') return jsonResponse({ error: 'File not found' }, headers, 404);
          try {
            const base64 = await getFileContentBase64(env, item);
            return jsonResponse({ base64 }, headers);
          } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        // 保存文本编辑
        if (apiPath === '/save-content' && method === 'POST') {
          const { path, base64, fileId } = body;
          if (!path || !base64 || !fileId) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          const tree = await getTree(env);
          const item = findItemById(tree, fileId);
          if (!item) return jsonResponse({ error: 'File not found' }, headers, 404);
          try {
            await deleteFileContent(env, fileId, item.chunks);
            await storeSingleFile(env, fileId, base64);
            item.size = base64.length * 3 / 4;
            item.chunks = 1;
            item.chunkSize = 0;
            item.updatedAt = Date.now();
            await putTree(env, tree);
            return jsonResponse({ success: true }, headers);
          } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        // 创建分享
        if (apiPath === '/share' && method === 'POST') {
          const { fileId } = body;
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          const shareId = crypto.randomUUID();
          await env.FILE_STRUCTURE_KV.put('share:' + shareId, fileId);
          return jsonResponse({ shareId }, headers);
        }

        // 离线下载
        if (apiPath === '/offline' && method === 'POST') {
          const { url, savePath } = body;
          if (!url || !savePath) return jsonResponse({ error: 'Missing url or savePath' }, headers, 400);
          const taskId = await addTask(env, 'download', url, 'processing', 0);
          ctx.waitUntil(handleOfflineDownload(env, url, savePath, taskId));
          return jsonResponse({ success: true, taskId }, headers);
        }

        // 任务列表
        if (apiPath === '/tasks' && method === 'GET') {
          const tasks = await env.TASK_KV.get('tasks', 'json') || [];
          return jsonResponse({ tasks }, headers);
        }

        return jsonResponse({ error: 'Not found' }, headers, 404);
      }

      return new Response('Not found', { status: 404, headers });
    } catch (e) {
      return jsonResponse({ error: e.message }, headers, 500);
    }
  }
};
