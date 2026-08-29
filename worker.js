// worker.js - 优化版
const HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>云盘</title>
  <link rel="stylesheet" href="https://unpkg.com/@wangeditor/editor@latest/dist/css/style.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mui-player@latest/dist/mui-player.min.css">
  <script src="https://cdn.jsdelivr.net/npm/jsmediatags@3.9.5/dist/jsmediatags.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <style>
    :root { --bg:#f5f7fa; --card:#fff; --text:#1a1a2e; --text-secondary:#6b7280; --accent:#4f6ef7; --accent-light:#eef1ff; --danger:#ef4444; --success:#10b981; --border:#e5e7eb; --shadow:0 2px 8px rgba(0,0,0,0.06); --radius:12px; --radius-sm:8px; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--text); min-height:100vh; padding-bottom:80px; -webkit-tap-highlight-color:transparent; }
    .header { position:sticky; top:0; background:var(--card); padding:0 16px; height:52px; display:flex; align-items:center; z-index:100; box-shadow:0 1px 3px rgba(0,0,0,0.05); border-bottom:1px solid var(--border); }
    .header h1 { font-size:18px; font-weight:700; flex-shrink:0; margin-right:12px; color:var(--accent); }
    .refresh-btn { background:none; border:none; font-size:20px; cursor:pointer; padding:4px 8px; color:var(--text-secondary); flex-shrink:0; }
    .breadcrumb { display:flex; align-items:center; flex-wrap:nowrap; overflow-x:auto; gap:4px; font-size:13px; -webkit-overflow-scrolling:touch; flex:1; }
    .breadcrumb span { white-space:nowrap; padding:4px 6px; border-radius:4px; cursor:pointer; color:var(--text-secondary); flex-shrink:0; }
    .breadcrumb span:hover, .breadcrumb span.current { color:var(--accent); background:var(--accent-light); }
    .breadcrumb .sep { color:#ccc; cursor:default; padding:0 2px; }
    .file-list { padding:12px 16px; max-width:800px; margin:0 auto; }
    .file-item { background:var(--card); border-radius:var(--radius); padding:12px 14px; margin-bottom:8px; display:flex; align-items:flex-start; gap:12px; box-shadow:var(--shadow); border:1px solid var(--border); cursor:pointer; }
    .file-icon { width:40px; height:40px; border-radius:var(--radius-sm); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; background:var(--accent-light); margin-top:4px; }
    .file-icon.folder { background:#fef3c7; }
    .file-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
    .file-name { font-size:14px; font-weight:600; word-break:break-all; }
    .file-meta { font-size:11px; color:var(--text-secondary); display:flex; gap:8px; flex-wrap:wrap; }
    .file-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
    .btn-text { padding:4px 10px; font-size:12px; border:1px solid var(--border); background:#f9fafb; border-radius:6px; cursor:pointer; color:var(--text-secondary); }
    .btn-text:hover { background:var(--accent-light); color:var(--accent); }
    .btn-text.danger:hover { background:#fee2e2; color:var(--danger); }
    .fab { position:fixed; bottom:24px; right:24px; width:56px; height:56px; border-radius:50%; background:var(--accent); color:#fff; border:none; font-size:28px; cursor:pointer; box-shadow:0 4px 16px rgba(79,110,247,0.4); z-index:200; display:flex; align-items:center; justify-content:center; }
    .task-fab { position:fixed; bottom:24px; right:92px; width:48px; height:48px; border-radius:50%; background:#fff; color:var(--accent); border:1px solid var(--border); font-size:20px; cursor:pointer; box-shadow:var(--shadow); z-index:200; display:flex; align-items:center; justify-content:center; }
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:300; display:flex; align-items:center; justify-content:center; }
    .modal { background:var(--card); border-radius:16px; padding:20px; width:90%; max-width:420px; max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.15); }
    .modal h2 { font-size:17px; margin-bottom:16px; font-weight:700; }
    .modal input[type="text"], .modal input[type="url"] { width:100%; padding:10px 14px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font-size:14px; outline:none; margin-bottom:12px; background:#fafbfc; }
    .modal .btn-row { display:flex; gap:8px; margin-top:8px; }
    .btn { padding:10px 16px; border-radius:var(--radius-sm); border:none; font-size:14px; font-weight:600; cursor:pointer; flex:1; text-align:center; }
    .btn-primary { background:var(--accent); color:#fff; }
    .btn-secondary { background:#f3f4f6; color:var(--text); }
    .btn-danger { background:var(--danger); color:#fff; }
    .empty-state { text-align:center; padding:60px 20px; color:var(--text-secondary); }
    .empty-state .icon { font-size:48px; margin-bottom:12px; }
    .toast { position:fixed; bottom:90px; left:50%; transform:translateX(-50%); background:#1f2937; color:#fff; padding:10px 20px; border-radius:8px; font-size:13px; z-index:500; pointer-events:none; max-width:90vw; }
    .share-link-box { background:#f9fafb; border:1px solid var(--border); border-radius:8px; padding:10px; font-size:12px; word-break:break-all; margin:8px 0; user-select:all; }
    .task-panel { position:fixed; top:0; right:0; bottom:0; width:320px; max-width:90vw; background:var(--card); z-index:250; box-shadow:-4px 0 20px rgba(0,0,0,0.1); transform:translateX(100%); transition:transform 0.3s ease; overflow-y:auto; padding:16px; }
    .task-panel.open { transform:translateX(0); }
    .task-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .task-item { padding:10px; border-radius:var(--radius-sm); background:#f9fafb; margin-bottom:8px; border:1px solid var(--border); }
    .task-name { font-size:13px; font-weight:600; word-break:break-all; }
    .task-status { font-size:11px; color:var(--text-secondary); margin-top:4px; }
    .progress-bar { height:4px; background:#e5e7eb; border-radius:2px; margin-top:6px; overflow:hidden; }
    .progress-fill { height:100%; background:var(--accent); transition:width 0.3s ease; }
    .progress-fill.completed { background:var(--success); }
    .progress-fill.failed { background:var(--danger); }
    .progress-fill.cancelled { background:#9ca3af; }
    .task-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.3); z-index:240; opacity:0; pointer-events:none; transition:opacity 0.3s; }
    .task-backdrop.open { opacity:1; pointer-events:auto; }
    .detail-page { max-width:800px; margin:0 auto; padding:16px; }
    .detail-card { background:var(--card); border-radius:var(--radius); padding:16px; box-shadow:var(--shadow); border:1px solid var(--border); }
    .detail-header { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
    .detail-title { font-size:18px; font-weight:700; word-break:break-all; }
    .detail-meta { font-size:13px; color:var(--text-secondary); margin-bottom:16px; }
    .detail-actions { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
    .preview-container { margin-top:16px; }
    .preview-container img { max-width:100%; border-radius:8px; }
    .preview-container video, .preview-container audio { width:100%; border-radius:8px; }
    .text-preview { white-space:pre-wrap; word-break:break-all; font-family:monospace; background:#f9fafb; padding:12px; border-radius:8px; max-height:400px; overflow-y:auto; }
    .editor-wrapper { border:1px solid #ccc; z-index:100; }
    .toolbar-container { border-bottom:1px solid #ccc; }
    .editor-container { height:400px; }
    .hidden { display:none !important; }
    .music-player { display:flex; flex-direction:column; gap:12px; padding:12px; background:#f9fafb; border-radius:8px; }
    .music-cover { width:120px; height:120px; border-radius:8px; object-fit:cover; background:#e5e7eb; margin:0 auto; }
    .music-info { text-align:center; }
    .music-title { font-size:16px; font-weight:700; }
    .music-artist { font-size:13px; color:var(--text-secondary); }
    .music-album { font-size:12px; color:var(--text-secondary); }
    .lyrics-container { max-height:200px; overflow-y:auto; text-align:center; font-size:13px; line-height:1.8; padding:8px; background:#fff; border-radius:8px; }
    .lyric-line { transition:all 0.3s; cursor:default; }
    .lyric-line.active { color:var(--accent); font-weight:700; transform:scale(1.05); }
    .zip-tree { background:#f9fafb; border-radius:8px; padding:12px; max-height:300px; overflow-y:auto; font-family:monospace; font-size:13px; line-height:1.6; }
    .zip-tree-item { padding-left:16px; }
    .zip-tree-folder { color:var(--accent); font-weight:600; }
    .share-readonly-badge { display:inline-block; background:var(--accent-light); color:var(--accent); padding:2px 8px; border-radius:4px; font-size:12px; margin-left:8px; }
    .task-actions { display:flex; gap:6px; margin-top:8px; }
    .task-actions .btn-text { font-size:11px; padding:3px 8px; }
    .upload-progress-overlay { position:fixed; bottom:0; left:0; right:0; background:var(--card); padding:12px 16px; box-shadow:0 -2px 10px rgba(0,0,0,0.08); z-index:180; transform:translateY(100%); transition:transform 0.3s ease; }
    .upload-progress-overlay.show { transform:translateY(0); }
    .upload-progress-bar { height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden; margin-top:8px; }
    .upload-progress-fill { height:100%; background:var(--accent); transition:width 0.2s ease; }
    .upload-progress-info { display:flex; justify-content:space-between; font-size:13px; color:var(--text-secondary); }
    @media (max-width:480px) { .file-item { padding:10px 12px; } .btn-text { padding:3px 8px; font-size:11px; } }
  </style>
</head>
<body>
  <div class="header"><h1>云盘</h1><button class="refresh-btn" id="refreshBtn">⟳</button><div class="breadcrumb" id="breadcrumb"></div></div>
  <div id="mainView"><div class="file-list" id="fileList"></div><button class="fab" id="fabBtn">+</button><button class="task-fab" id="taskFabBtn" title="任务列表">📋</button></div>
  <div id="detailView" class="hidden"><div class="detail-page"><button class="btn btn-secondary" id="backBtn" style="margin-bottom:12px;">返回</button><div class="detail-card" id="detailCard"></div></div></div>
  <div class="task-backdrop" id="taskBackdrop"></div><div class="task-panel" id="taskPanel"><div class="task-panel-header"><h3>任务列表</h3><button class="btn-text" id="closeTaskBtn">关闭</button></div><div id="taskList"></div></div>
  <div id="modalContainer"></div><div id="toastContainer"></div>
  <div class="upload-progress-overlay" id="uploadProgressOverlay"><div class="upload-progress-info"><span id="uploadProgressText">准备上传...</span><span id="uploadProgressPercent">0%</span></div><div class="upload-progress-bar"><div class="upload-progress-fill" id="uploadProgressFill" style="width:0%"></div></div><div class="btn-row" style="margin-top:10px;"><button class="btn btn-danger" id="cancelUploadBtn" style="flex:0 0 auto;padding:6px 12px;font-size:12px;">取消上传</button></div></div>
  <script src="https://unpkg.com/@wangeditor/editor@latest/dist/index.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mui-player@latest/dist/mui-player.min.js"></script>
  <script>

    // ==================== 全局变量 ====================
    var API_BASE = "";
    var currentPath = "/";
    var fileTree = null;
    var tasks = [];
    var pendingUploads = [];
    var currentView = "list";
    var currentDetailItem = null;
    var currentAudio = null;
    var lyricLines = [];
    var isShareReadonly = false;
    var activeUploads = {}; // taskId -> { cancelled: false }
    var uploadProgressOverlay = null;

    // ==================== 工具函数 ====================
    function showToast(msg, duration) {
      duration = duration || 2000;
      var container = document.getElementById("toastContainer");
      var toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(function() { toast.remove(); }, duration);
    }

    function formatSize(bytes) {
      if (bytes === 0) return "0 B";
      if (!bytes) return "-";
      var k = 1024;
      var sizes = ["B","KB","MB","GB","TB"];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    function formatTime(ts) {
      if (!ts) return "-";
      var d = new Date(ts);
      return d.toLocaleString("zh-CN", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
    }

    function getFileIcon(item) {
      if (item.type === "folder") return "📁";
      var ext = (item.name.split(".").pop() || "").toLowerCase();
      if (["jpg","jpeg","png","gif","webp","svg","bmp","ico"].indexOf(ext) !== -1) return "🖼️";
      if (["mp4","webm","avi","mov","mkv","flv"].indexOf(ext) !== -1) return "🎬";
      if (["mp3","wav","ogg","flac","m4a"].indexOf(ext) !== -1) return "🎵";
      if (["txt","md","json","js","ts","css","html","xml","yml","yaml","log"].indexOf(ext) !== -1) return "📄";
      if (["zip","rar","7z","tar","gz","bz2"].indexOf(ext) !== -1) return "📦";
      if (["pdf","doc","docx","xls","xlsx","ppt","pptx"].indexOf(ext) !== -1) return "📑";
      return "📎";
    }

    function getIconClass(item) {
      if (item.type === "folder") return "folder";
      var ext = (item.name.split(".").pop() || "").toLowerCase();
      if (["jpg","jpeg","png","gif","webp","svg","bmp","ico"].indexOf(ext) !== -1) return "image";
      if (["mp4","webm","avi","mov","mkv","flv"].indexOf(ext) !== -1) return "video";
      if (["txt","md","json","js","ts","css","html","xml"].indexOf(ext) !== -1) return "text";
      return "";
    }

    function generateId() {
      return "f_" + Date.now() + "_" + Math.random().toString(36).substr(2, 8);
    }

    // 分块读取 File/Blob 为 base64，避免大文件内存溢出
    function readChunkAsBase64(blob) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
          var result = reader.result;
          var base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    function api(path, options) {
      options = options || {};
      var fetchOptions = { method: options.method || "GET", headers: { "Content-Type": "application/json" } };
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
      var parts = currentPath.split("/").filter(Boolean);
      var current = fileTree;
      for (var i = 0; i < parts.length; i++) {
        var found = null;
        if (current.children) {
          for (var j = 0; j < current.children.length; j++) {
            if (current.children[j].name === parts[i] && current.children[j].type === "folder") { found = current.children[j]; break; }
          }
        }
        if (!found) return [];
        current = found;
      }
      return current.children || [];
    }

    function joinPath(base, name) {
      var cleanBase = base.endsWith("/") ? base : base + "/";
      if (name.startsWith("/")) return name;
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
      if (idx !== -1) { tree.children.splice(idx, 1); return true; }
      for (var i = 0; i < tree.children.length; i++) { if (removeItemFromTree(tree.children[i], itemId)) return true; }
      return false;
    }

    function escapeHtml(text) { var div = document.createElement("div"); div.textContent = text; return div.innerHTML; }

    // ==================== 渲染 ====================
    function renderBreadcrumb() {
      var container = document.getElementById("breadcrumb");
      container.innerHTML = "";
      var parts = currentPath.split("/").filter(Boolean);
      var rootSpan = document.createElement("span");
      rootSpan.textContent = "根目录"; rootSpan.className = currentPath === "/" ? "current" : "";
      rootSpan.onclick = function() { navigateTo("/"); };
      container.appendChild(rootSpan);
      var accumulated = "";
      for (var i = 0; i < parts.length; i++) {
        accumulated += "/" + parts[i];
        var sep = document.createElement("span"); sep.className = "sep"; sep.textContent = ">"; container.appendChild(sep);
        var span = document.createElement("span"); span.textContent = parts[i]; span.className = accumulated === currentPath ? "current" : "";
        span.onclick = (function(path) { return function() { navigateTo(path); }; })(accumulated);
        container.appendChild(span);
      }
    }

    function renderFileList() {
      var container = document.getElementById("fileList");
      var items = getCurrentFolderItems();
      container.innerHTML = "";
      if (items.length === 0) { container.innerHTML = '<div class="empty-state"><div class="icon">📂</div><p>此文件夹为空</p></div>'; return; }
      var sortedItems = items.slice().sort(function(a, b) { if (a.type !== b.type) return a.type === "folder" ? -1 : 1; return a.name.localeCompare(b.name); });
      for (var i = 0; i < sortedItems.length; i++) {
        var item = sortedItems[i];
        var div = document.createElement("div"); div.className = "file-item"; div.setAttribute("data-id", item.id); div.setAttribute("data-type", item.type);
        var iconClass = getIconClass(item);
        var actionsHtml = "";
        if (item.type === "file") {
          actionsHtml += '<button class="btn-text" data-action="download">下载</button>';
          actionsHtml += '<button class="btn-text" data-action="share">分享</button>';
          var ext = (item.name.split(".").pop() || "").toLowerCase();
          if (["txt","md","json","js","ts","css","html","xml","log"].indexOf(ext) !== -1) { actionsHtml += '<button class="btn-text" data-action="edit">编辑</button>'; }
          if (["zip"].indexOf(ext) !== -1) { actionsHtml += '<button class="btn-text" data-action="extract">解压</button>'; }
        }
        actionsHtml += '<button class="btn-text" data-action="rename">重命名</button>';
        actionsHtml += '<button class="btn-text danger" data-action="delete">删除</button>';
        div.innerHTML = '<div class="file-icon ' + iconClass + '">' + getFileIcon(item) + '</div>' +
          '<div class="file-info">' +
          '<div class="file-name">' + item.name + '</div>' +
          '<div class="file-meta"><span>' + (item.type === "folder" ? "文件夹" : formatSize(item.size)) + '</span><span>' + formatTime(item.updatedAt || item.createdAt) + '</span>' +
          (item.type === "file" && item.chunks > 1 ? '<span>分片</span>' : '') +
          '</div>' +
          '<div class="file-actions">' + actionsHtml + '</div>' +
          '</div>';
        container.appendChild(div);
      }
    }

    function navigateTo(path) {
      if (!path.startsWith("/")) path = "/" + path;
      currentPath = path; currentView = "list";
      document.getElementById("mainView").classList.remove("hidden");
      document.getElementById("detailView").classList.add("hidden");
      renderBreadcrumb(); renderFileList();
      if (history.state && history.state.path === path) return;
      history.pushState({ path: path }, "", path === "/" ? "/" : path);
    }

    function loadTree() {
      return api("/api/tree").then(function(data) { fileTree = data.tree || { name:"/", type:"folder", children:[] }; renderFileList(); renderBreadcrumb(); }).catch(function() { fileTree = { name:"/", type:"folder", children:[] }; renderFileList(); renderBreadcrumb(); });
    }

    function saveTree() { return api("/api/tree", { method:"PUT", body: { tree: fileTree } }); }

    function refreshFileList() { loadTree().then(function() { if (currentView === "list") { renderFileList(); renderBreadcrumb(); } }); }

    // ==================== 事件委托 ====================
    document.addEventListener("click", function(e) {
      var target = e.target;
      var btn = target.closest(".btn-text");
      if (btn) {
        var itemDiv = btn.closest(".file-item");
        if (itemDiv) {
          e.stopPropagation();
          var id = itemDiv.getAttribute("data-id"); var type = itemDiv.getAttribute("data-type"); var action = btn.getAttribute("data-action");
          if (action === "download") downloadFile(id);
          else if (action === "share") shareFile(id);
          else if (action === "rename") showRenameModal(id);
          else if (action === "delete") deleteItem(id);
          else if (action === "edit") editFile(id);
          else if (action === "extract") extractZip(id);
        }
        return;
      }
      var itemDiv = target.closest(".file-item");
      if (itemDiv) {
        var id = itemDiv.getAttribute("data-id"); var type = itemDiv.getAttribute("data-type");
        if (type === "folder") { var folderItem = findItemInTree(fileTree, id); if (folderItem) navigateTo(joinPath(currentPath, folderItem.name)); }
        else { var fileItem = findItemInTree(fileTree, id); if (fileItem) openDetail(fileItem); }
      }
    });

    // ==================== 模态框 ====================
    function showModal(html) { var container = document.getElementById("modalContainer"); container.innerHTML = '<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>'; }
    function closeModal() { document.getElementById("modalContainer").innerHTML = ""; }

    // ==================== 文件操作 ====================
    function showNewFolderModal() { showModal('<h2>新建文件夹</h2><input type="text" id="newFolderName" placeholder="文件夹名称"><div class="btn-row"><button class="btn btn-secondary" id="cancelBtn">取消</button><button class="btn btn-primary" id="confirmBtn">创建</button></div>'); document.getElementById("cancelBtn").onclick = closeModal; document.getElementById("confirmBtn").onclick = createFolder; }
    function createFolder() {
      var name = document.getElementById("newFolderName").value.trim();
      if (!name) { showToast("请输入文件夹名称"); return; }
      var items = getCurrentFolderItems(); for (var i = 0; i < items.length; i++) { if (items[i].name === name) { showToast("同名文件已存在"); return; } }
      var newFolder = { id: generateId(), name: name, type:"folder", children:[], createdAt: Date.now(), updatedAt: Date.now() };
      var target = fileTree; var parts = currentPath.split("/").filter(Boolean);
      for (var j = 0; j < parts.length; j++) { target = target.children.find(function(c) { return c.name === parts[j] && c.type === "folder"; }); }
      if (!target.children) target.children = []; target.children.push(newFolder);
      saveTree().then(function() { closeModal(); renderFileList(); showToast("文件夹已创建"); });
    }

    function showNewFileModal() { showModal('<h2>新建文本文件</h2><input type="text" id="newFileName" placeholder="文件名（如 note.txt）"><div class="btn-row"><button class="btn btn-secondary" id="cancelBtn">取消</button><button class="btn btn-primary" id="confirmBtn">创建</button></div>'); document.getElementById("cancelBtn").onclick = closeModal; document.getElementById("confirmBtn").onclick = createNewFile; }
    function createNewFile() {
      var name = document.getElementById("newFileName").value.trim(); if (!name) { showToast("请输入文件名"); return; }
      var items = getCurrentFolderItems(); for (var i = 0; i < items.length; i++) { if (items[i].name === name) { showToast("同名文件已存在"); return; } }
      var fileId = generateId(); var newFile = { id: fileId, name: name, type:"file", size:0, mimeType:"text/plain", chunks:0, chunkSize:0, createdAt: Date.now(), updatedAt: Date.now() };
      var target = fileTree; var parts = currentPath.split("/").filter(Boolean);
      for (var j = 0; j < parts.length; j++) { target = target.children.find(function(c) { return c.name === parts[j] && c.type === "folder"; }); }
      if (!target.children) target.children = []; target.children.push(newFile);
      saveTree().then(function() { closeModal(); renderFileList(); showToast("文件已创建"); });
    }

    function showRenameModal(itemId) { var item = findItemInTree(fileTree, itemId); if (!item) return; showModal('<h2>重命名</h2><input type="text" id="renameInput" value="' + item.name + '"><div class="btn-row"><button class="btn btn-secondary" id="cancelBtn">取消</button><button class="btn btn-primary" id="confirmBtn">确定</button></div>'); document.getElementById("cancelBtn").onclick = closeModal; document.getElementById("confirmBtn").onclick = function() { doRename(itemId); }; }
    function doRename(itemId) { var newName = document.getElementById("renameInput").value.trim(); if (!newName) { showToast("请输入新名称"); return; } var item = findItemInTree(fileTree, itemId); if (!item) { showToast("未找到文件"); return; } item.name = newName; item.updatedAt = Date.now(); saveTree().then(function() { closeModal(); renderFileList(); showToast("重命名成功"); if (currentView === "detail" && currentDetailItem && currentDetailItem.id === itemId) renderDetail(); }); }

    function deleteItem(itemId) { var item = findItemInTree(fileTree, itemId); if (!item) return; if (!confirm("确定要删除 " + item.name + " 吗？")) return; if (item.type === "file" && item.chunks > 0) { api("/api/delete-content", { method:"POST", body: { fileId: item.id, chunks: item.chunks } }).catch(function(){}); } removeItemFromTree(fileTree, itemId); saveTree().then(function() { renderFileList(); showToast("已删除"); if (currentView === "detail" && currentDetailItem && currentDetailItem.id === itemId) closeDetail(); }); }

    // ==================== 上传（支持文件夹，分块 base64，可取消） ====================
    function showUploadModal() { showModal('<h2>上传文件</h2><input type="file" id="fileInput" multiple webkitdirectory directory><div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">提示：可选择文件夹上传整个目录</div><div class="btn-row"><button class="btn btn-secondary" id="cancelBtn">取消</button><button class="btn btn-primary" id="uploadBtn">开始上传</button></div>'); document.getElementById("cancelBtn").onclick = closeModal; document.getElementById("uploadBtn").onclick = startUpload; }

    function showUploadProgress(text, percent) {
      var overlay = document.getElementById("uploadProgressOverlay");
      var fill = document.getElementById("uploadProgressFill");
      var txt = document.getElementById("uploadProgressText");
      var pct = document.getElementById("uploadProgressPercent");
      overlay.classList.add("show");
      if (text) txt.textContent = text;
      if (percent !== undefined) { fill.style.width = percent + "%"; pct.textContent = Math.round(percent) + "%"; }
    }

    function hideUploadProgress() {
      document.getElementById("uploadProgressOverlay").classList.remove("show");
      document.getElementById("uploadProgressFill").style.width = "0%";
      document.getElementById("uploadProgressPercent").textContent = "0%";
    }

    function startUpload() {
      var input = document.getElementById("fileInput"); if (!input.files || input.files.length === 0) { showToast("请选择文件"); return; }
      var files = Array.from(input.files); var uploadPath = currentPath; closeModal();
      var fileList = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var relativePath = f.webkitRelativePath || f.name;
        var pathParts = relativePath.split("/");
        var fileName = pathParts.pop();
        var folderPath = pathParts.length > 0 ? uploadPath + "/" + pathParts.join("/") : uploadPath;
        folderPath = folderPath.replace(/\\/+/g, "/");
        fileList.push({ file: f, name: fileName, folderPath: folderPath, size: f.size });
      }
      var totalSize = fileList.reduce(function(sum, e) { return sum + e.size; }, 0);
      var uploadedSize = 0;
      api("/api/task/create", { method:"POST", body: { type:"upload", name:"上传 " + fileList.length + " 个文件" } }).then(function(taskData) {
        var taskId = taskData.taskId;
        activeUploads[taskId] = { cancelled: false };
        showUploadProgress("准备上传 " + fileList.length + " 个文件...", 0);
        // 绑定取消按钮
        var cancelBtn = document.getElementById("cancelUploadBtn");
        cancelBtn.onclick = function() {
          activeUploads[taskId].cancelled = true;
          showUploadProgress("正在取消...", document.getElementById("uploadProgressFill").style.width.replace("%",""));
        };
        var queue = Promise.resolve();
        var completed = 0;
        for (var i = 0; i < fileList.length; i++) {
          (function(entry, index) {
            queue = queue.then(function() {
              if (activeUploads[taskId].cancelled) return Promise.reject(new Error("用户取消"));
              return uploadSingleFileOptimized(entry.file, entry.name, entry.folderPath, taskId, function(fileProgress) {
                var currentUploaded = uploadedSize + entry.size * fileProgress;
                var overall = (currentUploaded / totalSize) * 100;
                showUploadProgress("上传中 " + (index + 1) + "/" + fileList.length + " - " + entry.name, overall);
              }).then(function() {
                uploadedSize += entry.size;
                completed++;
                var overall = (uploadedSize / totalSize) * 100;
                showUploadProgress("上传中 " + completed + "/" + fileList.length, overall);
                return api("/api/task/update", { method:"POST", body: { taskId: taskId, progress: Math.round(overall) } });
              });
            });
          })(fileList[i], i);
        }
        queue.then(function() {
          if (activeUploads[taskId].cancelled) {
            api("/api/task/update", { method:"POST", body: { taskId: taskId, status:"cancelled", progress: Math.round((uploadedSize / totalSize) * 100) } });
            showToast("上传已取消");
          } else {
            api("/api/task/update", { method:"POST", body: { taskId: taskId, progress: 100, status:"completed" } });
            showToast("上传完成");
          }
          hideUploadProgress();
          delete activeUploads[taskId];
          loadTree(); loadTasks();
        }).catch(function(e) {
          if (e.message === "用户取消") {
            api("/api/task/update", { method:"POST", body: { taskId: taskId, status:"cancelled", progress: Math.round((uploadedSize / totalSize) * 100) } });
            showToast("上传已取消");
          } else {
            api("/api/task/update", { method:"POST", body: { taskId: taskId, status:"failed", error: e.message } });
            showToast("上传失败: " + e.message);
          }
          hideUploadProgress();
          delete activeUploads[taskId];
        });
      });
    }

    // 优化版：分块读取 base64，避免大文件内存问题，支持进度回调和取消检查
    function uploadSingleFileOptimized(file, fileName, uploadPath, taskId, onProgress) {
      var fileId = generateId();
      var CHUNK_THRESHOLD = 15 * 1024 * 1024;
      var CHUNK_SIZE = 18 * 1024 * 1024;
      var ctrl = activeUploads[taskId];

      if (file.size <= CHUNK_THRESHOLD) {
        // 小文件：直接分块读取
        onProgress(0.1);
        return readChunkAsBase64(file).then(function(base64) {
          if (ctrl && ctrl.cancelled) throw new Error("用户取消");
          onProgress(0.5);
          return api("/api/upload/single", { method:"POST", body: { fileId: fileId, fileName: fileName, uploadPath: uploadPath, base64: base64, mimeType: file.type || "application/octet-stream", size: file.size } });
        }).then(function() {
          onProgress(1);
        });
      } else {
        // 大文件：分片上传，每片单独读取 base64
        var chunks = Math.ceil(file.size / CHUNK_SIZE);
        onProgress(0.05);
        return api("/api/upload/init", { method:"POST", body: { fileId: fileId, fileName: fileName, uploadPath: uploadPath, chunks: chunks, chunkSize: CHUNK_SIZE, mimeType: file.type || "application/octet-stream", size: file.size } }).then(function() {
          var chunkQueue = Promise.resolve();
          for (var i = 0; i < chunks; i++) {
            (function(index) {
              chunkQueue = chunkQueue.then(function() {
                if (ctrl && ctrl.cancelled) throw new Error("用户取消");
                var start = index * CHUNK_SIZE;
                var end = Math.min(start + CHUNK_SIZE, file.size);
                var slice = file.slice(start, end);
                return readChunkAsBase64(slice).then(function(chunkBase64) {
                  if (ctrl && ctrl.cancelled) throw new Error("用户取消");
                  return api("/api/upload/chunk", { method:"POST", body: { fileId: fileId, chunkIndex: index, base64: chunkBase64 } });
                }).then(function() {
                  onProgress((index + 1) / chunks);
                });
              });
            })(i);
          }
          return chunkQueue.then(function() {
            if (ctrl && ctrl.cancelled) throw new Error("用户取消");
            return api("/api/upload/complete", { method:"POST", body: { fileId: fileId, chunks: chunks } });
          });
        });
      }
    }

    // ==================== 下载/分享 ====================
    function downloadFile(fileId) { window.location.href = "/api/download?fileId=" + encodeURIComponent(fileId); }
    function shareFile(fileId) { api("/api/share", { method:"POST", body: { fileId: fileId } }).then(function(data) { var link = location.origin + "/s/" + data.shareId; showModal('<h2>分享链接</h2><div class="share-link-box">' + link + '</div><button class="btn btn-primary" onclick="closeModal()">关闭</button>'); }); }

    // ==================== 在线解压 ====================
    function extractZip(fileId) {
      var item = findItemInTree(fileTree, fileId);
      if (!item) return;
      if (!confirm("确定要解压 " + item.name + " 吗？将解压到当前目录")) return;
      showToast("正在读取压缩包...", 3000);
      fetch("/api/download?fileId=" + encodeURIComponent(fileId)).then(function(res) { return res.blob(); }).then(function(blob) {
        if (typeof JSZip === "undefined") { showToast("JSZip 库未加载"); return; }
        return JSZip.loadAsync(blob);
      }).then(function(zip) {
        var entries = [];
        zip.forEach(function(relPath, entry) { entries.push({ path: relPath, dir: entry.dir, async: entry.async.bind(entry) }); });
        showToast("发现 " + entries.filter(function(e){return !e.dir}).length + " 个文件，开始解压...", 3000);
        return api("/api/task/create", { method:"POST", body: { type:"extract", name:"解压 " + item.name } }).then(function(taskData) {
          var taskId = taskData.taskId;
          activeUploads[taskId] = { cancelled: false };
          var fileEntries = entries.filter(function(e){return !e.dir});
          var total = fileEntries.length;
          var done = 0;
          var queue = Promise.resolve();
          for (var i = 0; i < fileEntries.length; i++) {
            (function(entry) {
              queue = queue.then(function() {
                if (activeUploads[taskId] && activeUploads[taskId].cancelled) return Promise.reject(new Error("用户取消"));
                return entry.async("blob").then(function(blob) {
                  var pathParts = entry.path.split("/");
                  var fileName = pathParts.pop();
                  var folderPath = currentPath + (pathParts.length > 0 ? "/" + pathParts.join("/") : "");
                  folderPath = folderPath.replace(/\\/+/g, "/");
                  return uploadSingleFileOptimized(new File([blob], fileName), fileName, folderPath, taskId, function(){});
                }).then(function() {
                  done++;
                  return api("/api/task/update", { method:"POST", body: { taskId: taskId, progress: Math.round((done / total) * 100) } });
                });
              });
            })(fileEntries[i]);
          }
          return queue.then(function() {
            return api("/api/task/update", { method:"POST", body: { taskId: taskId, progress: 100, status:"completed" } });
          }).then(function() {
            showToast("解压完成"); loadTree(); loadTasks();
          });
        });
      }).catch(function(e) { showToast("解压失败: " + e.message); });
    }

    // ==================== 离线下载 ====================
    function showOfflineDownloadModal() { showModal('<h2>离线下载</h2><input type="url" id="offlineUrl" placeholder="https://example.com/file.zip"><div class="btn-row"><button class="btn btn-secondary" id="cancelBtn">取消</button><button class="btn btn-primary" id="offlineBtn">开始下载</button></div>'); document.getElementById("cancelBtn").onclick = closeModal; document.getElementById("offlineBtn").onclick = startOfflineDownload; }
    function startOfflineDownload() { var url = document.getElementById("offlineUrl").value.trim(); if (!url) { showToast("请输入下载链接"); return; } closeModal(); api("/api/offline", { method:"POST", body: { url: url, savePath: currentPath } }).then(function() { showToast("离线下载任务已创建"); loadTasks(); }).catch(function(e) { showToast("创建任务失败: " + e.message); }); }

    // ==================== 任务（支持取消和删除） ====================
    function loadTasks() { return api("/api/tasks").then(function(data) { tasks = data.tasks || []; renderTasks(); }); }
    function renderTasks() {
      var container = document.getElementById("taskList");
      if (tasks.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">暂无任务</p>'; return; }
      container.innerHTML = "";
      var sorted = tasks.slice().sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      for (var i = 0; i < sorted.length; i++) {
        var task = sorted[i];
        var statusClass = task.status === "completed" ? "completed" : task.status === "failed" ? "failed" : task.status === "cancelled" ? "cancelled" : "";
        var statusText = task.status === "completed" ? "完成" : task.status === "failed" ? "失败" : task.status === "cancelled" ? "已取消" : task.status === "processing" ? "处理中" : "等待中";
        var actionsHtml = "";
        if (task.status === "processing") {
          actionsHtml += '<button class="btn-text" data-task-action="cancel" data-task-id="' + task.id + '">取消</button>';
        }
        if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
          actionsHtml += '<button class="btn-text danger" data-task-action="delete" data-task-id="' + task.id + '">删除</button>';
        }
        var div = document.createElement("div"); div.className = "task-item";
        div.innerHTML = '<div class="task-name">' + (task.type === "upload" ? "上传" : task.type === "extract" ? "解压" : "下载") + " " + (task.name || task.url || "未知") + '</div><div class="task-status">' + statusText + (task.progress ? " · " + Math.round(task.progress) + "%" : "") + '</div><div class="progress-bar"><div class="progress-fill ' + statusClass + '" style="width:' + (task.progress || 0) + '%"></div></div>' + (actionsHtml ? '<div class="task-actions">' + actionsHtml + '</div>' : '');
        container.appendChild(div);
      }
      // 绑定任务操作按钮
      container.querySelectorAll('[data-task-action]').forEach(function(btn) {
        btn.onclick = function() {
          var action = this.getAttribute("data-task-action");
          var taskId = this.getAttribute("data-task-id");
          if (action === "cancel") { cancelTask(taskId); }
          else if (action === "delete") { deleteTask(taskId); }
        };
      });
    }
    function openTaskPanel() { document.getElementById("taskPanel").classList.add("open"); document.getElementById("taskBackdrop").classList.add("open"); loadTasks(); }
    function closeTaskPanel() { document.getElementById("taskPanel").classList.remove("open"); document.getElementById("taskBackdrop").classList.remove("open"); }

    function cancelTask(taskId) {
      if (activeUploads[taskId]) {
        activeUploads[taskId].cancelled = true;
      }
      api("/api/task/update", { method:"POST", body: { taskId: taskId, status:"cancelled" } }).then(function() {
        showToast("任务已取消"); loadTasks();
      }).catch(function(e) { showToast("取消失败: " + e.message); });
    }

    function deleteTask(taskId) {
      if (!confirm("确定要删除此任务记录吗？")) return;
      api("/api/task/delete", { method:"POST", body: { taskId: taskId } }).then(function() {
        showToast("任务已删除"); loadTasks();
      }).catch(function(e) { showToast("删除失败: " + e.message); });
    }

    // ==================== 详情页 ====================
    function openDetail(item, updateUrl) { if (updateUrl !== false) { history.pushState({ fileId: item.id }, "", "/detail?file=" + item.id); } currentDetailItem = item; currentView = "detail"; document.getElementById("mainView").classList.add("hidden"); document.getElementById("detailView").classList.remove("hidden"); renderDetail(); }
    function closeDetail() { history.pushState({}, "", currentPath === "/" ? "/" : currentPath); currentView = "list"; currentDetailItem = null; document.getElementById("detailView").classList.add("hidden"); document.getElementById("mainView").classList.remove("hidden"); refreshFileList(); }
    function renderDetail() {
      var item = currentDetailItem; var card = document.getElementById("detailCard");
      var actionsHtml = "";
      if (isShareReadonly) {
        actionsHtml = '<button class="btn btn-primary" id="downloadDetail">下载</button>';
        var ext = (item.name.split(".").pop() || "").toLowerCase();
        if (["zip"].indexOf(ext) !== -1) actionsHtml += '<button class="btn btn-secondary" id="extractDetail">解压到当前目录</button>';
      } else {
        actionsHtml = '<button class="btn btn-primary" id="downloadDetail">下载</button>' + '<button class="btn btn-secondary" id="shareDetail">分享</button>' + '<button class="btn btn-secondary" id="directLinkDetail">获取直链</button>' + '<button class="btn btn-secondary" id="renameDetail">重命名</button>' + '<button class="btn btn-danger" id="deleteDetail">删除</button>';
        var ext = (item.name.split(".").pop() || "").toLowerCase();
        if (["txt","md","json","js","ts","css","html","xml","log"].indexOf(ext) !== -1) actionsHtml += '<button class="btn btn-secondary" id="editDetail">编辑</button>';
        if (["zip"].indexOf(ext) !== -1) actionsHtml += '<button class="btn btn-secondary" id="extractDetail">解压到当前目录</button>';
      }
      var readonlyBadge = isShareReadonly ? '<span class="share-readonly-badge">分享预览</span>' : "";
      card.innerHTML = '<div class="detail-header"><div class="file-icon ' + getIconClass(item) + '" style="width:48px;height:48px;font-size:24px;">' + getFileIcon(item) + '</div><div class="detail-title">' + item.name + readonlyBadge + '</div></div>' +
        '<div class="detail-meta"><span>大小: ' + formatSize(item.size) + '</span> · <span>修改时间: ' + formatTime(item.updatedAt || item.createdAt) + '</span> · <span>类型: ' + (item.mimeType || "未知") + '</span></div>' +
        '<div class="detail-actions">' + actionsHtml + '</div>' +
        '<div class="preview-container" id="previewContainer"></div>';
      document.getElementById("downloadDetail").onclick = function() { downloadFile(item.id); };
      if (document.getElementById("shareDetail")) document.getElementById("shareDetail").onclick = function() { shareFile(item.id); };
      if (document.getElementById("directLinkDetail")) document.getElementById("directLinkDetail").onclick = function() { var link = location.origin + "/d/" + item.id; showModal('<h2>直链</h2><div class="share-link-box">' + link + '</div><button class="btn btn-primary" onclick="closeModal()">关闭</button>'); };
      if (document.getElementById("renameDetail")) document.getElementById("renameDetail").onclick = function() { showRenameModal(item.id); };
      if (document.getElementById("deleteDetail")) document.getElementById("deleteDetail").onclick = function() { deleteItem(item.id); };
      if (document.getElementById("editDetail")) document.getElementById("editDetail").onclick = editDetailText;
      if (document.getElementById("extractDetail")) document.getElementById("extractDetail").onclick = function() { extractZip(item.id); };
      loadPreview(item);
    }

    function loadPreview(item) {
      var container = document.getElementById("previewContainer"); var ext = (item.name.split(".").pop() || "").toLowerCase();
      var textExts = ["txt","md","json","js","ts","css","html","xml","log"]; var imageExts = ["jpg","jpeg","png","gif","webp","svg","bmp","ico"]; var videoExts = ["mp4","webm","ogg","mov"]; var audioExts = ["mp3","wav","ogg","flac","m4a"]; var zipExts = ["zip"];
      if (imageExts.indexOf(ext) !== -1) { container.innerHTML = '<img src="/api/preview-image?fileId=' + item.id + '" alt="预览">'; }
      else if (videoExts.indexOf(ext) !== -1) { container.innerHTML = '<div id="video-player"></div>'; if (typeof MuiPlayer !== "undefined") new MuiPlayer({ container: "#video-player", title: item.name, src: "/api/download?fileId=" + item.id, autoplay: false, width: "100%", height: "auto" }); else container.innerHTML = '<video controls src="/api/download?fileId=' + item.id + '" style="width:100%;"></video>'; }
      else if (audioExts.indexOf(ext) !== -1) {
        container.innerHTML = '<div class="music-player"><img class="music-cover" id="musicCover" style="display:none;"><div class="music-info"><div class="music-title" id="musicTitle">' + item.name + '</div><div class="music-artist" id="musicArtist"></div><div class="music-album" id="musicAlbum"></div></div><audio controls src="/api/download?fileId=' + item.id + '" id="musicAudio"></audio><div class="lyrics-container" id="lyricsContainer" style="display:none;"></div></div>';
        var audioEl = document.getElementById("musicAudio"); currentAudio = audioEl; audioEl.addEventListener("timeupdate", function() { highlightLyric(audioEl.currentTime); });
        if (typeof jsmediatags !== "undefined") {
          fetch("/api/download?fileId=" + item.id).then(res => res.blob()).then(blob => { jsmediatags.read(blob, { onSuccess: function(tag) {
            var tags = tag.tags; if (tags.picture) { var picture = tags.picture; var base64String = ""; for (var i = 0; i < picture.data.length; i++) base64String += String.fromCharCode(picture.data[i]); var coverUrl = "data:" + picture.format + ";base64," + btoa(base64String); document.getElementById("musicCover").src = coverUrl; document.getElementById("musicCover").style.display = "block"; }
            if (tags.title) document.getElementById("musicTitle").textContent = tags.title; if (tags.artist) document.getElementById("musicArtist").textContent = tags.artist; if (tags.album) document.getElementById("musicAlbum").textContent = tags.album;
            if (tags.lyrics) { var lyrics = tags.lyrics.lyrics || tags.lyrics; displayLyrics(lyrics); } else loadLrcFromFile(item);
          }, onError: function() { loadLrcFromFile(item); } }); });
        } else loadLrcFromFile(item);
      }
      else if (textExts.indexOf(ext) !== -1) { api("/api/file-content?path=" + encodeURIComponent(joinPath(currentPath, item.name))).then(function(data) { if (data.base64) container.innerHTML = '<div class="text-preview">' + escapeHtml(atob(data.base64)) + '</div>'; }).catch(function() { container.innerHTML = "<p>无法加载文本预览</p>"; }); }
      else if (zipExts.indexOf(ext) !== -1) { container.innerHTML = '<p>ZIP 压缩包，可点击下方"解压到当前目录"按钮在线解压。</p>'; }
      else container.innerHTML = "<p>该文件类型不支持预览，请下载后查看。</p>";
    }

    function loadLrcFromFile(item) { var lrcName = item.name.replace(/\.[^.]+$/, "") + ".lrc"; var items = getCurrentFolderItems(); var lrcItem = null; for (var i = 0; i < items.length; i++) { if (items[i].name === lrcName) { lrcItem = items[i]; break; } } if (lrcItem) api("/api/file-content?path=" + encodeURIComponent(joinPath(currentPath, lrcItem.name))).then(function(data) { if (data.base64) displayLyrics(atob(data.base64)); else document.getElementById("lyricsContainer").style.display = "none"; }); else document.getElementById("lyricsContainer").style.display = "none"; }
    function displayLyrics(lyrics) { var container = document.getElementById("lyricsContainer"); container.style.display = "block"; container.innerHTML = ""; var hasTimestamps = /\[\d{2}:\d{2}(\.\d+)?\]/.test(lyrics); if (hasTimestamps) { lyricLines = []; var lines = lyrics.split(""); for (var i = 0; i < lines.length; i++) { var line = lines[i].trim(); var timeMatch = line.match(/\[(\d{2}):(\d{2})(\.\d+)?\]/); if (timeMatch) { var minutes = parseInt(timeMatch[1]); var seconds = parseFloat(timeMatch[2] + (timeMatch[3] || "")); var text = line.replace(/\[.*?\]/g, "").trim(); if (text) lyricLines.push({ time: minutes * 60 + seconds, text: text }); } } lyricLines.sort(function(a,b){return a.time-b.time}); for (var j = 0; j < lyricLines.length; j++) { var div = document.createElement("div"); div.className = "lyric-line"; div.setAttribute("data-time", lyricLines[j].time); div.textContent = lyricLines[j].text; container.appendChild(div); } } else { container.textContent = lyrics; container.style.whiteSpace = "pre-wrap"; } }
    function highlightLyric(currentTime) { if (!lyricLines || lyricLines.length === 0) return; var lines = document.querySelectorAll(".lyric-line"); var activeIndex = -1; for (var i = 0; i < lyricLines.length; i++) { if (currentTime >= lyricLines[i].time) activeIndex = i; else break; } for (var j = 0; j < lines.length; j++) { if (j === activeIndex) { lines[j].classList.add("active"); lines[j].scrollIntoView({ block: "center", behavior: "smooth" }); } else lines[j].classList.remove("active"); } }

    function editFile(fileId) { var item = findItemInTree(fileTree, fileId); if (item) { openDetail(item); editDetailText(); } }
    function editDetailText() { var item = currentDetailItem; if (!item) return; showModal('<h2>编辑文本</h2><div id="editor-wrapper"><div id="toolbar-container"></div><div id="editor-container"></div></div><div class="btn-row"><button class="btn btn-secondary" id="cancelEdit">取消</button><button class="btn btn-primary" id="saveEdit">保存</button></div>'); document.getElementById("cancelEdit").onclick = closeModal; document.getElementById("saveEdit").onclick = saveDetailText; if (typeof window.wangEditor !== "undefined") { var createEditor = window.wangEditor.createEditor; var createToolbar = window.wangEditor.createToolbar; var editorConfig = { placeholder: "请输入内容..." }; var editor = createEditor({ selector: "#editor-container", html: "<p><br></p>", config: editorConfig, mode: "default" }); createToolbar({ editor: editor, selector: "#toolbar-container", config: {}, mode: "default" }); api("/api/file-content?path=" + encodeURIComponent(joinPath(currentPath, item.name))).then(function(data) { if (data.base64) editor.setHtml(atob(data.base64)); }); window._editor = editor; } else showToast("编辑器未加载"); }
    function saveDetailText() { var editor = window._editor; if (!editor) return; var html = editor.getHtml(); var base64 = btoa(unescape(encodeURIComponent(html))); var item = currentDetailItem; if (item) api("/api/save-content", { method:"POST", body: { path: joinPath(currentPath, item.name), base64: base64, fileId: item.id } }).then(function() { closeModal(); loadTree(); showToast("保存成功"); renderDetail(); }).catch(function(e) { showToast("保存失败: " + e.message); }); }

    // ==================== 初始化 ====================
    function init() {
      loadTree(); loadTasks();
      document.getElementById("refreshBtn").onclick = refreshFileList;
      document.getElementById("backBtn").onclick = closeDetail;
      document.getElementById("fabBtn").onclick = function() { showModal('<h2>添加</h2><div style="display:flex;flex-direction:column;gap:8px;"><button class="btn btn-primary" id="menuUpload">上传文件/文件夹</button><button class="btn btn-secondary" id="menuNewFolder">新建文件夹</button><button class="btn btn-secondary" id="menuNewFile">新建文本文件</button><button class="btn btn-secondary" id="menuOffline">离线下载</button></div>'); document.getElementById("menuUpload").onclick = function() { closeModal(); showUploadModal(); }; document.getElementById("menuNewFolder").onclick = function() { closeModal(); showNewFolderModal(); }; document.getElementById("menuNewFile").onclick = function() { closeModal(); showNewFileModal(); }; document.getElementById("menuOffline").onclick = function() { closeModal(); showOfflineDownloadModal(); }; };
      document.getElementById("taskFabBtn").onclick = openTaskPanel;
      document.getElementById("closeTaskBtn").onclick = closeTaskPanel;
      document.getElementById("taskBackdrop").onclick = closeTaskPanel;
      window.addEventListener("popstate", function(e) { if (e.state && e.state.fileId) { var item = findItemInTree(fileTree, e.state.fileId); if (item) openDetail(item, false); else closeDetail(); } else { currentView = "list"; document.getElementById("detailView").classList.add("hidden"); document.getElementById("mainView").classList.remove("hidden"); refreshFileList(); } });
      var params = new URLSearchParams(window.location.search); var fileId = params.get("file"); if (fileId) { loadTree().then(function() { var item = findItemInTree(fileTree, fileId); if (item && item.type !== "folder") openDetail(item, false); }); }
      setInterval(function() { var oldTasks = JSON.stringify(tasks); loadTasks().then(function() { var newTasks = JSON.stringify(tasks); if (oldTasks !== newTasks) { var hasCompleted = tasks.some(function(t) { return t.status === "completed" || t.status === "failed" || t.status === "cancelled"; }); if (hasCompleted) refreshFileList(); } }); }, 5000);
    }
    init();
  </script>
</body>
</html>
`;

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

async function storeChunk(env, fileId, chunkIndex, base64) {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const kvIndex = getKvIndex(fileId, chunkIndex);
  const kv = env[FILE_KV_BINDINGS[kvIndex]];
  await kv.put('f:' + fileId + ':chunk:' + chunkIndex, arrayBuffer);
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

async function updateTask(env, taskId, updates) {
  const tasks = await env.TASK_KV.get('tasks', 'json') || [];
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    tasks[idx] = { ...tasks[idx], ...updates, updatedAt: Date.now() };
    await env.TASK_KV.put('tasks', JSON.stringify(tasks));
  }
}

async function deleteTask(env, taskId) {
  const tasks = await env.TASK_KV.get('tasks', 'json') || [];
  const filtered = tasks.filter(t => t.id !== taskId);
  await env.TASK_KV.put('tasks', JSON.stringify(filtered));
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
    await updateTask(env, taskId, { status:'completed', progress:100 });
  } catch (e) {
    await updateTask(env, taskId, { status:'failed', error: e.message });
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
      if (path === '/' || path === '/index.html' || path === '/detail') {
        return new Response(HTML, {
          headers: { 'Content-Type': 'text/html;charset=UTF-8', ...headers },
        });
      }

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

      if (path.startsWith('/s/')) {
        const shareId = path.substring(3);
        const fileId = await env.FILE_STRUCTURE_KV.get('share:' + shareId);
        if (!fileId) return new Response('Share link invalid', { status: 404, headers });
        const tree = await getTree(env);
        const item = findItemById(tree, fileId);
        if (!item || item.type !== 'file') return new Response('File not found', { status: 404, headers });
        // 返回详情页 HTML，设置只读模式
        const detailHtml = HTML.replace(
          'var isShareReadonly = false;',
          'var isShareReadonly = true;'
        ).replace(
          '    // ==================== 初始化 ====================',
          '    currentDetailItem = ' + JSON.stringify(item) + '; currentView = "detail";\n    // ==================== 初始化 ===================='
        ).replace(
          'document.getElementById("mainView").classList.remove("hidden");',
          'document.getElementById("mainView").classList.add("hidden"); document.getElementById("detailView").classList.remove("hidden"); renderDetail();'
        );
        return new Response(detailHtml, {
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

        if (apiPath === '/upload/init' && method === 'POST') {
          const { fileId, fileName, uploadPath, chunks, chunkSize, mimeType, size } = body;
          if (!fileId || !fileName || !chunks) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          await env.FILE_STRUCTURE_KV.put('meta:' + fileId, JSON.stringify({ fileName, uploadPath, mimeType, size, chunkSize }));
          return jsonResponse({ success: true }, headers);
        }

        if (apiPath === '/upload/chunk' && method === 'POST') {
          const { fileId, chunkIndex, base64 } = body;
          if (!fileId || chunkIndex === undefined || !base64) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          try {
            await storeChunk(env, fileId, chunkIndex, base64);
            return jsonResponse({ success: true }, headers);
          } catch (e) { return jsonResponse({ error: e.message }, headers, 500); }
        }

        if (apiPath === '/upload/complete' && method === 'POST') {
          const { fileId, chunks } = body;
          if (!fileId || !chunks) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          const meta = await env.FILE_STRUCTURE_KV.get('meta:' + fileId, 'json');
          if (!meta) return jsonResponse({ error: 'Upload metadata not found' }, headers, 400);
          const { fileName, uploadPath, mimeType, size, chunkSize } = meta;
          await addFileToTree(env, uploadPath, fileName, fileId, size, mimeType, chunks, chunkSize || 0);
          await env.FILE_STRUCTURE_KV.delete('meta:' + fileId);
          return jsonResponse({ success: true }, headers);
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

        if (apiPath === '/share' && method === 'POST') {
          const { fileId } = body;
          if (!fileId) return jsonResponse({ error: 'Missing fileId' }, headers, 400);
          const shareId = crypto.randomUUID();
          await env.FILE_STRUCTURE_KV.put('share:' + shareId, fileId);
          return jsonResponse({ shareId }, headers);
        }

        if (apiPath === '/offline' && method === 'POST') {
          const { url, savePath } = body;
          if (!url || !savePath) return jsonResponse({ error: 'Missing url or savePath' }, headers, 400);
          const taskId = await addTask(env, 'download', url, 'processing', 0);
          ctx.waitUntil(handleOfflineDownload(env, url, savePath, taskId));
          return jsonResponse({ success: true, taskId }, headers);
        }

        if (apiPath === '/task/create' && method === 'POST') {
          const { type, name } = body;
          if (!type || !name) return jsonResponse({ error: 'Missing fields' }, headers, 400);
          const taskId = await addTask(env, type, name, 'processing', 0);
          return jsonResponse({ taskId }, headers);
        }

        if (apiPath === '/task/update' && method === 'POST') {
          const { taskId, progress, status, error } = body;
          if (!taskId) return jsonResponse({ error: 'Missing taskId' }, headers, 400);
          const updates = {};
          if (progress !== undefined) updates.progress = progress;
          if (status) updates.status = status;
          if (error) updates.error = error;
          await updateTask(env, taskId, updates);
          return jsonResponse({ success: true }, headers);
        }

        if (apiPath === '/task/delete' && method === 'POST') {
          const { taskId } = body;
          if (!taskId) return jsonResponse({ error: 'Missing taskId' }, headers, 400);
          await deleteTask(env, taskId);
          return jsonResponse({ success: true }, headers);
        }

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
