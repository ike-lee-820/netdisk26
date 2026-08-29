// 绑定 KV 命名空间为 MY_KV
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---------- 首页：极简上传 ----------
    if (path === '/' && request.method === 'GET') {
      return new Response(html, {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    // ---------- 上传 ----------
    if (path === '/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || file.size === 0) {
          return new Response('未选择文件', { status: 400 });
        }

        const MAX_SIZE = 100 * 1024 * 1024; // 100MB
        if (file.size > MAX_SIZE) {
          return new Response('文件过大（最大 100MB）', { status: 413 });
        }

        const mainKey = crypto.randomUUID();
        const CHUNK_SIZE = 10 * 1024 * 1024;
        const fileSize = file.size;

        if (fileSize > 20 * 1024 * 1024) {
          const chunks = Math.ceil(fileSize / CHUNK_SIZE);
          const partKeys = [];
          for (let i = 0; i < chunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileSize);
            const chunkBuffer = await file.slice(start, end).arrayBuffer();
            const bytes = new Uint8Array(chunkBuffer);
            const base64 = btoa(String.fromCharCode(...bytes));
            const partKey = `${mainKey}_part_${i}`;
            await env.MY_KV.put(partKey, JSON.stringify({ content: base64 }));
            partKeys.push(partKey);
          }
          const meta = {
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            size: fileSize,
            uploadedAt: new Date().toISOString(),
            type: 'multipart',
            chunks,
            partKeys,
          };
          await env.MY_KV.put(mainKey, JSON.stringify(meta));
        } else {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const base64 = btoa(String.fromCharCode(...bytes));
          await env.MY_KV.put(mainKey, JSON.stringify({
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            size: fileSize,
            uploadedAt: new Date().toISOString(),
            content: base64,
          }));
        }

        const fileUrl = new URL(`/file/${mainKey}`, request.url).href;
        const shareUrl = new URL(`/share/${mainKey}`, request.url).href;

        // 返回极简成功页面
        return new Response(
          `<!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
          <title>上传成功</title>
          <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:system-ui,-apple-system,sans-serif;background:#f5f7fb;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
            .card{background:#fff;border-radius:16px;padding:40px 36px;max-width:520px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,0.06)}
            h1{font-size:24px;font-weight:600;margin-bottom:16px}
            .info{font-size:14px;color:#555;margin-bottom:6px}
            .link-group{margin:20px 0 12px}
            .link{display:block;background:#f0f2f5;padding:10px 14px;border-radius:8px;font-size:14px;word-break:break-all;margin:6px 0;color:#1a1a2e}
            .btn{background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;margin-right:8px}
            .btn:hover{background:#1d4ed8}
            .btn-outline{background:transparent;color:#2563eb;border:1px solid #2563eb}
            .btn-outline:hover{background:#eef2ff}
            .home{display:inline-block;margin-top:12px;color:#6b7280;text-decoration:none;font-size:14px}
            .home:hover{text-decoration:underline}
          </style>
          </head>
          <body>
          <div class="card">
            <h1>✓ 上传完成</h1>
            <div class="info">${file.name} · ${(fileSize/1024/1024).toFixed(2)} MB</div>
            <div class="link-group">
              <div class="link" id="fileLink">${fileUrl}</div>
              <div class="link" id="shareLink">${shareUrl}</div>
            </div>
            <button class="btn" onclick="copy('fileLink')">复制直链</button>
            <button class="btn" onclick="copy('shareLink')">复制分享链接</button>
            <a href="/" class="home">← 返回上传</a>
          </div>
          <script>
            function copy(id) {
              const text = document.getElementById(id).textContent;
              navigator.clipboard?.writeText(text).then(()=>alert('已复制')).catch(()=>{
                const ta=document.createElement('textarea');
                ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); alert('已复制');
              });
            }
          </script>
          </body>
          </html>`,
          { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
        );
      } catch (err) {
        return new Response('上传失败：' + err.message, { status: 500 });
      }
    }

    // ---------- 直链下载（含分片拼接） ----------
    if (path.startsWith('/file/')) {
      const key = path.slice(6);
      const raw = await env.MY_KV.get(key);
      if (!raw) return new Response('文件不存在', { status: 404 });
      const data = JSON.parse(raw);

      if (data.type === 'multipart') {
        const { partKeys, contentType, filename, size } = data;
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for (const partKey of partKeys) {
                const partRaw = await env.MY_KV.get(partKey);
                if (!partRaw) throw new Error(`Missing part: ${partKey}`);
                const partData = JSON.parse(partRaw);
                const binary = atob(partData.content);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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
      const binary = atob(data.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Response(bytes, {
        headers: {
          'Content-Type': data.contentType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(data.filename)}"`,
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }

    // ---------- 分享页面 ----------
    if (path.startsWith('/share/')) {
      const key = path.slice(7);
      const raw = await env.MY_KV.get(key);
      if (!raw) return new Response('文件不存在', { status: 404 });
      const data = JSON.parse(raw);
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
          <h1>📄 ${data.filename}</h1>
          <div class="info">大小：${(data.size/1024/1024).toFixed(2)} MB</div>
          <div class="info">上传：${data.uploadedAt}</div>
          <a href="${downloadUrl}" class="btn" download>下载文件</a>
          <div class="link">直链：${downloadUrl}</div>
        </div>
        </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      );
    }

    return new Response('Not Found', { status: 404 });
  },
};

// ---------- 极简首页 ----------
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>云盘</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#f5f7fb;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
.card{background:#fff;border-radius:16px;padding:40px 36px;max-width:440px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,0.06)}
h1{font-size:28px;font-weight:500;margin-bottom:6px}
.sub{color:#888;font-size:15px;margin-bottom:28px}
.drop{border:2px dashed #d1d5db;border-radius:12px;padding:32px 16px;text-align:center;cursor:pointer;transition:0.2s}
.drop:hover{border-color:#2563eb;background:#f8faff}
.drop .icon{font-size:40px;display:block;margin-bottom:8px}
.drop p{color:#666;font-size:15px}
.drop .browse{color:#2563eb;font-weight:500;text-decoration:underline;cursor:pointer}
#file-input{display:none}
#file-name{margin-top:12px;font-size:14px;color:#333;display:none}
.upload-btn{width:100%;margin-top:24px;padding:14px;background:#2563eb;color:#fff;border:none;border-radius:40px;font-size:18px;font-weight:500;cursor:pointer;transition:0.2s}
.upload-btn:hover{background:#1d4ed8}
.upload-btn:disabled{opacity:0.5;cursor:not-allowed}
</style>
</head>
<body>
<div class="card">
  <h1>☁️ 云盘</h1>
  <div class="sub">拖拽或点击上传 · 自动分片</div>
  <form id="upload-form" enctype="multipart/form-data">
    <div class="drop" id="drop-area">
      <span class="icon">📂</span>
      <p>拖放文件到此处</p>
      <p><span class="browse" onclick="document.getElementById('file-input').click()">或浏览文件</span></p>
      <input type="file" name="file" id="file-input" required>
      <div id="file-name"></div>
    </div>
    <button type="submit" class="upload-btn" id="upload-btn">上传</button>
  </form>
</div>
<script>
const drop=document.getElementById('drop-area'), input=document.getElementById('file-input'), nameDisplay=document.getElementById('file-name'), form=document.getElementById('upload-form'), btn=document.getElementById('upload-btn');
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover')});
drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');if(e.dataTransfer.files.length){input.files=e.dataTransfer.files;update()}});
input.addEventListener('change',update);
function update(){const f=input.files[0];if(f){nameDisplay.textContent='✅ '+f.name+' ('+(f.size/1024/1024).toFixed(2)+' MB)';nameDisplay.style.display='block'}else nameDisplay.style.display='none'}
form.addEventListener('submit',async e=>{e.preventDefault();const f=input.files[0];if(!f)return alert('请选择文件');if(f.size>100*1024*1024)return alert('文件超过100MB');btn.disabled=true;btn.textContent='⏳';const fd=new FormData();fd.append('file',f);try{const res=await fetch('/upload',{method:'POST',body:fd});if(!res.ok)throw new Error(await res.text());document.open();document.write(await res.text());document.close()}catch(err){alert('错误：'+err.message);btn.disabled=false;btn.textContent='上传'}});
</script>
</body>
</html>`;
