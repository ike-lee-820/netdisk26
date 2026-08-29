// worker.js
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>云盘</title>
    <!-- 第三方库 CSS -->
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
        .refresh-btn {
            background:none; border:none; font-size:20px; cursor:pointer; padding:4px 8px;
            color:var(--text-secondary); flex-shrink:0;
        }
        .refresh-btn:hover { color:var(--accent); }
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
        .file-icon.folder { background:#fef3c7; }
        .file-icon.image { background:#dcfce7; }
        .file-icon.video { background:#fee2e2; }
        .file-icon.text { background:#e0e7ff; }
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
        .task-panel {
            position:fixed; top:0; right:0; bottom:0; width:320px; max-width:90vw;
            background:var(--card); z-index:250; box-shadow:-4px 0 20px rgba(0,0,0,0.1);
            transform:translateX(100%); transition:transform 0.3s ease; overflow-y:auto; padding:16px;
        }
        .task-panel.open { transform:translateX(0); }
        .task-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .task-item {
            padding:10px; border-radius:var(--radius-sm); background:#f9fafb;
            margin-bottom:8px; border:1px solid var(--border);
        }
        .task-name { font-size:13px; font-weight:600; word-break:break-all; }
        .task-status { font-size:11px; color:var(--text-secondary); margin-top:4px; }
        .progress-bar { height:4px; background:#e5e7eb; border-radius:2px; margin-top:6px; overflow:hidden; }
        .progress-fill { height:100%; background:var(--accent); border-radius:2px; }
        .progress-fill.completed { background:var(--success); }
        .progress-fill.failed { background:var(--danger); }
        .task-backdrop {
            position:fixed; inset:0; background:rgba(0,0,0,0.3); z-index:240;
            opacity:0; pointer-events:none; transition:opacity 0.3s;
        }
        .task-backdrop.open { opacity:1; pointer-events:auto; }
        /* 详情页 */
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
        @media (max-width:480px) {
            .file-item { padding:10px 12px; }
            .btn-text { padding:3px 8px; font-size:11px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>云盘</h1>
        <button class="refresh-btn" id="refreshBtn" title="刷新">⟳</button>
        <div class="breadcrumb" id="breadcrumb"></div>
    </div>

    <!-- 主视图 -->
    <div id="mainView">
        <div class="file-list" id="fileList"></div>
        <button class="fab" id="fabBtn" title="添加">+</button>
    </div>

    <!-- 详情页视图 -->
    <div id="detailView" class="hidden">
        <div class="detail-page">
            <button class="btn btn-secondary" id="backBtn" style="margin-bottom:12px;">返回</button>
            <div class="detail-card" id="detailCard"></div>
        </div>
    </div>

    <!-- 任务面板 -->
    <div class="task-backdrop" id="taskBackdrop"></div>
    <div class="task-panel" id="taskPanel">
        <div class="task-panel-header">
            <h3>任务列表</h3>
            <button class="btn-text" id="closeTaskBtn">关闭</button>
        </div>
        <div id="taskList"></div>
    </div>

    <div id="modalContainer"></div>
    <div id="toastContainer"></div>

    <!-- 第三方库 JS -->
    <script src="https://unpkg.com/@wangeditor/editor@latest/dist/index.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mui-player@latest/dist/mui-player.min.js"></script>
    <script>
        // ==================== 全局变量 ====================
        var API_BASE = '';
        var currentPath = '/';
        var fileTree = null;
        var tasks = [];
        var pendingUploads = [];
        var currentView = 'list';
        var currentDetailItem = null;

        // ==================== 工具函数 ====================
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
            if (['txt','md','json','js','ts','css','html','xml','yml','yaml','log'].indexOf(ext) !== -1) return '📄';
            if (['zip','rar','7z','tar','gz','bz2'].indexOf(ext) !== -1) return '📦';
            if (['pdf','doc','docx','xls','xlsx','ppt','pptx'].indexOf(ext) !== -1) return '📑';
            return '📎';
        }

        function getIconClass(item) {
            if (item.type === 'folder') return 'folder';
            var ext = (item.name.split('.').pop() || '').toLowerCase();
            if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].indexOf(ext) !== -1) return 'image';
            if (['mp4','webm','avi','mov','mkv','flv'].indexOf(ext) !== -1) return 'video';
            if (['txt','md','json','js','ts','css','html','xml'].indexOf(ext) !== -1) return 'text';
            return '';
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

        function base64ToArrayBuffer(base64) {
            var binary = atob(base64);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        function api(path, options) {
            options = options || {};
            var fetchOptions = {
                method: options.method || 'GET',
                headers: { 'Content-Type': 'application/json' },
            };
            if (options.body) fetchOptions.body = JSON.stringify(options.body);
            return fetch(API_BASE + path, fetchOptions).then(function(res) {
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

        function findItemInTree(tree, itemId) {
            if (!tree) return null;
            if (tree.id === itemId) return tree;
            if (tree.children) {
                for (var i = 0; i < tree.children.length; i++) {
                    var found = findItemInTree(tree.children[i], itemId);
                    if (found) return found;
                }
            }
            return null;
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

        function escapeHtml(text) {
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ==================== 渲染函数 ====================
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
                var iconClass = getIconClass(item);
                var actionsHtml = '';
                if (item.type === 'file') {
                    actionsHtml += '<button class="btn-text" onclick="downloadFile(\'' + item.id + '\',\'' + item.name + '\')">下载</button>';
                    actionsHtml += '<button class="btn-text" onclick="shareFile(\'' + item.id + '\',\'' + item.name + '\')">分享</button>';
                    var ext = (item.name.split('.').pop() || '').toLowerCase();
                    if (['txt','md','json','js','ts','css','html','xml','log'].indexOf(ext) !== -1) {
                        actionsHtml += '<button class="btn-text" onclick="editFile(\'' + item.id + '\',\'' + item.name + '\')">编辑</button>';
                    }
                }
                actionsHtml += '<button class="btn-text" onclick="renameItem(\'' + item.id + '\',\'' + item.name + '\',\'' + item.type + '\')">重命名</button>';
                actionsHtml += '<button class="btn-text danger" onclick="deleteItem(\'' + item.id + '\',\'' + item.name + '\',\'' + item.type + '\')">删除</button>';
                div.innerHTML = '<div class="file-icon ' + iconClass + '">' + getFileIcon(item) + '</div>' +
                    '<div class="file-info">' +
                    '<div class="file-name">' + item.name + '</div>' +
                    '<div class="file-meta"><span>' + (item.type === 'folder' ? '文件夹' : formatSize(item.size)) + '</span><span>' + formatTime(item.updatedAt || item.createdAt) + '</span>' +
                    (item.type === 'file' && item.chunks > 1 ? '<span>分片</span>' : '') +
                    '</div>' +
                    '<div class="file-actions" onclick="event.stopPropagation()">' + actionsHtml + '</div>' +
                    '</div>';
                div.onclick = (function(item) {
                    return function() {
                        if (item.type === 'folder') {
                            navigateTo(joinPath(currentPath, item.name));
                        } else {
                            openDetail(item);
                        }
                    };
                })(item);
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

        function refreshFileList() {
            loadTree().then(function() {
                if (currentView === 'list') {
                    renderFileList();
                    renderBreadcrumb();
                }
            });
        }

        // ==================== 模态框 ====================
        function showModal(html) {
            var container = document.getElementById('modalContainer');
            container.innerHTML = '<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>';
        }

        function closeModal() {
            document.getElementById('modalContainer').innerHTML = '';
        }

        // ==================== 文件操作 ====================
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

        function showNewFileModal() {
            showModal('<h2>新建文本文件</h2><input type="text" id="newFileName" placeholder="文件名（如 note.txt）"><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="createNewFile()">创建</button></div>');
        }

        function createNewFile() {
            var name = document.getElementById('newFileName').value.trim();
            if (!name) { showToast('请输入文件名'); return; }
            var items = getCurrentFolderItems();
            for (var i = 0; i < items.length; i++) {
                if (items[i].name === name) { showToast('同名文件已存在'); return; }
            }
            var fileId = generateId();
            var newFile = { id: fileId, name: name, type:'file', size:0, mimeType:'text/plain', chunks:0, chunkSize:0, createdAt: Date.now(), updatedAt: Date.now() };
            var target = fileTree;
            var parts = currentPath.split('/').filter(Boolean);
            for (var j = 0; j < parts.length; j++) {
                target = target.children.find(function(c) { return c.name === parts[j] && c.type === 'folder'; });
            }
            if (!target.children) target.children = [];
            target.children.push(newFile);
            saveTree().then(function() {
                closeModal();
                renderFileList();
                showToast('文件已创建');
            });
        }

        function renameItem(itemId, oldName, type) {
            showModal('<h2>重命名</h2><input type="text" id="renameInput" value="' + oldName + '"><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doRename(\'' + itemId + '\')">确定</button></div>');
        }

        function doRename(itemId) {
            var newName = document.getElementById('renameInput').value.trim();
            if (!newName) { showToast('请输入新名称'); return; }
            var item = findItemInTree(fileTree, itemId);
            if (!item) { showToast('未找到文件'); return; }
            item.name = newName;
            item.updatedAt = Date.now();
            saveTree().then(function() {
                closeModal();
                renderFileList();
                showToast('重命名成功');
                if (currentView === 'detail' && currentDetailItem && currentDetailItem.id === itemId) {
                    renderDetail();
                }
            });
        }

        function deleteItem(itemId, name, type) {
            if (confirm('确定要删除 ' + name + ' 吗？')) {
                var item = findItemInTree(fileTree, itemId);
                if (item && item.type === 'file' && item.chunks > 0) {
                    api('/api/delete-content', { method:'POST', body: { fileId: item.id, chunks: item.chunks } }).catch(function(){});
                }
                removeItemFromTree(fileTree, itemId);
                saveTree().then(function() {
                    renderFileList();
                    showToast('已删除');
                    if (currentView === 'detail' && currentDetailItem && currentDetailItem.id === itemId) {
                        closeDetail();
                    }
                });
            }
        }

        // ==================== 上传 ====================
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
            var fileId = generateId();
            return arrayBufferToBase64(file).then(function(base64) {
                return api('/api/upload/single', {
                    method:'POST',
                    body: { fileId: fileId, fileName: fileName, uploadPath: uploadPath, base64: base64, mimeType: file.type || 'application/octet-stream', size: file.size }
                });
            });
        }

        // ==================== 下载与分享 ====================
        function downloadFile(fileId, fileName) {
            window.location.href = '/api/download?fileId=' + encodeURIComponent(fileId);
        }

        function shareFile(fileId, fileName) {
            api('/api/share', { method:'POST', body: { fileId: fileId } }).then(function(data) {
                var link = location.origin + '/s/' + data.shareId;
                showModal('<h2>分享链接</h2><div class="share-link-box">' + link + '</div><button class="btn btn-primary" onclick="closeModal()">关闭</button>');
            });
        }

        // ==================== 离线下载 ====================
        function showOfflineDownloadModal() {
            showModal('<h2>离线下载</h2><input type="url" id="offlineUrl" placeholder="https://example.com/file.zip"><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="startOfflineDownload()">开始下载</button></div>');
        }

        function startOfflineDownload() {
            var url = document.getElementById('offlineUrl').value.trim();
            if (!url) { showToast('请输入下载链接'); return; }
            var savePath = currentPath;
            closeModal();
            api('/api/offline', { method:'POST', body: { url: url, savePath: savePath } }).then(function() {
                showToast('离线下载任务已创建');
                loadTasks();
            }).catch(function(e) {
                showToast('创建任务失败: ' + e.message);
            });
        }

        // ==================== 任务管理 ====================
        function loadTasks() {
            return api('/api/tasks').then(function(data) {
                tasks = data.tasks || [];
                renderTasks();
            });
        }

        function renderTasks() {
            var container = document.getElementById('taskList');
            if (tasks.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">暂无任务</p>';
                return;
            }
            container.innerHTML = '';
            var sorted = tasks.slice().sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            for (var i = 0; i < sorted.length; i++) {
                var task = sorted[i];
                var statusClass = task.status === 'completed' ? 'completed' : task.status === 'failed' ? 'failed' : '';
                var statusText = task.status === 'completed' ? '完成' : task.status === 'failed' ? '失败' : task.status === 'processing' ? '处理中' : '等待中';
                var div = document.createElement('div');
                div.className = 'task-item';
                div.innerHTML = '<div class="task-name">' + (task.type === 'upload' ? '上传' : '下载') + ' ' + (task.name || task.url || '未知') + '</div>' +
                    '<div class="task-status">' + statusText + (task.progress ? ' · ' + Math.round(task.progress) + '%' : '') + '</div>' +
                    '<div class="progress-bar"><div class="progress-fill ' + statusClass + '" style="width:' + (task.progress || 0) + '%"></div></div>';
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

        // ==================== 详情页 ====================
        function openDetail(item) {
            currentDetailItem = item;
            currentView = 'detail';
            document.getElementById('mainView').classList.add('hidden');
            document.getElementById('detailView').classList.remove('hidden');
            renderDetail();
        }

        function closeDetail() {
            currentView = 'list';
            currentDetailItem = null;
            document.getElementById('detailView').classList.add('hidden');
            document.getElementById('mainView').classList.remove('hidden');
            refreshFileList();
        }

        function renderDetail() {
            var item = currentDetailItem;
            var card = document.getElementById('detailCard');
            var actionsHtml = '<button class="btn btn-primary" onclick="downloadDetailFile()">下载</button>' +
                '<button class="btn btn-secondary" onclick="shareDetailFile()">分享</button>' +
                '<button class="btn btn-secondary" onclick="getDetailDirectLink()">获取直链</button>' +
                '<button class="btn btn-secondary" onclick="renameDetailItem()">重命名</button>' +
                '<button class="btn btn-danger" onclick="deleteDetailItem()">删除</button>';
            var ext = (item.name.split('.').pop() || '').toLowerCase();
            if (['txt','md','json','js','ts','css','html','xml','log'].indexOf(ext) !== -1) {
                actionsHtml += '<button class="btn btn-secondary" onclick="editDetailText()">编辑</button>';
            }
            card.innerHTML = '<div class="detail-header">' +
                '<div class="file-icon ' + getIconClass(item) + '" style="width:48px;height:48px;font-size:24px;">' + getFileIcon(item) + '</div>' +
                '<div class="detail-title">' + item.name + '</div>' +
                '</div>' +
                '<div class="detail-meta">' +
                '<span>大小: ' + formatSize(item.size) + '</span> · ' +
                '<span>修改时间: ' + formatTime(item.updatedAt || item.createdAt) + '</span> · ' +
                '<span>类型: ' + (item.mimeType || '未知') + '</span>' +
                '</div>' +
                '<div class="detail-actions">' + actionsHtml + '</div>' +
                '<div class="preview-container" id="previewContainer"></div>';
            loadPreview(item);
        }

        function loadPreview(item) {
            var container = document.getElementById('previewContainer');
            var ext = (item.name.split('.').pop() || '').toLowerCase();
            var textExts = ['txt','md','json','js','ts','css','html','xml','log'];
            var imageExts = ['jpg','jpeg','png','gif','webp','svg','bmp','ico'];
            var videoExts = ['mp4','webm','ogg','mov'];
            var audioExts = ['mp3','wav','ogg','flac','m4a'];

            if (imageExts.indexOf(ext) !== -1) {
                container.innerHTML = '<img src="/api/preview-image?fileId=' + item.id + '" alt="预览">';
            } else if (videoExts.indexOf(ext) !== -1) {
                container.innerHTML = '<div id="video-player"></div>';
                new MuiPlayer({
                    container: '#video-player',
                    title: item.name,
                    src: '/api/download?fileId=' + item.id,
                    autoplay: false,
                    width: '100%',
                    height: 'auto',
                });
            } else if (audioExts.indexOf(ext) !== -1) {
                container.innerHTML = '<audio controls src="/api/download?fileId=' + item.id + '" style="width:100%;"></audio>';
            } else if (textExts.indexOf(ext) !== -1) {
                api('/api/file-content?path=' + encodeURIComponent(joinPath(currentPath, item.name))).then(function(data) {
                    if (data.base64) {
                        var content = atob(data.base64);
                        container.innerHTML = '<div class="text-preview">' + escapeHtml(content) + '</div>';
                    }
                }).catch(function() {
                    container.innerHTML = '<p>无法加载文本预览</p>';
                });
            } else {
                container.innerHTML = '<p>该文件类型不支持预览，请下载后查看。</p>';
            }
        }

        function downloadDetailFile() { if (currentDetailItem) downloadFile(currentDetailItem.id, currentDetailItem.name); }
        function shareDetailFile() { if (currentDetailItem) shareFile(currentDetailItem.id, currentDetailItem.name); }
        function getDetailDirectLink() {
            if (currentDetailItem) {
                var link = location.origin + '/d/' + currentDetailItem.id;
                showModal('<h2>直链</h2><div class="share-link-box">' + link + '</div><button class="btn btn-primary" onclick="closeModal()">关闭</button>');
            }
        }
        function renameDetailItem() { if (currentDetailItem) renameItem(currentDetailItem.id, currentDetailItem.name, currentDetailItem.type); }
        function deleteDetailItem() { if (currentDetailItem) deleteItem(currentDetailItem.id, currentDetailItem.name, currentDetailItem.type); }

        function editFile(fileId, fileName) {
            var item = findItemInTree(fileTree, fileId);
            if (item) {
                openDetail(item);
                editDetailText();
            }
        }

        function editDetailText() {
            var item = currentDetailItem;
            if (!item) return;
            showModal('<h2>编辑文本</h2><div id="editor-wrapper"><div id="toolbar-container"></div><div id="editor-container"></div></div><div class="btn-row"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveDetailText()">保存</button></div>');
            var createEditor = window.wangEditor.createEditor;
            var createToolbar = window.wangEditor.createToolbar;
            var editorConfig = { placeholder: '请输入内容...' };
            var editor = createEditor({
                selector: '#editor-container',
                html: '<p><br></p>',
                config: editorConfig,
                mode: 'default',
            });
            var toolbarConfig = {};
            createToolbar({
                editor: editor,
                selector: '#toolbar-container',
                config: toolbarConfig,
                mode: 'default',
            });
            // 加载现有内容
            api('/api/file-content?path=' + encodeURIComponent(joinPath(currentPath, item.name))).then(function(data) {
                if (data.base64) {
                    var content = atob(data.base64);
                    editor.setHtml(content);
                }
            });
            window._editor = editor;
        }

        function saveDetailText() {
            var editor = window._editor;
            if (!editor) return;
            var html = editor.getHtml();
            var base64 = btoa(unescape(encodeURIComponent(html)));
            var item = currentDetailItem;
            if (item) {
                api('/api/save-content', {
                    method: 'POST',
                    body: { path: joinPath(currentPath, item.name), base64: base64, fileId: item.id }
                }).then(function() {
                    closeModal();
                    loadTree();
                    showToast('保存成功');
                    renderDetail();
                }).catch(function(e) {
                    showToast('保存失败: ' + e.message);
                });
            }
        }

        // ==================== 初始化 ====================
        function init() {
            loadTree();
            loadTasks();
            document.getElementById('refreshBtn').onclick = refreshFileList;
            document.getElementById('backBtn').onclick = closeDetail;
            document.getElementById('fabBtn').onclick = function() {
                showModal('<h2>添加</h2><div style="display:flex;flex-direction:column;gap:8px;">' +
                    '<button class="btn btn-primary" onclick="closeModal();showUploadModal()">上传文件</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();showNewFolderModal()">新建文件夹</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();showNewFileModal()">新建文本文件</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();showOfflineDownloadModal()">离线下载</button>' +
                    '<button class="btn btn-secondary" onclick="closeModal();openTaskPanel()">查看任务</button>' +
                    '</div>');
            };
            document.getElementById('closeTaskBtn').onclick = closeTaskPanel;
            document.getElementById('taskBackdrop').onclick = closeTaskPanel;
            // 自动刷新任务
            setInterval(function() {
                var oldTasks = JSON.stringify(tasks);
                loadTasks().then(function() {
                    var newTasks = JSON.stringify(tasks);
                    if (oldTasks !== newTasks) {
                        var hasCompleted = tasks.some(function(t) { return t.status === 'completed' || t.status === 'failed'; });
                        if (hasCompleted) {
                            refreshFileList();
                        }
                    }
                });
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

async function addTask(env, type, name, status, progress) {
  const tasks = await env.TASK_KV.get('tasks', 'json') || [];
  const task = { id: crypto.randomUUID(), type, name, status, progress, createdAt: Date.now(), updatedAt: Date.now() };
  tasks.push(task);
  await env.TASK_KV.put('tasks', JSON.stringify(tasks));
  return task.id;
}

async function updateTask(env, taskId, status, progress) {
  const tasks = await env.TASK_KV.get('tasks', 'json') || [];
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    tasks[idx].status = status;
    tasks[idx].progress = progress;
    tasks[idx].updatedAt = Date.now();
    await env.TASK_KV.put('tasks', JSON.stringify(tasks));
  }
}

async function handleOfflineDownload(env, url, savePath, taskId) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('下载失败: HTTP ' + response.status);
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength > 25 * 1024 * 1024) throw new Error('文件过大');
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) throw new Error('空文件');
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
    await kv.put('f:' + fileId, arrayBuffer);
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    await addFileToTree(env, savePath, fileName, fileId, arrayBuffer.byteLength, mimeType, 1, 0);
    await updateTask(env, taskId, 'completed', 100);
  } catch (e) {
    await updateTask(env, taskId, 'failed', 0);
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

      // 直链
      if (path.startsWith('/d/')) {
        const fileId = path.substring(3);
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

      // 分享链接
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

        // 上传
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

        // 删除内容
        if (apiPath === '/delete-content' && method === 'POST') {
          const { fileId, chunks } = body;
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          try { await deleteFileContent(env, fileId, chunks); return jsonResponse({ success: true }, headers); }
          catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        // 下载
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

        // 预览图片
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

        // 获取文本内容
        if (apiPath === '/file-content' && method === 'GET') {
          const filePath = url.searchParams.get('path');
          if (!filePath) return jsonResponse({ error: 'Missing path' }, headers, 400);
          const tree = await getTree(env);
          const item = findItemByPathInTree(tree, filePath);
          if (!item || item.type !== 'file') return jsonResponse({ error: 'File not found' }, headers, 404);
          const buffer = await getFileArrayBuffer(env, item);
          const base64 = arrayBufferToBase64(buffer);
          return jsonResponse({ base64 }, headers);
        }

        // 保存文本内容
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

        // 分享
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
