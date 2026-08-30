/**
 * NetDisk 直链网盘 —— Cloudflare Worker
 * =====================================================================
 * 存储策略：
 *   - 文件 < 10MB                  -> 保存到 KV 二进制 (FILE_KV_1..5 轮询)
 *   - 文件 10MB ~ 80MB             -> 保存到 GitHub（以 ssid 建同名仓库）
 *   - 文件 > 80MB                  -> GitHub 仓库，按 50MB/片 分片上传
 *
 * 依赖的环境变量 / 绑定：
 *   CLOUD_PASSWORD                分享页/下载直链之外的访问密码（留空则开放）
 *   GITHUB_TOKEN                  创建仓库与内容上传用的 GitHub PAT（需 repo 权限）
 *   FILE_KV_1..5 / FILE_STRUCTURE_KV / TASK_KV   见 wrangler.jsonc
 *
 * 路由：
 *   /           管理页（密码保护 SPA）
 *   /s/{shareId}  分享页（仅下载+预览，无需密码）
 *   /d/{ssid}     直链下载（无需密码，attachment）
 *   /dl/{ssid}    直链下载别名
 *   /p/{ssid}     内联预览（无需密码，inline）
 *   /api/*        管理 API（需密码）
 * =====================================================================
 */

const OWNER = 'ikecode26';
const PART_SIZE = 50 * 1024 * 1024;          // GitHub 分片大小 50MB
const KV_THRESHOLD = 10 * 1024 * 1024;       // 小于此值存 KV
const KV_BINDINGS = ['FILE_KV_1', 'FILE_KV_2', 'FILE_KV_3', 'FILE_KV_4', 'FILE_KV_5'];

const MIME = {
  '.html': 'text/html;charset=utf-8', '.htm': 'text/html;charset=utf-8', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.txt': 'text/plain;charset=utf-8', '.md': 'text/markdown;charset=utf-8',
  '.log': 'text/plain;charset=utf-8', '.csv': 'text/csv;charset=utf-8',
  '.xml': 'application/xml', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.flac': 'audio/flac', '.aac': 'audio/aac', '.mid': 'audio/midi',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.flv': 'video/x-flv', '.m4v': 'video/x-m4v',
  '.zip': 'application/zip', '.rar': 'application/x-rar-compressed', '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar', '.gz': 'application/gzip', '.bz2': 'application/x-bzip2',
  '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.apk': 'application/vnd.android.package-archive', '.torrent': 'application/x-bittorrent',
  '.epub': 'application/epub+zip', '.wasm': 'application/wasm',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/s/'))  return serveShare(request, env, path.slice(3));
    if (path.startsWith('/d/'))  return serveFile(request, env, path.slice(3), 'attachment');
    if (path.startsWith('/dl/')) return serveFile(request, env, path.slice(4), 'attachment');
    if (path.startsWith('/p/'))  return serveFile(request, env, path.slice(3), 'inline');
    if (path.startsWith('/api/')) return handleApi(request, env, ctx, url);

    if (path === '/' || path === '') {
      return new Response(managerHTML(), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }
    return new Response('Not Found', { status: 404 });
  },
};

/* =====================================================================
 * 工具函数
 * ===================================================================== */
function norm(p) {
  p = ('/' + String(p || '').replace(/\\/g, '/')).replace(/\/+/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}
function dirname(p) {
  if (!p || p === '/' || !p.includes('/')) return '/';
  return p.slice(0, p.lastIndexOf('/')) || '/';
}
function basename(p) {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}
function joinPath(parent, name) {
  return norm((parent === '/' ? '/' : parent) + '/' + name);
}
function mimeOf(name) {
  const i = name.lastIndexOf('.');
  const ext = i >= 0 ? name.slice(i).toLowerCase() : '';
  return MIME[ext] || 'application/octet-stream';
}
function isTextual(mime) {
  return mime.startsWith('text/') || /json|xml|svg|javascript|markdown|javascript/.test(mime) || mime.endsWith('charset=utf-8');
}
function randomId(n) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
function makeSsid() {
  try { return crypto.randomUUID().replace(/-/g, '') + randomId(6); }
  catch (e) { return randomId(24); }
}
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json;charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}
function jsonErr(msg, status) {
  return json({ ok: false, error: msg }, status || 400);
}
function concatBytes(list, total) {
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of list) { out.set(b, off); off += b.byteLength; }
  return out;
}
function bytesToBase64(u8) {
  let bin = '';
  const chunk = 0x7fff;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function authOk(request, env) {
  if (!env.CLOUD_PASSWORD) return true;
  const a = request.headers.get('Authorization') || '';
  if (a.replace(/^Bearer\s+/i, '').trim() === env.CLOUD_PASSWORD) return true;
  return (new URL(request.url).searchParams.get('pwd') === env.CLOUD_PASSWORD);
}
function dispatcher(name) {
  const h = { 'hash': 0 };
  for (let i = 0; i < name.length; i++) h.hash = (h.hash * 31 + name.charCodeAt(i)) >>> 0;
  return KV_BINDINGS[h.hash % KV_BINDINGS.length];
}

/* ---- 文件结构树存储 ---- */
async function readTree(env) {
  const raw = await env.FILE_STRUCTURE_KV.get('root');
  const tree = raw ? JSON.parse(raw) : {};
  if (!tree['__v']) tree['__v'] = 1; // 兼容
  return tree;
}
async function writeTree(env, tree) {
  await env.FILE_STRUCTURE_KV.put('root', JSON.stringify(tree));
}
async function getEntryByPath(env, path) {
  const t = await readTree(env);
  return t[norm(path)] || null;
}
async function putMeta(env, entry) {
  if (entry.ssid) await env.FILE_STRUCTURE_KV.put('ssid:' + entry.ssid, JSON.stringify(entry));
}
async function delMeta(env, entry) {
  if (entry.ssid) await env.FILE_STRUCTURE_KV.delete('ssid:' + entry.ssid);
}

/* ---- 任务读写 ---- */
async function getTask(env, id) {
  const raw = await env.TASK_KV.get('task:' + id);
  return raw ? JSON.parse(raw) : null;
}
async function putTask(env, task) {
  await env.TASK_KV.put('task:' + task.id, JSON.stringify(task));
}
async function clearTaskData(env, id) {
  const list = await env.TASK_KV.list({ prefix: 'tdata:' + id + ':' });
  for (let i = 0; i < list.keys.length; i++) {
    await env.TASK_KV.delete(list.keys[i].name);
  }
}

/* 串行化目录树读改写，避免并行上传/操作时丢失更新（同一 isolate 内互斥） */
let _treeMutex = Promise.resolve();
function mutateTree(env, fn) {
  const run = _treeMutex.then(async () => {
    const t = await readTree(env);
    const r = await fn(t);
    await writeTree(env, t);
    return r;
  });
  _treeMutex = run.then(() => {}, () => {});
  return run;
}

/* =====================================================================
 * GitHub 存储层
 * ===================================================================== */
function ghHeaders(token, jsonBody) {
  const h = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'netdisk-worker',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (jsonBody !== false) h['Content-Type'] = 'application/json';
  return h;
}
async function ghCheck(res, tip) {
  if (!res.ok) {
    const t = await res.text();
    throw new Error((tip || 'GitHub 请求失败') + ' ' + res.status + ': ' + t.slice(0, 200));
  }
  return res;
}

async function createRepo(token, ssid) {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ name: ssid, description: 'netdisk file', private: false, auto_init: false, has_issues: false, has_wiki: false }),
  });
  await ghCheck(res, '创建 GitHub 仓库失败');
  return 'main';
}
async function uploadBlob(token, ssid, base64) {
  const res = await fetch('https://api.github.com/repos/' + OWNER + '/' + ssid + '/git/blobs', {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ content: base64, encoding: 'base64' }),
  });
  await ghCheck(res, '上传分片失败');
  const j = await res.json();
  return j.sha;
}
async function finalizeRepo(token, ssid, treeItems) {
  const branch = 'main';
  const treeRes = await fetch('https://api.github.com/repos/' + OWNER + '/' + ssid + '/git/trees', {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ tree: treeItems }),
  });
  await ghCheck(treeRes, '创建 tree 失败');
  const treeSha = (await treeRes.json()).sha;

  const commitRes = await fetch('https://api.github.com/repos/' + OWNER + '/' + ssid + '/git/commits', {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ message: 'upload ' + ssid, tree: treeSha, parents: [] }),
  });
  await ghCheck(commitRes, '创建 commit 失败');
  const commitSha = (await commitRes.json()).sha;

  const refRes = await fetch('https://api.github.com/repos/' + OWNER + '/' + ssid + '/git/refs', {
    method: 'POST', headers: ghHeaders(token),
    body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: commitSha }),
  });
  await ghCheck(refRes, '更新分支失败');
  return treeItems.map((i) => i.path);
}

