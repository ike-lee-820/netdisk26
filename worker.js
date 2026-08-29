// 绑定多个 KV：FILE_INDEX, DATA_KV_0 ~ DATA_KV_4
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---------- 辅助函数 ----------
    // 根据 key 的哈希值决定存储到哪个数据 KV (0-4)
    function getDataKV(key, env) {
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
      }
      const idx = Math.abs(hash) % 5;
      return env[`DATA_KV_${idx}`];
    }

    // 文件索引操作
    async function getFileList(env) {
      const raw = await env.FILE_INDEX.get('_filelist');
      return raw ? JSON.parse(raw) : [];
    }

    async function addFileToList(entry, env) {
      let list = await getFileList(env);
      list.push(entry);
      await env.FILE_INDEX.put('_filelist', JSON.stringify(list));
    }

    // ---------- 首页 ----------
    if (path === '/' && request.method === 'GET') {
      return new Response(html, {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    // ---------- 上传文件 ----------
    if (path === '/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || file.size === 0) {
          return new Response('未选择文件', { status: 400 });
        }

        const MAX_SIZE = 100 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
          return new Response('文件过大（最大 100MB）', { status: 413 });
        }

        const mainKey = crypto.randomUUID();
        const CHUNK_SIZE = 10 * 1024 * 1024;
        const fileSize = file.size;
        const dataKV = getDataKV(mainKey, env); // 选择数据 KV

        let meta = {
          filename: file.name,
          path: file.webkitRelativePath || file.name,
          contentType: file.type || 'application/octet-stream',
          size: fileSize,
          uploadedAt: new Date().toISOString(),
          kvIndex: parseInt(dataKV.bindingName.slice(-1)), // 记录存储到哪个 KV
          dataKey: mainKey, // 数据 KV 中的 Key
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

        // 存储元数据到文件索引 KV
        await env.FILE_INDEX.put(mainKey, JSON.stringify(meta));

        // 添加至文件列表
        await addFileToList({
          key: mainKey,
          filename: meta.filename,
          path: meta.path,
          size: meta.size,
          uploadedAt: meta.uploadedAt,
        }, env);

        const fileUrl = new URL(`/file/${mainKey}`, request.url).href;
        const shareUrl = new URL(`/share/${mainKey}`, request.url).href;

        return new Response(
          JSON.stringify({ fileUrl, shareUrl, filename: meta.filename }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response('上传失败：' + err.message, { status: 500 });
      }
    }

    // ---------- 直链下载 ----------
    if (path.startsWith('/file/')) {
      const key = path.slice(6);
      // 从文件索引读取元数据
      const metaRaw = await env.FILE_INDEX.get(key);
      if (!metaRaw) return new Response('文件不存在', { status: 404 });
      const meta = JSON.parse(metaRaw);
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
            'Cache-Control': 'public, max-age=31536000',
          },
        });
      }

      // 单文件
      const dataRaw = await dataKV.get(meta.dataKey);
      if (!dataRaw) return new Response('文件内容丢失', { status: 404 });
      const data = JSON.parse(dataRaw);
      const bytes = Uint8Array.from(atob(data.content), c => c.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          'Content-Type': meta.contentType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(meta.filename)}"`,
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }

    // ---------- 分享页面 ----------
    if (path.startsWith('/share/')) {
      const key = path.slice(7);
      const metaRaw = await env.FILE_INDEX.get(key);
      if (!metaRaw) return new Response('文件不存在', { status: 404 });
      const meta = JSON.parse(metaRaw);
      const downloadUrl = new URL(`/file/${key}`, request.url).href;
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
        <title>分享文件</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:system-ui,sans-serif;background:#f5f7fb;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
          .card{background:#fff;border-radius:16px;padding:40px 36px;max-width:460px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,0.06)}
          h1{font-size:22px;font-weight:500;margin-bottom:12px}
          .info{font-size:14px;color:#555;margin-bottom:4px}
          .btn{display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;margin:16px 0 8px;font-size:16px}
          .btn:hover{background:#1d4ed8}
          .link{background:#f0f2f5;padding:8px 12px;border-radius:6px;font-size:13px;word-break:break-all;margin-top:6px}
        </style>
        </head>
        <body>
        <div class="card">
          <h1>📄 ${meta.filename}</h1>
          <div class="info">大小：${(meta.size/1024/1024).toFixed(2)} MB</div>
          <div class="info">上传：${meta.uploadedAt}</div>
          <a href="${downloadUrl}" class="btn" download>下载文件</a>
          <div class="link">直链：${downloadUrl}</div>
        </div>
        </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      );
    }

    // ---------- 文件列表 ----------
    if (path === '/list') {
      const list = await getFileList(env);
      list.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const rows = list.map(entry => `
        <tr>
          <td>${entry.path}</td>
          <td>${(entry.size / 1024 / 1024).toFixed(2)} MB</td>
          <td>${new Date(entry.uploadedAt).toLocaleString()}</td>
          <td>
            <a href="/file/${entry.key}" target="_blank">下载</a> |
            <a href="/share/${entry.key}" target="_blank">分享</a>
          </td>
        </tr>
      `).join('');

      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width,initial-scale=1.0">
          <title>文件列表</title>
          <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:system-ui,sans-serif;background:#f5f7fb;padding:20px}
            .container{max-width:900px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 4px 12px rgba(0,0,0,0.06)}
            h1{font-weight:500;margin-bottom:16px}
            table{width:100%;border-collapse:collapse;font-size:14px}
            th,td{padding:10px 8px;text-align:left;border-bottom:1px solid #eee}
            th{background:#f8f9fa;font-weight:500}
            .empty{text-align:center;color:#888;padding:30px 0}
            a{color:#2563eb;text-decoration:none}
            a:hover{text-decoration:underline}
            .back{display:inline-block;margin-top:16px;color:#6b7280}
          </style>
        </head>
        <body>
        <div class="container">
          <h1>📁 文件列表</h1>
          <table>
            <thead><tr><th>文件名</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead>
            <tbody>${rows || '<tr class="empty"><td colspan="4">暂无文件</td></tr>'}</tbody>
          </table>
          <a href="/" class="back">← 返回上传</a>
        </div>
        </body>
        </html>
      `, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }

    return new Response('Not Found', { status: 404 });
  },
};

// ---------- 极简首页（保持不变） ----------
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>云盘</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f5f7fb;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:system-ui,sans-serif}
.card{background:#fff;padding:24px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.06);width:100%;max-width:480px}
.drop{background:#f0f2f5;border-radius:8px;padding:32px 16px;text-align:center;cursor:pointer;transition:0.2s;border:2px dashed transparent}
.drop:hover{background:#e8ecf1;border-color:#2563eb}
#file-input{display:none}
#file-list{margin:12px 0;max-height:200px;overflow-y:auto;font-size:14px;color:#333}
#file-list div{padding:4px 0;border-bottom:1px solid #eee}
button{width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-top:12px}
button:hover{background:#1d4ed8}
button:disabled{opacity:0.5}
.toolbar{display:flex;gap:8px;margin-bottom:12px}
.toolbar label{flex:1;background:#f0f2f5;padding:8px;border-radius:6px;text-align:center;cursor:pointer;font-size:14px}
.toolbar label:hover{background:#e8ecf1}
.link{margin:4px 0;background:#f0f2f5;padding:6px 10px;border-radius:4px;font-size:12px;word-break:break-all}
.hidden{display:none}
.result-section{margin-top:12px}
</style>
</head>
<body>
<div class="card">
  <div class="drop" id="drop-area">
    <p>📂 拖放文件/文件夹</p>
    <p style="font-size:12px;color:#888">或点击下方按钮选择</p>
    <input type="file" id="file-input" multiple webkitdirectory>
    <div id="file-list"></div>
  </div>
  <div class="toolbar">
    <label for="file-input">📎 选择文件</label>
    <label onclick="document.getElementById('file-input').webkitdirectory=!document.getElementById('file-input').webkitdirectory;this.textContent=document.getElementById('file-input').webkitdirectory?'📁 文件夹模式':'📎 文件模式'">📁 文件夹模式</label>
  </div>
  <button id="upload-btn">上传所有文件</button>
  <div id="result" class="hidden result-section">
    <div>上传完成，共 <span id="upload-count">0</span> 个文件</div>
    <div><a href="/list" target="_blank">📋 查看文件列表</a></div>
  </div>
</div>
<script>
const drop = document.getElementById('drop-area');
const input = document.getElementById('file-input');
const fileListDiv = document.getElementById('file-list');
const uploadBtn = document.getElementById('upload-btn');
const resultDiv = document.getElementById('result');
const countSpan = document.getElementById('upload-count');

let selectedFiles = [];

// 拖拽事件
drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor='#2563eb'; });
drop.addEventListener('dragleave', () => { drop.style.borderColor='transparent'; });
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.style.borderColor='transparent';
  if (e.dataTransfer.items) {
    const items = e.dataTransfer.items;
    const files = [];
    for (let item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        if (entry.isFile) {
          entry.file(file => files.push(file));
        } else if (entry.isDirectory) {
          readDirectory(entry, files);
        }
      }
    }
    setTimeout(() => {
      if (files.length) {
        input.files = null;
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        input.files = dt.files;
        updateFileList();
      }
    }, 100);
  }
});

function readDirectory(entry, fileList) {
  const reader = entry.createReader();
  reader.readEntries(entries => {
    entries.forEach(e => {
      if (e.isFile) {
        e.file(file => {
          Object.defineProperty(file, 'webkitRelativePath', { value: entry.fullPath + '/' + file.name });
          fileList.push(file);
        });
      } else if (e.isDirectory) {
        readDirectory(e, fileList);
      }
    });
  });
}

input.addEventListener('change', updateFileList);

function updateFileList() {
  selectedFiles = Array.from(input.files);
  fileListDiv.innerHTML = selectedFiles.map(f => `<div>${f.webkitRelativePath || f.name} (${(f.size/1024/1024).toFixed(2)} MB)</div>`).join('');
  if (selectedFiles.length === 0) fileListDiv.innerHTML = '<div style="color:#888">未选择文件</div>';
}

updateFileList();

uploadBtn.onclick = async () => {
  if (selectedFiles.length === 0) return alert('请先选择文件');
  uploadBtn.disabled = true;
  uploadBtn.textContent = '上传中...';
  let successCount = 0;
  for (let file of selectedFiles) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      successCount++;
    } catch (e) {
      console.error('上传失败:', file.name, e);
    }
  }
  uploadBtn.disabled = false;
  uploadBtn.textContent = '上传所有文件';
  resultDiv.classList.remove('hidden');
  countSpan.textContent = successCount;
  input.value = '';
  selectedFiles = [];
  updateFileList();
};
</script>
</body>
</html>`;