/* 将整个文件字节数组保存为 GitHub 分片（每片最终以 part_N 命名） */
async function savePartsToGithub(env, ssid, bytes) {
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error('未配置 GITHUB_TOKEN');
  await createRepo(token, ssid);
  const items = [];
  let list = [], sum = 0;
  const flush = async () => {
    const p = concatBytes(list, sum);
    const b64 = bytesToBase64(p);
    const sha = await uploadBlob(token, ssid, b64);
    items.push({ path: 'part_' + (items.length), mode: '100644', type: 'blob', sha });
    list = []; sum = 0;
  };
  let off = 0;
  while (off < bytes.byteLength) {
    const len = Math.min(PART_SIZE, bytes.byteLength - off);
    list.push(bytes.slice(off, off + len));
    sum += len;
    off += len;
    if (sum >= PART_SIZE) await flush();
  }
  if (sum > 0) await flush();
  const chunkPaths = await finalizeRepo(token, ssid, items);
  return { storage: 'github', repo: ssid, chunks: chunkPaths };
}

/* 流式下载：依次取每个分片 download_url 并拼接（支持大文件、不占内存） */
async function githubStream(env, meta) {
  const token = env.GITHUB_TOKEN;
  const branch = 'main';
  const paths = (meta.chunks && meta.chunks.length) ? meta.chunks : ['part_0'];
  let i = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      if (i >= paths.length) { controller.close(); return; }
      const part = paths[i++];
      try {
        const info = await fetch('https://api.github.com/repos/' + OWNER + '/' + (meta.repo || meta.ssid) + '/contents/' + part + '?ref=' + branch, {
          headers: ghHeaders(token),
        });
        await ghCheck(info, '获取 download_url 失败');
        const j = await info.json();
        if (!j.download_url) throw new Error('无 download_url');
        const r = await fetch(j.download_url, { headers: ghHeaders(token) });
        if (!r.ok || !r.body) throw new Error('数据源拉取失败 ' + r.status);
        const reader = r.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (e) { controller.error(e); }
    },
    cancel() {},
  });
  return stream;
}

/* 删除单个文件的线下存储 */
async function removeFileStorage(env, e) {
  try {
    if (e.storage === 'kv') {
      const kv = env[e.kvBinding];
      if (kv) await kv.delete(e.kvKey);
    } else if (e.storage === 'github') {
      await fetch('https://api.github.com/repos/' + OWNER + '/' + (e.repo || e.ssid), {
        method: 'DELETE', headers: ghHeaders(env.GITHUB_TOKEN),
      });
    }
  } catch (err) { /* 忽略线下删除失败，元数据照常清理 */ }
}

/* =====================================================================
 * 文件分发（下载 / 直链 / 预览）
 * ===================================================================== */
function disposition(value, name) {
  return value + '; filename="' + (name.replace(/"/g, '')) + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}
async function serveFile(request, env, ssid, mode) {
  const raw = await env.FILE_STRUCTURE_KV.get('ssid:' + ssid);
  if (!raw) return new Response('文件不存在或已删除', { status: 404 });
  const meta = JSON.parse(raw);
  const ct = meta.mime || mimeOf(meta.name);

  let body;
  let bodyLen = null;
  if (meta.storage === 'kv') {
    const kv = env[meta.kvBinding];
    const buf = await kv.get(meta.kvKey, 'arrayBuffer');
    if (buf == null) return new Response('存储数据丢失', { status: 410 });
    body = buf;
    bodyLen = buf.byteLength;
  } else {
    body = await githubStream(env, meta);
  }

  const headers = {
    'Content-Type': ct,
    'Content-Disposition': disposition(mode === 'inline' ? 'inline' : 'attachment', meta.name),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };
  if (bodyLen != null) headers['Content-Length'] = String(bodyLen);
  return new Response(body, { headers });
}

/* ---- 分享页 ---- */
async function serveShare(request, env, id) {
  const raw = await env.FILE_STRUCTURE_KV.get('share:' + id);
  if (!raw) return new Response('分享不存在或已失效', { status: 404, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  const share = JSON.parse(raw);
  const metaRaw = await env.FILE_STRUCTURE_KV.get('ssid:' + share.ssid);
  if (!metaRaw) return new Response('文件已不存在', { status: 410, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  const meta = JSON.parse(metaRaw);
  const html = sharePageHTML(share.id, meta);
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}

/* =====================================================================
 * 管理 API
 * ===================================================================== */
async function handleApi(request, env, ctx, url) {
  if (!authOk(request, env)) return jsonErr('需要密码', 401);

  const route = url.pathname.slice('/api/'.length).replace(/\/$/, '');
  const isRawChunk = route === 'task/chunk';
  const body = (request.method === 'POST' && !isRawChunk) ? await readJson(request) : null;

  switch (route) {
    case 'list': {                 /* GET /api/list?path=/            */
      const dir = norm(url.searchParams.get('path') || '/');
      const tree = await readTree(env);
      const out = [];
      for (const [p, e] of Object.entries(tree)) {
        if (e.parent === dir) out.push(e);
      }
      out.sort((a, b) => (a.type === b.type) ? a.name.localeCompare(b.name, 'zh') : (a.type === 'folder' ? -1 : 1));
      return json({ ok: true, type: 'dir', path: dir, entries: out });
    }
    case 'mkdir': {                /* POST {parent,name}               */
      try {
        const parent = norm(body.parent || '/');
        const name = String(body.name || '').trim();
        if (!name) return jsonErr('名称不能为空');
        const path = joinPath(parent, name);
        const entry = await mutateTree(env, (tree) => {
          if (tree[path]) throw new Error('已存在同名文件/文件夹');
          if (tree[parent] && tree[parent].type !== 'folder') throw new Error('父路径不是文件夹');
          const e = { name, path, parent, type: 'folder', mtime: Date.now() };
          tree[path] = e;
          return e;
        });
        return json({ ok: true, entry });
      } catch (e) { return jsonErr(e.message); }
    }
    case 'mkfile': {               /* POST {parent,name,content}        */
      try {
        const parent = norm(body.parent || '/');
        const name = String(body.name || '').trim();
        if (!name) return jsonErr('名称不能为空');
        const content = String(body.content ?? '');
        const path = joinPath(parent, name);
        const bytes = new TextEncoder().encode(content);
        const entry = await mutateTree(env, async (tree) => {
          if (tree[path]) throw new Error('已存在同名文件/文件夹');
          const e = await storeBytes(env, { parent, name, path }, bytes, name);
          tree[path] = e;
          return e;
        });
        return json({ ok: true, entry });
      } catch (e) { return jsonErr(e.message); }
    }
    case 'rename': {               /* POST {path,newName}               */
      try {
        const path = norm(body.path || '');
        const newName = String(body.newName || '').trim();
        if (!path || path === '/' || !newName) return jsonErr('参数错误');
        if (path === newName) return json({ ok: true });
        const newPath = joinPath(dirname(path), newName);
        await mutateTree(env, async (tree) => {
          const entry = tree[path];
          if (!entry) throw new Error('路径不存在');
          if (tree[newPath]) throw new Error('目标已存在同名项');
          entry.name = newName; entry.path = newPath; entry.parent = dirname(newPath); entry.mtime = Date.now();
          delete tree[path]; tree[newPath] = entry;
          if (entry.ssid) await putMeta(env, entry);
          const moves = [];
          for (const p of Object.keys(tree)) {
            if (p.startsWith(path + '/')) moves.push(p);
          }
          for (const p of moves) {
            const e = tree[p];
            delete tree[p];
            e.path = newPath + p.slice(path.length);
            e.parent = dirname(e.path);
            tree[e.path] = e;
            if (e.ssid) await putMeta(env, e);
          }
        });
        return json({ ok: true });
      } catch (e) { return jsonErr(e.message); }
    }
    case 'delete': {               /* POST {path}  递归删除             */
      try {
        const path = norm(body.path || '');
        if (!path || path === '/') return jsonErr('不能删除根目录');
        const deleted = await mutateTree(env, async (tree) => {
          const targets = [];
          for (const p of Object.keys(tree)) {
            if (p === path || p.startsWith(path + '/')) targets.push(tree[p]);
          }
          if (!targets.length) throw new Error('路径不存在');
          for (const e of targets) {
            await removeFileStorage(env, e);
            await delMeta(env, e);
            delete tree[e.path];
          }
          return targets.length;
        });
        return json({ ok: true, deleted });
      } catch (e) { return jsonErr(e.message); }
    }
    case 'content': {              /* GET /api/content?path=            */
      const path = norm(url.searchParams.get('path') || '');
      const tree = await readTree(env);
      const entry = tree[path];
      if (!entry || entry.type !== 'file') return jsonErr('非文件');
      const ct = entry.mime || mimeOf(entry.name);
      if (!isTextual(ct)) return jsonErr('非文本文件', 400);
      const txt = await readText(env, entry);
      return json({ ok: true, entry, content: txt });
    }
    case 'save': {                 /* POST {path, content}               */
      try {
        const path = norm(body.path || '');
        await mutateTree(env, async (tree) => {
          const entry = tree[path];
          if (!entry || entry.type !== 'file') throw new Error('非文件');
          if (entry.storage !== 'kv') throw new Error('仅支持 KV 存储的小型文本文件在线编辑');
          const bytes = new TextEncoder().encode(String(body.content ?? ''));
          const kv = env[entry.kvBinding];
          await kv.put(entry.kvKey, bytes);
          entry.size = bytes.byteLength; entry.mtime = Date.now();
          if (entry.ssid) await putMeta(env, entry);
        });
        return json({ ok: true });
      } catch (e) { return jsonErr(e.message); }
    }
    case 'share': {                /* POST {path}  => {url}              */
      const path = norm(body.path || '');
      const tree = await readTree(env);
      const entry = tree[path];
      if (!entry || entry.type !== 'file') return jsonErr('只能分享文件');
      const sid = randomId(14);
      await env.FILE_STRUCTURE_KV.put('share:' + sid, JSON.stringify({ id: sid, ssid: entry.ssid, name: entry.name }));
      return json({ ok: true, url: '/s/' + sid });
    }
    /* ---------------- 任务（上传） ---------------- */
    case 'task/start': {
      const parent = norm(body.parent || '/');
      const name = String(body.name || '').trim();
      const size = Number(body.size) || 0;
      if (!name) return jsonErr('文件名不能为空');
      if (!size) return jsonErr('文件为空');
      const id = randomId(16);
      const task = {
        id, name, parent, path: joinPath(parent, name), size,
        bytesReceived: 0, slices: 0, status: 'uploading',
        stage: '等待上传', error: '', createdAt: Date.now(), updatedAt: Date.now(), finishedAt: 0,
      };
      await putTask(env, task);
      return json({ ok: true, taskId: id });
    }
    case 'task/chunk': {           /* POST /api/task/chunk?task=&index=  原始二进制 body */
      const id = url.searchParams.get('task');
      const idx = Number(url.searchParams.get('index'));
      const task = await getTask(env, id);
      if (!task) return jsonErr('任务不存在', 404);
      if (task.status !== 'uploading') return jsonErr('任务已完成或已取消');
      const buf = await request.arrayBuffer();
      await env.TASK_KV.put('tdata:' + id + ':' + idx, buf);       // 分片暂存 KV
      task.bytesReceived += buf.byteLength;
      task.slices = idx + 1;
      task.stage = '上传到服务器';
      task.updatedAt = Date.now();
      await putTask(env, task);
      return json({ ok: true, bytesReceived: task.bytesReceived, size: task.size });
    }
    case 'task/complete': {        /* POST /api/task/complete?task=     */
      const id = url.searchParams.get('task');
      const task = await getTask(env, id);
      if (!task) return jsonErr('任务不存在', 404);
      if (task.status !== 'uploading') return jsonErr('任务状态异常');
      try {
        task.stage = '处理文件，上传服务器'; task.status = 'processing'; task.updatedAt = Date.now();
        await putTask(env, task);
        const entry = await assembleAndStore(env, task);
        task.status = 'done'; task.stage = '完成'; task.finishedAt = Date.now();
        await putTask(env, task);
        await clearTaskData(env, id);
        return json({ ok: true, entry });
      } catch (e) {
        task.status = 'error'; task.error = String(e.message || e); task.stage = '失败';
        await putTask(env, task);
        return jsonErr('处理失败：' + e.message, 500);
      }
    }
    case 'task/cancel': {          /* POST /api/task/cancel?task=       */
      const id = url.searchParams.get('task');
      const task = await getTask(env, id);
      if (task) {
        task.status = 'cancelled'; task.stage = '已取消';
        await putTask(env, task);
        await clearTaskData(env, id);
      }
      return json({ ok: true });
    }
    case 'task/delete': {          /* DELETE /api/task/delete?task=     */
      const id = url.searchParams.get('task');
      await clearTaskData(env, id);
      await env.TASK_KV.delete('task:' + id);
      return json({ ok: true });
    }
    case 'task/list': {
      const list = await env.TASK_KV.list({ prefix: 'task:' });
      const tasks = [];
      for (const k of list.keys) {
        const raw = await env.TASK_KV.get(k.name);
        if (raw) tasks.push(JSON.parse(raw));
      }
      tasks.sort((a, b) => b.createdAt - a.createdAt);
      return json({ ok: true, tasks });
    }
    default:
      return jsonErr('未知接口 /api/' + route, 404);
  }
}

async function readJson(request) {
  const t = await request.text();
  if (!t) return {};
  try { return JSON.parse(t); } catch (e) { return {}; }
}

/* 组装分片并决定写入 KV 或 GitHub */
async function assembleAndStore(env, task) {
  // 读取全部分片
  const list = [];
  let total = 0;
  for (let i = 0; i < task.slices; i++) {
    const ab = await env.TASK_KV.get('tdata:' + task.id + ':' + i, 'arrayBuffer');
    if (ab == null) throw new Error('分片缺失：' + i);
    const u = new Uint8Array(ab);
    list.push(u); total += u.byteLength;
  }
  const bytes = concatBytes(list, total);
  task.stage = '写入底层存储';
  await putTask(env, task);

  const ssid = makeSsid();
  let storage, repo, kvBinding, kvKey, chunks;
  if (total < KV_THRESHOLD) {
    kvBinding = dispatcher(ssid);
    kvKey = 'file:' + ssid;
    await env[kvBinding].put(kvKey, bytes);
    storage = 'kv';
  } else {
    const r = await savePartsToGithub(env, ssid, bytes);
    storage = r.storage; repo = r.repo; chunks = r.chunks;
  }
  // 更新文件结构树（使用串行化互斥，避免并行完成的任务丢失更新）
  const entry = await mutateTree(env, async (tree) => {
    if (tree[task.path]) throw new Error('存在同名文件，请先重命名');
    const e = {
      name: task.name, path: task.path, parent: task.parent, type: 'file',
      size: total, mtime: Date.now(), mime: mimeOf(task.name),
      storage, ssid, repo: repo || null, chunks: chunks || null,
      kvBinding: kvBinding || null, kvKey: kvKey || null,
    };
    tree[task.path] = e;
    await putMeta(env, e);
    return e;
  });
  return entry;
}

/* 由 storeBytes 使用（mkfile 等小文本直存 KV） */
async function storeBytes(env, info, bytes, name) {
  const ssid = makeSsid();
  let entry;
  if (bytes.byteLength < KV_THRESHOLD) {
    const kvBinding = dispatcher(ssid);
    const kvKey = 'file:' + ssid;
    await env[kvBinding].put(kvKey, bytes);
    entry = { ...info, type: 'file', size: bytes.byteLength, mtime: Date.now(), mime: mimeOf(name), storage: 'kv', ssid, kvBinding, kvKey, repo: null, chunks: null };
  } else {
    const r = await savePartsToGithub(env, ssid, bytes);
    entry = { ...info, type: 'file', size: bytes.byteLength, mtime: Date.now(), mime: mimeOf(name), storage: 'github', ssid, repo: r.repo, chunks: r.chunks, kvBinding: null, kvKey: null };
  }
  await putMeta(env, entry);
  return entry;
}

async function readText(env, entry) {
  if (entry.storage === 'kv') {
    const kv = env[entry.kvBinding];
    const buf = await kv.get(entry.kvKey, 'arrayBuffer');
    if (buf == null) return '';
    return new TextDecoder().decode(buf);
  }
  // GitHub 文本：拉取第一个分片解码
  if (entry.chunks && entry.chunks.length) {
    const token = env.GITHUB_TOKEN;
    const info = await fetch('https://api.github.com/repos/' + OWNER + '/' + (entry.repo || entry.ssid) + '/contents/' + entry.chunks[0] + '?ref=main', { headers: ghHeaders(token) });
    await ghCheck(info, '读取失败');
    const j = await info.json();
    if (j.download_url) {
      const r = await fetch(j.download_url, { headers: ghHeaders(token) });
      const b = await r.arrayBuffer();
      return new TextDecoder().decode(b);
    }
  }
  return '';
}

/* =====================================================================
 * 前端资源
 * ===================================================================== */
function sharePageHTML(id, meta) {
  const ct = meta.mime || mimeOf(meta.name);
  const preview = previewBlock(meta.ssid, meta.name, ct);
  return '<!doctype html><html lang="zh"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>分享 · ' + escHtml(meta.name) + '</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">'
    + '<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">'
    + '<style>' + SHARE_CSS + '</style></head><body>'
    + '<div class="card"><div class="head"><span class="mi">share</span><div><div class="t">文件分享</div><div class="sub">' + escHtml(meta.name) + ' · ' + fmtSize(meta.size) + '</div></div></div>'
    + '<div class="prev">' + preview + '</div>'
    + '<a class="btn" href="/dl/' + escAttr(meta.ssid) + '"><span class="mi">download</span>下载文件</a>'
    + '</div></body></html>';
}

function fmtSize(n) {
  if (n == null) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) {
  return escHtml(s).replace(/'/g, '&#39;');
}

/* 预览区块（分享页 / 详情页共用逻辑，由前端 JS 也实现） */
function previewBlock(ssid, name, ct) {
  if (ct.startsWith('image/')) return '<img class="pv" src="/p/' + ssid + '" alt="">';
  if (ct.startsWith('video/')) return '<video class="pv" src="/p/' + ssid + '" controls></video>';
  if (ct.startsWith('audio/')) return '<audio class="pv" src="/p/' + ssid + '" controls></audio>';
  if (isTextual(ct)) return '<iframe class="pv" src="/p/' + ssid + '"></iframe>';
  if (ct.indexOf('zip') >= 0 || ct.indexOf('rar') >= 0 || ct.indexOf('tar') >= 0 || ct.indexOf('7z') >= 0)
    return '<div class="pvn"><span class="mi">archive</span><div>压缩包无法在线预览，请下载后查看</div></div>';
  return '<div class="pvn"><span class="mi">insert_drive_file</span><div>该类型暂不支持在线预览</div></div>';
}

const SHARE_CSS = `
:root{--pri:#6200ee;--pri2:#7c4dff;}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#f3f1f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.12);width:100%;max-width:640px;overflow:hidden}
.head{display:flex;gap:14px;align-items:center;padding:22px 24px;background:linear-gradient(135deg,var(--pri),var(--pri2));color:#fff}
.head .mi{font-size:34px}
.t{font-size:18px;font-weight:500}
.sub{font-size:13px;opacity:.9;word-break:break-all}
.prev{width:100%;background:#000}
.pv{width:100%;max-height:420px;object-fit:contain;display:block}
.audio,.video{width:100%}
.pvn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:60px 20px;color:#666;background:#fafafa}
.pvn .mi{font-size:56px;color:#bbb}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;margin:20px auto;padding:13px 30px;background:var(--pri);color:#fff;border:none;border-radius:28px;font-size:15px;text-decoration:none;cursor:pointer;width:fit-content;transition:.2s}
.btn:hover{background:var(--pri2)}
`;

/* =====================================================================
 * 管理页 SPA（Material Design）。下方所有字符串均避免使用反引号。
 * ===================================================================== */
function managerHTML() {
  return '<!doctype html><html lang="zh"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">'
  + '<title>NetDisk 网盘</title>'
  + '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">'
  + '<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">'
  + '<style>' + MANAGER_CSS + '</style></head><body>'
  + '<div id="app"></div>'
  + '<div id="lock" class="lock" style="display:none"><div class="lockcard"><span class="mi lg">lock</span>'
  + '<div class="lt">网盘已加锁</div><div class="ls">请输入访问密码</div>'
  + '<input id="pwd" class="tin" type="password" placeholder="访问密码">'
  + '<button class="btn f" onclick="tryLogin()"><span class="mi">arrow_forward</span>解锁</button>'
  + '<div id="loberr" class="lerr"></div></div></div>'
  + '<div id="snack" class="snack"></div>'
  + '<script>' + MANAGER_JS + '</script></body></html>';
}

const MANAGER_JS = `
(function () {
  'use strict';
  var state = {
    path: '/',
    entries: [],
    token: window.localStorage.getItem('nd_pwd') || '',
    tasks: [],
    taskTimers: {},
    dt: {}
  };
  var app = document.getElementById('app');
  var base = {};

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function fmtSize(n) { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'; return (n / 1073741824).toFixed(2) + ' GB'; }
  function iconOf(e) {
    if (e.type === 'folder') return 'folder';
    var m = (e.mime || '').toLowerCase();
    if (m && m.indexOf('image') === 0) return 'image';
    if (m && m.indexOf('video') === 0) return 'movie';
    if (m && m.indexOf('audio') === 0) return 'music_note';
    if (m && m.indexOf('zip') >= 0 || m.indexOf('rar') >= 0 || m.indexOf('7z') >= 0) return 'folder_zip';
    if (m && m.indexOf('text') === 0 || m.indexOf('json') >= 0 || m.indexOf('xml') >= 0) return 'description';
    return 'insert_drive_file';
  }
  function colorOf(e) {
    if (e.type === 'folder') return '#ffb300';
    var m = (e.mime || '').toLowerCase();
    if (m && m.indexOf('image') === 0) return '#8e24aa';
    if (m && m.indexOf('video') === 0) return '#e53935';
    if (m && m.indexOf('audio') === 0) return '#00897b';
    if (m && m.indexOf('text') === 0 || m.indexOf('json') >= 0) return '#3949ab';
    return '#757575';
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    headers['Authorization'] = 'Bearer ' + state.token;
    if (opts.body && !(opts.body instanceof ArrayBuffer) && typeof opts.body !== 'string') headers['Content-Type'] = 'application/json';
    return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      if (r.status === 401) { lock(true); throw new Error('auth'); }
      return r.json().catch(function () { return { ok: false, error: 'bad response' }; });
    });
  }
  function snack(msg, color) {
    var s = document.getElementById('snack');
    s.textContent = msg;
    s.style.background = color || '#333';
    s.className = 'snack show';
    clearTimeout(s._t);
    s._t = setTimeout(function () { s.className = 'snack'; }, 2600);
  }

  /* ------- 登录 / 锁屏 ------- */
  function lock(show) {
    document.getElementById('lock').style.display = show ? 'flex' : 'none';
  }
  function tryLogin() {
    var v = document.getElementById('pwd').value.trim();
    if (!v) return;
    state.token = v;
    testAuth().then(function (ok) {
      if (ok) { window.localStorage.setItem('nd_pwd', v); lock(false); loadList(); startPollTasks(); }
      else { document.getElementById('loberr').textContent = '密码错误'; }
    });
  }
  function testAuth() {
    return api('/api/list?path=/').then(function () { return true; })
      .catch(function () { return false; });
  }

  /* ------- 渲染 ------- */
  function render() {
    if (state.view === 'file') { renderDetail(); return; }
    if (state.view === 'tasks') { renderTasks(); return; }
    renderList();
  }
  function renderList() {
    var crumbs = state.path.split('/').filter(Boolean);
    var cr = '<div class="crumbs">';
    cr += '<button class="crumb" onclick="nav(\'/\')">首页</button>';
    var acc = '';
    crumbs.forEach(function (c, i) {
      acc += '/' + c;
      cr += '<span class="sep">/</span><button class="crumb" onclick="nav(' + JSON.stringify(acc) + ')">' + esc(c) + '</button>';
    });
    cr += '</div>';
    if (crumbs.length) cr += '<button class="cb" onclick="nav(\'' + escAttrUp(state.path) + '\')"><span class="mi">arrow_upward</span>返回上级</button>';

    var html = cr + '<div class="list" id="list">';
    if (!state.entries.length) html += '<div class="empty"><span class="mi">inbox</span><div>此文件夹为空</div></div>';
    state.entries.forEach(function (e) { html += rowHtml(e); });
    html += '</div>';
    app.innerHTML = '<div class="ab"><span class="mi lg">cloud</span><div><div class="abt">NetDisk 网盘</div><div class="abs">' + esc(state.path) + '</div></div></div>'
      + '<main class="main" id="main">' + html + '</main>'
      + '<div class="nb"><button class="fab sm" onclick="showTasks()"><span class="mi">list_alt</span><i>任务</i></button>'
      + '<button class="fab big" onclick="showNew()"><span class="mi add">+</span><i>新建</i></button>'
      + '<button class="fab sm" onclick="document.getElementById(\'up_in\').click()"><span class="mi">upload</span><i>上传</i></button></div>'
      + '<input type="file" id="up_in" multiple style="display:none" onchange="onFilePick(this.files)">'
      + '<input type="file" id="up_dir" webkitdirectory multiple style="display:none" onchange="onDirPick(this.files)">'
      + '<div class="sheet" id="sheet"></div>';
    bindList();
  }
  function escAttrUp(p) { return JSON.stringify(dirname(p)).replace(/"/g, '&quot;'); }
  function dirname(p) { if (!p || p === '/' || p.indexOf('/') < 0) return '/'; var i = p.lastIndexOf('/'); return p.slice(0, i) || '/'; }
  function rowHtml(e) {
    var actions = '';
    if (e.type === 'folder') {
      actions = '<button class="act" onclick="onRename(\'' + escAttr(e.path) + '\')"><span class="mi">edit</span><b>重命名</b></button>'
        + '<button class="act dng" onclick="onDelete(\'' + escAttr(e.path) + '\')"><span class="mi">delete</span><b>删除</b></button>';
    } else {
      actions = '<button class="act" onclick="onDelete(\'' + escAttr(e.path) + '\')"><span class="mi">delete</span><b>删除</b></button>'
        + '<button class="act" onclick="onShare(\'' + escAttr(e.path) + '\')"><span class="mi">share</span><b>分享</b></button>'
        + '<button class="act" onclick="onRename(\'' + escAttr(e.path) + '\')"><span class="mi">edit</span><b>重命名</b></button>'
        + '<button class="act" onclick="dl(\'' + escAttr(e.ssid) + '\')"><span class="mi">download</span><b>下载</b></button>';
    }
    var size = e.type === 'folder' ? '文件夹' : fmtSize(e.size);
    var d = new Date(e.mtime || Date.now());
    var ds = (d.getMonth() + 1) + '-' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return '<div class="row" onclick="openEntry(\'' + escAttr(e.path) + '\',\'' + e.type + '\')">'
      + '<span class="fic mi" style="color:' + colorOf(e) + '">' + iconOf(e) + '</span>'
      + '<div class="meta"><div class="nm">' + esc(e.name) + '</div><div class="sn">' + size + ' · ' + ds + '</div></div>'
      + '<div class="acts" onclick="event.stopPropagation()">' + actions + '</div></div>';
  }
  function bindList() {
    // 事件已内联绑定，此函数占位
  }

  /* ------- 导航 ------- */
  window.nav = function (p) { state.path = p; state.view = 'list'; loadList(); };
  window.openEntry = function (p, type) {
    if (type === 'folder') { state.path = p.replace(/\/$/, ''); loadList(); return; }
    state.current = p; state.view = 'file'; render();
  };
  function loadList() {
    api('/api/list?path=' + encodeURIComponent(state.path)).then(function (d) {
      if (!d.ok) { snack(d.error || '加载失败', '#c62828'); return; }
      state.entries = d.entries; render();
    });
  }

  /* ------- 详情页 ------- */
  function renderDetail() {
    var p = state.current;
    api('/api/list?path=' + encodeURIComponent(dirname(p))).then(function (d) {
      if (!d.ok) return;
      var entry = null;
      d.entries.forEach(function (e) { if (e.path === p) entry = e; });
      if (!entry) { state.view = 'list'; loadList(); return; }
      var editable = entry.storage === 'kv' && isText(entry.mime);
      app.innerHTML = '<div class="ab"><button class="abb" onclick="back()"><span class="mi">arrow_back</span></button>'
        + '<div><div class="abt">' + esc(entry.name) + '</div><div class="abs">详情 · ' + fmtSize(entry.size) + '</div></div></div>'
        + '<main class="main"><div class="dt">'
        + detailPreview(entry)
        + '<div class="dtacts">'
        + '<button class="act" onclick="dl(\'' + escAttr(entry.ssid) + '\')"><span class="mi">download</span><b>下载</b></button>'
        + '<button class="act" onclick="onShare(\'' + escAttr(entry.path) + '\')"><span class="mi">share</span><b>分享</b></button>'
        + '<button class="act" onclick="onRename(\'' + escAttr(entry.path) + '\')"><span class="mi">edit</span><b>重命名</b></button>'
        + '<button class="act dng" onclick="onDelete(\'' + escAttr(entry.path) + '\')"><span class="mi">delete</span><b>删除</b></button>'
        + (editable ? '<button class="act go" onclick="editText(\'' + escAttr(entry.path) + '\')"><span class="mi">edit_note</span><b>编辑</b></button>' : '')
        + '</div></div></main>';
    });
  }
  function detailPreview(e) {
    var m = e.mime || '';
    if (m.indexOf('image') === 0) return '<div class="pvbox"><img src="/p/' + escAttr(e.ssid) + '"></div>';
    if (m.indexOf('video') === 0) return '<div class="pvbox"><video src="/p/' + escAttr(e.ssid) + '" controls></video></div>';
    if (m.indexOf('audio') === 0) return '<div class="pvbox aud"><audio src="/p/' + escAttr(e.ssid) + '" controls></audio></div>';
    if (isText(m)) return '<div class="pvbox txt"><iframe src="/p/' + escAttr(e.ssid) + '"></iframe></div>';
    if (m.indexOf('zip') >= 0 || m.indexOf('rar') >= 0 || m.indexOf('7z') >= 0 || m.indexOf('tar') >= 0) return '<div class="pvn2"><span class="mi">archive</span><div>压缩包无法预览</div></div>';
    return '<div class="pvn2"><span class="mi">insert_drive_file</span><div>该类型暂不支持在线预览</div></div>';
  }
  function isText(m) { m = (m || '').toLowerCase(); return m.indexOf('text') === 0 || m.indexOf('json') >= 0 || m.indexOf('xml') >= 0 || m.indexOf('javascript') >= 0 || m.indexOf('svg') >= 0; }
  window.back = function () { state.view = 'list'; loadList(); };

  /* ------- 文本编辑 ------- */
  window.editText = function (p) {
    api('/api/content?path=' + encodeURIComponent(p)).then(function (d) {
      if (!d.ok) { snack(d.error || '读取失败', '#c62828'); return; }
      var url = new URL('/api/save', location.href).href;
      app.innerHTML = '<div class="ab"><button class="abb" onclick="back()"><span class="mi">arrow_back</span></button><div><div class="abt">编辑文本</div><div class="abs">' + esc(d.entry.name) + '</div></div>'
        + '<button class="saveb" onclick="saveText()"><span class="mi">save</span>保存</button></div>'
        + '<main class="main" style="padding:0"><textarea class="editor" id="ed">' + esc(d.content) + '</textarea></main>';
      state.editPath = p;
    });
  };
  window.saveText = function () {
    var c = document.getElementById('ed').value;
    api('/api/save', { method: 'POST', body: JSON.stringify({ path: state.editPath, content: c }) }).then(function (d) {
      if (!d.ok) { snack(d.error || '保存失败', '#c62828'); return; }
      snack('已保存'); back();
    });
  };

  /* ------- 文件操作：重命名 / 删除 / 分享 ------- */
  window.onRename = function (p) {
    var old = p.split('/').pop();
    var nm = prompt('重命名为：', old);
    if (!nm) return;
    api('/api/rename', { method: 'POST', body: JSON.stringify({ path: p, newName: nm }) }).then(function (d) {
      if (!d.ok) { snack(d.error || '重命名失败', '#c62828'); return; }
      snack('已重命名'); state.view = 'list'; loadList();
    });
  };
  window.onDelete = function (p) {
    if (!confirm('确定删除 "' + p.split('/').pop() + '" 吗？删除后不可恢复。')) return;
    api('/api/delete', { method: 'POST', body: JSON.stringify({ path: p }) }).then(function (d) {
      if (!d.ok) { snack(d.error || '删除失败', '#c62828'); return; }
      snack('已删除'); state.view = 'list'; loadList();
    });
  };
  window.onShare = function (p) {
    api('/api/share', { method: 'POST', body: JSON.stringify({ path: p }) }).then(function (d) {
      if (!d.ok) { snack(d.error || '创建分享失败', '#c62828'); return; }
      var link = location.origin + d.url;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () { snack('分享链接已复制'); }, function () { prompt('分享链接：', link); });
      } else { prompt('分享链接：', link); }
    });
  };
  window.dl = function (ssid) { window.open('/dl/' + ssid, '_blank'); };

  /* ------- 新建 ------- */
  window.showNew = function () {
    var s = document.getElementById('sheet');
    s.innerHTML = '<div class="mask" onclick="closeSheet()"></div><div class="sb">'
      + '<div class="sbt">新建</div>'
      + '<button class="srow" onclick="newFolder()"><span class="mi" style="color:#ffb300">create_new_folder</span><b>新建文件夹</b></button>'
      + '<button class="srow" onclick="newText()"><span class="mi" style="color:#3949ab">note_add</span><b>新建文本文件</b></button>'
      + '</div>';
    s.style.display = 'block';
  };
  window.closeSheet = function () { document.getElementById('sheet').style.display = 'none'; };
  window.newFolder = function () {
    var nm = prompt('文件夹名称：'); if (!nm) return;
    api('/api/mkdir', { method: 'POST', body: JSON.stringify({ parent: state.path, name: nm }) }).then(function (d) {
      if (!d.ok) { snack(d.error || '创建失败', '#c62828'); return; }
      closeSheet(); snack('已创建文件夹'); loadList();
    });
  };
  window.newText = function () {
    var nm = prompt('文本文件名：', '新建文本.txt'); if (!nm) return;
    api('/api/mkfile', { method: 'POST', body: JSON.stringify({ parent: state.path, name: nm, content: '' }) }).then(function (d) {
      if (!d.ok) { snack(d.error || '创建失败', '#c62828'); return; }
      closeSheet(); snack('已创建'); loadList(); editText(state.path + '/' + nm);
    });
  };

  /* ------- 上传 ------- */
  window.onFilePick = function (files) {
    var arr = Array.prototype.slice.call(files);
    arr.forEach(function (f) { startUpload(f, state.path); });
    showTasks();
  };
  window.onDirPick = function (files) {
    var arr = Array.prototype.slice.call(files);
    var map = {};
    arr.forEach(function (f) { map[(f.webkitRelativePath || f.name)] = f; });
    var root = (arr[0] && arr[0].webkitRelativePath) ? arr[0].webkitRelativePath.split('/')[0] : null;
    arr.forEach(function (f) {
      var rel = f.webkitRelativePath || f.name;
      startUpload(f, root ? state.path + '/' + root : state.path, rel);
    });
    showTasks();
  };
  function startUpload(file, basePath, rel) {
    var name = file.name;
    var parent = basePath;
    var relPath = rel || '';
    var parts = relPath ? relPath.split('/') : [];
    var subDirs = parts.slice(1, -1);
    var chain = Promise.resolve();
    subDirs.forEach(function (dir) {
      chain = chain.then(function () {
        return api('/api/mkdir', { method: 'POST', body: JSON.stringify({ parent: parent, name: dir }) })
          .then(function (d) { if (d.ok) parent = d.entry.path; else parent = parent + '/' + dir; })
          .catch(function () { parent = parent + '/' + dir; });
      });
    });
    chain.then(function () {
      api('/api/task/start', { method: 'POST', body: JSON.stringify({ parent: parent, name: name, size: file.size }) }).then(function (d) {
        if (!d.ok) { snack(d.error || '启动上传失败', '#c62828'); return; }
        var task = { id: d.taskId, name: name, parent: parent, size: file.size, done: 0, speed: 0, cancel: false, file: file, rel: rel, startKey: parent };
        state.tasks.unshift(task);
        uploadLoop(task);
        renderTasks();
      });
    }).catch(function (e) { snack(e.message || '上传失败', '#c62828'); });
  }
  function uploadLoop(task) {
    var SLICE = 4 * 1024 * 1024;
    var pos = 0;
    var startT = Date.now();
    var startB = 0;
    var step = function () {
      if (task.cancel) { api('/api/task/cancel?task=' + task.id); return; }
      if (pos >= task.file.size) {
        api('/api/task/complete?task=' + task.id).then(function (d) {
          if (d.ok) { task.stage = '处理完成'; task.progress = 100; }
          else { task.error = d.error || '处理失败'; task.stage = '失败'; }
          renderTasks();
          if (d.ok) { reloadIfUnder(task.rel); }
        }).catch(function () { task.error = '网络错误'; task.stage = '失败'; renderTasks(); });
        return;
      }
      var end = Math.min(pos + SLICE, task.file.size);
      var bl = task.file.slice(pos, end);
      var now = Date.now();
      var dur = (now - startT) / 1000;
      bl.arrayBuffer().then(function (buf) {
        var mark = Date.now();
        return fetch('/api/task/chunk?task=' + task.id + '&index=' + Math.floor(pos / SLICE), {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + state.token },
          body: buf
        }).then(function () {
          var dt = (Date.now() - mark) / 1000;
          task.done = end;
          task.stage = '上传到服务器';
          var local = task.done / task.size * 100;
          task.progress = Math.round(local * 100) / 100;
          var inst = (task.done - startB) / (dur > 0 ? dur : 1);
          task.speed = inst > 0 ? inst : 0; // bytes/sec
          if ((Date.now() - startT) > 2000) { startT = Date.now(); startB = task.done; }
          renderTasks();
          if (!task.cancel) step();
        }).catch(function () { if (!task.cancel) { task.error = '上传中断'; task.stage = '失败'; renderTasks(); } });
      });
    };
    step();
  }
  function reloadIfUnder(rel) { if (!rel) loadList(); }

  /* ------- 任务面板 ------- */
  window.showTasks = function () { state.view = 'tasks'; render(); };
  function renderTasks() {
    var html = '<div class="ab"><button class="abb" onclick="back()"><span class="mi">arrow_back</span></button><div><div class="abt">上传任务</div><div class="abs">' + state.tasks.length + ' 个任务</div></div></div><main class="main"><div class="list">';
    if (!state.tasks.length) html += '<div class="empty"><span class="mi">check_circle</span><div>暂无任务</div></div>';
    state.tasks.forEach(function (t) { html += taskRow(t); });
    html += '</div></main>';
    app.innerHTML = html;
  }
  function taskRow(t) {
    var p = Math.round((t.progress || 0) * 100) / 100;
    var stColor = t.stage === '失败' ? '#c62828' : (t.stage === '已取消' ? '#757575' : '#00897b');
    var showDel = (t.stage === '失败' || t.stage === '已取消' || t.progress === 100);
    var cancelBtn = ((!showDel) && t.stage !== '处理完成') ? '<button class="act" onclick="cancelTask(\'' + t.id + '\')"><span class="mi">close</span><b>取消</b></button>' : '';
    var delBtn = showDel ? '<button class="act" onclick="delTask(\'' + t.id + '\')"><span class="mi">delete</span><b>删除</b></button>' : '';
    var spd = t.speed ? fmtSize(t.speed) + '/s' : '';
    return '<div class="row task">'
      + '<span class="fic mi" style="color:#00897b">upload_file</span>'
      + '<div class="meta"><div class="nm">' + esc(t.name) + '</div>'
      + '<div class="prog"><div class="bar" style="width:' + p + '%"></div></div>'
      + '<div class="sn">' + esc(t.stage || '') + ' · ' + p.toFixed(1) + '% · ' + fmtSize(t.done || 0) + '/' + fmtSize(t.size) + (spd ? ' · ' + spd : '') + '</div>'
      + (t.error ? '<div class="sn" style="color:#c62828">' + esc(t.error) + '</div>' : '')
      + '</div><div class="acts">' + cancelBtn + delBtn + '</div></div>';
  }
  window.cancelTask = function (id) {
    state.tasks.forEach(function (t) { if (t.id === id) t.cancel = true; });
  };
  window.delTask = function (id) {
    api('/api/task/delete?task=' + id).then(function () {
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
      renderTasks();
    });
  };
  function startPollTasks() {
    setInterval(function () {
      api('/api/task/list').then(function (d) {
        if (!d.ok) return;
        // 同步服务端状态到本地上传线程
        d.tasks.forEach(function (s) {
          state.tasks.forEach(function (l) { if (l.id === s.id && s.status === 'done') { l.stage = '处理完成'; l.progress = 100; } });
        });
        renderTasks();
      });
    }, 1500);
  }

  /* ------- 启动 ------- */
  if (state.token) {
    testAuth().then(function (ok) {
      if (ok) { lock(false); loadList(); startPollTasks(); }
      else { lock(true); }  /* 服务端重启 / 密码变更 */
    });
  } else { lock(true); }
  window.addEventListener('keydown', function (e) { if (e.key === 'Enter' && document.getElementById('lock').style.display === 'flex') tryLogin(); });
})();
`;

const MANAGER_CSS = `
:root{--pri:#6200ee;--pri2:#7c4dff;--bg:#f3f1f8;--ink:#212121;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);-webkit-tap-highlight-color:transparent}
.mi{font-family:'Material Icons';font-weight:normal;font-style:normal;display:inline-block;line-height:1;font-size:22px;user-select:none}
.lg{font-size:30px}
/* 状态栏 */
.ab{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:12px;padding:16px 16px;background:linear-gradient(135deg,var(--pri),var(--pri2));color:#fff;box-shadow:0 2px 8px rgba(98,0,238,.25)}
.ab .mi{font-size:28px}
.abt{font-size:18px;font-weight:500}
.abs{font-size:12px;opacity:.9}
.abb{background:transparent;border:none;color:#fff;padding:6px;cursor:pointer;display:flex}
.abb .mi{font-size:26px}
.saveb{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:20px;padding:9px 16px;font-size:14px;margin-left:auto;cursor:pointer}
.saveb .mi{font-size:20px}
/* 主区域 */
.main{display:block;height:calc(100vh - 70px);overflow-y:auto;padding:14px 14px 96px;scrollbar-width:thin}
.crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:2px;margin-bottom:8px;font-size:14px}
.crumb{background:none;border:none;color:var(--pri);cursor:pointer;padding:4px;border-radius:6px}
.sep{color:#aaa}
.cb{display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--pri);cursor:pointer;font-size:13px;margin-bottom:8px;padding:4px 8px}
/* 文件列表 */
.list{display:flex;flex-direction:column;gap:10px}
.row{display:flex;align-items:center;gap:12px;background:#fff;border-radius:14px;padding:12px 12px 8px;box-shadow:0 1px 4px rgba(0,0,0,.06);cursor:pointer;transition:.15s;position:relative}
.row:active{transform:scale(.99)}
.fic{font-size:34px;flex-shrink:0}
.meta{flex:1;min-width:0}
.nm{font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sn{font-size:12px;color:#888;margin-top:2px;word-break:break-all}
.acts{display:flex;flex-wrap:wrap;gap:6px;padding-top:8px;margin-top:6px;border-top:1px solid #f1f1f1;width:100%;flex:0 0 100%;order:3}
.act{display:flex;align-items:center;gap:5px;background:#f5f1fb;border:none;border-radius:18px;padding:6px 12px;color:var(--pri);font-size:12.5px;cursor:pointer}
.act .mi{font-size:17px}
.act.dng{color:#c62828;background:#fdecec}
.act.go{color:#00897b;background:#e0f2f1}
.empty{display:flex;flex-direction:column;align-items:center;gap:8px;color:#b0a8c0;padding:70px 0}
.empty .mi{font-size:56px;color:#d7cfe6}
/* 进度条 */
.prog{height:6px;border-radius:3px;background:#eee;overflow:hidden;margin:6px 0 4px}
.bar{height:100%;background:linear-gradient(90deg,#00897b,#26a69a);transition:width .2s}
/* 底部按钮栏 */
.nb{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-around;align-items:center;padding:8px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(255,255,255,.97);box-shadow:0 -3px 12px rgba(0,0,0,.09);z-index:40}
.fab{border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;border-radius:16px;font-size:12px;color:#444}
.fab .mi{font-size:26px;color:var(--pri)}
.fab.sm{background:transparent;padding:6px 12px}
.fab.big{width:60px;height:52px;background:linear-gradient(135deg,var(--pri),var(--pri2));color:#fff;border-radius:18px;box-shadow:0 6px 16px rgba(98,0,238,.4);justify-content:center}
.fab.big .mi{color:#fff;font-size:28px}
.fab i{font-style:normal}
/* 底部弹层 */
.sheet{display:none;position:fixed;inset:0;z-index:60}
.mask{position:absolute;inset:0;background:rgba(0,0,0,.35)}
.sb{position:absolute;bottom:0;left:0;right:0;background:#fff;border-radius:20px 20px 0 0;padding:14px 16px calc(20px + env(safe-area-inset-bottom));animation:up .2s}
@keyframes up{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
.sbt{font-size:16px;font-weight:500;margin:4px 4px 10px;color:#888}
.srow{display:flex;align-items:center;gap:14px;width:100%;background:#fff;border:none;padding:14px;border-radius:12px;cursor:pointer;font-size:15px}
.srow:hover{background:#f5f1fb}
/* 详情 */
.dt{display:flex;flex-direction:column;gap:14px}
.pvbox{background:#000;border-radius:14px;overflow:hidden}
.pvbox img,.pvbox video{width:100%;max-height:60vh;object-fit:contain;display:block;background:#000}
.pvbox.aud{background:#f7f5fb;padding:30px}
.pvbox.aud audio{width:100%}
.pvbox.txt iframe{width:100%;height:60vh;border:none;background:#fff}
.pvn2{display:flex;flex-direction:column;align-items:center;gap:8px;padding:50px;color:#999;background:#fff;border-radius:14px}
.pvn2 .mi{font-size:52px;color:#d0c8e0}
.dtacts{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
/* 编辑器 */
.editor{width:100%;height:calc(100vh - 70px);border:none;outline:none;resize:none;padding:16px;font-family:ui-monospace,Consolas,monospace;font-size:14px;line-height:1.6;background:#fff}
/* 锁屏 */
.lock{position:fixed;inset:0;z-index:100;background:linear-gradient(135deg,var(--pri),var(--pri2));display:flex;align-items:center;justify-content:center}
.lockcard{background:#fff;border-radius:20px;padding:34px 28px;width:320px;max-width:88vw;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.lockcard .lg{font-size:40px;color:var(--pri)}
.lt{font-size:20px;font-weight:500;margin:8px 0 2px}
.ls{font-size:13px;color:#888;margin-bottom:16px}
.tin{width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:10px;font-size:15px;outline:none;margin-bottom:12px}
.tin:focus{border-color:var(--pri);box-shadow:0 0 0 2px rgba(98,0,238,.15)}
.btn.f{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px;background:var(--pri);color:#fff;border:none;border-radius:10px;font-size:15px;cursor:pointer}
.lerr{color:#c62828;font-size:13px;margin-top:10px}
/* snackbar */
.snack{position:fixed;left:50%;bottom:90px;transform:translate(-50%,20px);background:#333;color:#fff;padding:11px 20px;border-radius:24px;font-size:13px;opacity:0;pointer-events:none;transition:.25s;z-index:200;max-width:88vw;text-align:center}
.snack.show{opacity:1;transform:translate(-50%,0)}
`;