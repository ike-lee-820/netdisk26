/**
 * Cloudflare Worker 直链网盘
 * 功能：KV/GitHub 混合存储、Material Design UI、任务系统、分片上传、分享/直链下载
 * 变量：CLOUD_PASSWORD, GITHUB_TOKEN
 * D1：NDK（文件结构、设置、任务列表）
 * KV：FILE_KV_1~5（仅临时存放上传分片）
 */

const GITHUB_USER = 'ikecode26';
const GITHUB_API = 'https://api.github.com';
const ASSETS_REPO = 'netdisk-assets';
const KV_SIZE_LIMIT = -1;                      // 所有文件均存 GitHub，KV 仅临时存放上传分片
const GITHUB_SINGLE_LIMIT = 0;                 // GitHub 文件一律分片，避免 Worker CPU/超时
const SERIAL_THRESHOLD = 500 * 1024 * 1024;    // >500MB 使用串流逐片上传，避免 KV 堆积
const CHUNK_SIZE = 10 * 1024 * 1024;           // 10 MB/片
const CLIENT_CHUNK_SIZE = 5 * 1024 * 1024;     // 客户端每片 5 MB，避免浏览器/Worker 超时

let d1Initialized = false;

async function loggedFetch(url, options = {}) {
  const method = options.method || 'GET';
  console.log(`[fetch] ${method} ${url}`);
  try {
    const resp = await fetch(url, options);
    console.log(`[fetch] ${method} ${url} -> ${resp.status}`);
    return resp;
  } catch (e) {
    console.error(`[fetch] ${method} ${url} failed:`, e);
    throw e;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await loggedFetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ==================== 工具函数 ====================

function ssid() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(36)).join('').replace(/[^a-z0-9]/g, '') + Date.now().toString(36) + Date.now().toString(36);
}

function getKV(ssid, env) {
  const kvs = [env.FILE_KV_1, env.FILE_KV_2, env.FILE_KV_3, env.FILE_KV_4, env.FILE_KV_5];
  let sum = 0;
  for (let i = 0; i < ssid.length; i++) sum += ssid.charCodeAt(i);
  return kvs[sum % kvs.length];
}

function arrayBufferToBase64(buffer) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bps) {
  if (bps === 0) return '0 B/s';
  if (bps < 1024) return bps.toFixed(0) + ' B/s';
  if (bps < 1024 * 1024) return (bps / 1024).toFixed(1) + ' KB/s';
  return (bps / 1024 / 1024).toFixed(1) + ' MB/s';
}

function getMime(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
    txt: 'text/plain', md: 'text/markdown', json: 'application/json', js: 'application/javascript',
    css: 'text/css', html: 'text/html', xml: 'application/xml',
    zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar', gz: 'application/gzip',
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp'
  };
  return map[ext] || 'application/octet-stream';
}

function isPreviewable(name) {
  const mime = getMime(name);
  return mime.startsWith('video/') || mime.startsWith('audio/') || mime.startsWith('image/') ||
         mime === 'text/plain' || mime === 'text/markdown' || mime.startsWith('text/') ||
         ['application/json', 'application/javascript', 'text/css', 'text/html'].includes(mime) ||
         name.match(/\.(zip|rar|7z|tar|gz)$/i);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function errorResponse(msg, status = 400) {
  return jsonResponse({ error: msg }, status);
}

// ==================== 密码验证 ====================

function checkPassword(request, env) {
  const password = env.CLOUD_PASSWORD;
  if (!password) return true;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;)\s*auth=([^;]+)/);
  return m && decodeURIComponent(m[1]) === password;
}

function requirePassword(request, env) {
  if (!checkPassword(request, env)) {
    return errorResponse('需要密码访问', 401);
  }
  return null;
}

// ==================== D1 通用存储 ====================

function getD1(env) {
  if (!env.NDK) {
    throw new Error('D1 数据库 NDK 未绑定。请在 Cloudflare Worker 设置中绑定一个 D1 数据库，变量名为 NDK。');
  }
  return env.NDK;
}

async function ensureD1(env) {
  if (d1Initialized) return;
  await getD1(env).exec('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  d1Initialized = true;
}

async function d1Get(env, key, defaultValue = undefined) {
  await ensureD1(env);
  const row = await getD1(env).prepare('SELECT value FROM kv_store WHERE key = ?').bind(key).first();
  if (!row || !row.value) return defaultValue;
  try { return JSON.parse(row.value); } catch (e) { return defaultValue; }
}

async function d1Set(env, key, value) {
  await ensureD1(env);
  await getD1(env).prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)')
    .bind(key, JSON.stringify(value)).run();
}

async function d1Delete(env, key) {
  await ensureD1(env);
  await getD1(env).prepare('DELETE FROM kv_store WHERE key = ?').bind(key).run();
}

// ==================== 文件结构操作 ====================

async function getStructure(env) {
  return await d1Get(env, 'file_structure', { type: 'root', name: '', children: {}, createdAt: Date.now() });
}

async function saveStructure(env, structure) {
  await d1Set(env, 'file_structure', structure);
}

async function getSettings(env) {
  return await d1Get(env, 'app_settings', {});
}

async function saveSettings(env, settings) {
  await d1Set(env, 'app_settings', settings);
}

function getFolder(structure, path) {
  const parts = path.split('/').filter(Boolean);
  let node = structure;
  for (const p of parts) {
    if (!node.children || !node.children[p] || node.children[p].type !== 'folder') return null;
    node = node.children[p];
  }
  return node;
}

function getNode(structure, path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return structure;
  let node = structure;
  for (const p of parts) {
    if (!node.children || !node.children[p]) return null;
    node = node.children[p];
  }
  return node;
}

function setNode(structure, path, node) {
  const parts = path.split('/').filter(Boolean);
  let parent = structure;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!parent.children[p]) {
      parent.children[p] = { type: 'folder', name: p, children: {}, createdAt: Date.now() };
    }
    parent = parent.children[p];
  }
  parent.children[parts[parts.length - 1]] = node;
}

function deleteNode(structure, path) {
  const parts = path.split('/').filter(Boolean);
  let parent = structure;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!parent.children[p]) return false;
    parent = parent.children[p];
  }
  if (parent.children[parts[parts.length - 1]]) {
    delete parent.children[parts[parts.length - 1]];
    return true;
  }
  return false;
}

function renameNode(structure, path, newName) {
  const parts = path.split('/').filter(Boolean);
  let parent = structure;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!parent.children[p]) return null;
    parent = parent.children[p];
  }
  const oldName = parts[parts.length - 1];
  const node = parent.children[oldName];
  if (!node) return null;
  node.name = newName;
  if (node.type === 'folder') {
    // 文件夹重命名不需要额外处理
  }
  delete parent.children[oldName];
  parent.children[newName] = node;
  return node;
}

function collectPaths(node, base = '') {
  let list = [];
  if (!node.children) return list;
  for (const [name, child] of Object.entries(node.children)) {
    const p = base ? `${base}/${name}` : name;
    list.push(p);
    if (child.type === 'folder') list = list.concat(collectPaths(child, p));
  }
  return list;
}

function collectFolderPaths(node, base = '') {
  let list = [];
  if (!node.children) return list;
  for (const [name, child] of Object.entries(node.children)) {
    if (child.type !== 'folder') continue;
    const p = base ? `${base}/${name}` : name;
    list.push(p);
    list = list.concat(collectFolderPaths(child, p));
  }
  return list;
}

function cloneNode(node) {
  if (node.type === 'file') return { ...node, createdAt: Date.now() };
  const copy = { ...node, children: {} };
  for (const [name, child] of Object.entries(node.children)) {
    copy.children[name] = cloneNode(child);
  }
  return copy;
}

function isDescendantOrSelf(parentPath, childPath) {
  const p = parentPath.replace(/^\/|\/$/g, '');
  const c = childPath.replace(/^\/|\/$/g, '');
  if (!p) return true;
  return c === p || c.startsWith(p + '/');
}

function uniqueName(children, name) {
  if (!children[name]) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 1;
  while (children[base + ' (' + i + ')' + ext]) i++;
  return base + ' (' + i + ')' + ext;
}

function moveNode(structure, path, targetPath) {
  const parts = path.split('/').filter(Boolean);
  const name = parts[parts.length - 1];
  const node = getNode(structure, path);
  if (!node) return { ok: false, error: '源文件不存在' };
  const targetNode = targetPath ? getNode(structure, targetPath) : structure;
  if (!targetNode || targetNode.type !== 'folder') return { ok: false, error: '目标文件夹不存在' };
  if (isDescendantOrSelf(path, targetPath)) return { ok: false, error: '不能移动到自身或子文件夹内' };
  if (targetNode.children[name]) return { ok: false, error: '目标位置已存在同名文件或文件夹' };
  deleteNode(structure, path);
  targetNode.children[name] = node;
  return { ok: true };
}

function copyNode(structure, path, targetPath) {
  const parts = path.split('/').filter(Boolean);
  const name = parts[parts.length - 1];
  const node = getNode(structure, path);
  if (!node) return { ok: false, error: '源文件不存在' };
  const targetNode = targetPath ? getNode(structure, targetPath) : structure;
  if (!targetNode || targetNode.type !== 'folder') return { ok: false, error: '目标文件夹不存在' };
  if (isDescendantOrSelf(path, targetPath)) return { ok: false, error: '不能复制到自身或子文件夹内' };
  const newName = uniqueName(targetNode.children, name);
  const cloned = cloneNode(node);
  cloned.name = newName;
  targetNode.children[newName] = cloned;
  return { ok: true };
}

// ==================== GitHub API ====================

async function githubCreateRepo(ssid, env) {
  const headers = {
    'Authorization': `token ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'netdisk-worker'
  };
  const getHeaders = {
    'Authorization': `token ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'netdisk-worker'
  };

  // 先探测仓库是否已存在，避免反复创建
  const exist = await fetchWithTimeout(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}`, { headers: getHeaders }, 20000).catch(() => null);
  if (exist && exist.ok) {
    console.log(`[github] repo ${ssid} already exists, reuse it`);
    return { name: ssid, reused: true };
  }

  const resp = await fetchWithTimeout(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: ssid, private: false, auto_init: true, description: 'Netdisk storage' })
  }, 30000);

  if (!resp.ok) {
    const txt = await resp.text();
    if (resp.status === 422 && txt.includes('name already exists')) {
      console.log(`[github] repo ${ssid} already exists, reuse it`);
      return { name: ssid, reused: true };
    }
    throw new Error(`创建仓库失败: ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  console.log(`[github] repo ${ssid} created, verifying availability...`);

  // GitHub 创建仓库后可能需要短暂时间才能通过 API 访问，轮询确认
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const check = await fetchWithTimeout(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}`, { headers: getHeaders }, 20000).catch(() => null);
    if (check && check.ok) {
      console.log(`[github] repo ${ssid} verified`);
      return data;
    }
    console.log(`[github] repo ${ssid} not visible yet, retry ${i + 1}`);
  }
  throw new Error(`仓库创建成功但校验失败，无法访问: ${ssid}`);
}

async function githubGetFileSha(ssid, path, env) {
  try {
    const resp = await fetchWithTimeout(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}/contents/${encodeURIComponent(path)}`, {
      headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'netdisk-worker' }
    }, 20000);
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data) ? null : data.sha;
  } catch (e) {
    return null;
  }
}

async function verifyGitHubFile(ssid, path, expectedSha, env) {
  const headers = { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'netdisk-worker' };
  for (let i = 0; i < 10; i++) {
    const check = await fetchWithTimeout(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}/contents/${encodeURIComponent(path)}`, { headers }, 20000).catch(() => null);
    if (!check || !check.ok) {
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    try {
      const info = await check.json();
      if (Array.isArray(info)) continue;
      const actualSha = info.sha;
      if (!expectedSha || actualSha === expectedSha) {
        console.log(`[github] verify ${ssid}/${path} ok, sha=${actualSha}`);
        return true;
      }
      console.log(`[github] verify ${ssid}/${path} sha mismatch, expected=${expectedSha} actual=${actualSha}`);
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function githubUploadFile(ssid, path, content, env, message = 'upload') {
  const base64 = arrayBufferToBase64(content);
  console.log(`[github] upload ${ssid}/${path} raw=${content.byteLength} base64=${base64.length}`);
  let retries = 0;
  const maxRetries = 5;
  while (true) {
    const sha = await githubGetFileSha(ssid, path, env);
    const body = { message, content: base64 };
    if (sha) body.sha = sha;
    const resp = await fetchWithTimeout(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}/contents/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'netdisk-worker'
      },
      body: JSON.stringify(body)
    }, 60000);

    if (resp.ok) {
      let data = null;
      try { data = await resp.json(); } catch (e) {}
      const expectedSha = data && data.content && data.content.sha;
      console.log(`[github] put ${ssid}/${path} ok, sha=${expectedSha || '?'}, verifying...`);
      if (await verifyGitHubFile(ssid, path, expectedSha, env)) {
        console.log(`[github] uploaded ${ssid}/${path} verified`);
        return data || { sha: expectedSha };
      }
      console.log(`[github] verification failed for ${ssid}/${path}, retry ${retries + 1}`);
    } else {
      const txt = await resp.text();
      console.error(`[github] put ${ssid}/${path} failed ${resp.status}: ${txt}`);
      // 409 并发冲突 / 422 sha 缺失：重新获取 sha 再试
      if ((resp.status === 409 || (resp.status === 422 && txt.includes('sha'))) && retries < maxRetries) {
        retries++;
        console.log(`[github] ${resp.status} on ${ssid}/${path}, retry ${retries}`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw new Error(`上传 GitHub 失败: ${resp.status} ${txt}`);
    }

    retries++;
    if (retries > maxRetries) throw new Error(`上传 GitHub 校验失败: ${ssid}/${path}`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

async function githubDeleteFile(ssid, path, env) {
  // 先获取 sha
  const infoResp = await loggedFetch(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}/contents/${encodeURIComponent(path)}`, {
    headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'netdisk-worker' }
  });
  if (!infoResp.ok) return;
  const info = await infoResp.json();
  const sha = Array.isArray(info) ? null : info.sha;
  if (!sha) return;
  await loggedFetch(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}/contents/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'netdisk-worker'
    },
    body: JSON.stringify({ message: 'delete', sha })
  });
}

async function githubDeleteRepo(ssid, env) {
  await loggedFetch(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'netdisk-worker' }
  });
}

async function githubGetDownloadUrl(ssid, path, env) {
  const resp = await fetchWithTimeout(`${GITHUB_API}/repos/${GITHUB_USER}/${ssid}/contents/${encodeURIComponent(path)}`, {
    headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'netdisk-worker' }
  }, 20000);
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`获取下载链接失败: ${resp.status} ${txt}`);
  }
  const data = await resp.json();
  return data.download_url;
}

async function githubFetchFile(ssid, path, env) {
  const url = await githubGetDownloadUrl(ssid, path, env);
  // raw.githubusercontent.com 不支持 Authorization header，且新文件可能有短暂延迟
  let lastErr = null;
  for (let i = 0; i < 5; i++) {
    const resp = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'netdisk-worker' }
    }, 30000);
    if (resp.ok) return resp;
    lastErr = `GitHub 下载失败: ${resp.status} ${url}`;
    if (resp.status === 404) {
      await new Promise(r => setTimeout(r, 800));
      continue;
    }
    throw new Error(lastErr);
  }
  throw new Error(lastErr || `GitHub 下载失败: ${url}`);
}

async function githubStreamChunks(fileNode, writable, env) {
  const writer = writable.getWriter();
  try {
    for (let i = 0; i < fileNode.chunks; i++) {
      console.log(`[stream] fetch chunk_${i} for ${fileNode.ssid}`);
      const resp = await githubFetchFile(fileNode.ssid, `chunk_${i}`, env);
      const reader = resp.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    }
  } catch (e) {
    console.error('[stream] error', e);
    await writer.abort(e);
    throw e;
  } finally {
    try { await writer.close(); } catch (e) {}
  }
}

// ==================== 任务系统 ====================

async function getTasks(env) {
  return await d1Get(env, 'tasks', []);
}

async function saveTasks(env, tasks) {
  await d1Set(env, 'tasks', tasks);
}

async function addTask(env, task) {
  task.startedAt = task.startedAt || Date.now();
  const tasks = await getTasks(env);
  tasks.unshift(task);
  await saveTasks(env, tasks);
  return task;
}

async function updateTask(env, id, updates) {
  const tasks = await getTasks(env);
  const idx = tasks.findIndex(t => t.id === id);
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], ...updates, updatedAt: Date.now() };
    await saveTasks(env, tasks);
  }
}

async function cancelTask(env, id) {
  const tasks = await getTasks(env);
  const idx = tasks.findIndex(x => x.id === id);
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], status: 'cancelled', message: '已取消', updatedAt: Date.now() };
    await saveTasks(env, tasks);
  }
}

async function deleteTask(env, id) {
  const tasks = await getTasks(env);
  await saveTasks(env, tasks.filter(x => x.id !== id));
}

async function isTaskCancelled(env, id) {
  const tasks = await getTasks(env);
  const t = tasks.find(x => x.id === id);
  return !t || t.status === 'cancelled';
}

async function uploadBackgroundImage(buffer, ext, env) {
  await githubCreateRepo(ASSETS_REPO, env);
  const fileName = 'bg_' + Date.now() + '.' + ext;
  await githubUploadFile(ASSETS_REPO, fileName, buffer, env, 'background image');
  const url = await githubGetDownloadUrl(ASSETS_REPO, fileName, env);
  return url;
}

async function uploadFontFile(buffer, ext, env) {
  await githubCreateRepo(ASSETS_REPO, env);
  const fileName = 'font_' + Date.now() + '.' + ext;
  await githubUploadFile(ASSETS_REPO, fileName, buffer, env, 'custom font');
  const url = await githubGetDownloadUrl(ASSETS_REPO, fileName, env);
  return url;
}

// ==================== 存储核心 ====================

async function saveFile(fileBuffer, filename, env, taskId = null) {
  const size = fileBuffer.byteLength;
  const id = ssid();
  const startTime = Date.now();
  const report = async (msg, progress, extra = {}) => {
    if (!taskId) return;
    const elapsed = (Date.now() - startTime) / 1000;
    const doneBytes = Math.floor(size * (progress / 100));
    const speed = elapsed > 0 ? doneBytes / elapsed : 0;
    await updateTask(env, taskId, { message: msg + (speed > 0 ? ` · ${formatSpeed(speed)}` : ''), progress, ...extra });
  };

  await report('选择存储方式...', 5);

  if (size <= KV_SIZE_LIMIT) {
    await report('上传到 KV 空间...', 30);
    await getKV(id, env).put(id, fileBuffer);
    await report('完成', 100, { status: 'done' });
    return { ssid: id, storage: 'kv', size, filename, chunks: 1 };
  }

  await report('创建 GitHub 仓库...', 10);
  await githubCreateRepo(id, env);

  if (size <= GITHUB_SINGLE_LIMIT) {
    await report('上传到 GitHub...', 30);
    await githubUploadFile(id, filename, fileBuffer, env);
    await report('完成', 100, { status: 'done' });
    return { ssid: id, storage: 'github', size, filename, chunks: 1, githubPath: filename };
  }

  const chunks = Math.ceil(size / CHUNK_SIZE);
  await report(`分片上传 (${chunks} 片)...`, 15, { totalChunks: chunks });
  let uploadedBytes = 0;
  let reportTimer = null;
  const reportSpeed = () => {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = elapsed > 0 ? uploadedBytes / elapsed : 0;
    const progress = 15 + Math.min(80, Math.floor((uploadedBytes / size) * 80));
    updateTask(env, taskId, {
      message: '上传到 GitHub... ' + formatSize(uploadedBytes) + ' / ' + formatSize(size) + ' · ' + formatSpeed(speed),
      progress,
      currentChunk: chunks > 0 ? Math.min(chunks, Math.ceil((uploadedBytes / size) * chunks)) : 0
    }).catch(() => {});
  };
  reportTimer = setInterval(reportSpeed, 800);
  try {
    for (let i = 0; i < chunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, size);
      const chunk = fileBuffer.slice(start, end);
      await report(`上传分片 ${i + 1}/${chunks} 到 GitHub...`, 15 + Math.floor((i / chunks) * 80), { currentChunk: i + 1 });
      await githubUploadFile(id, `chunk_${i}`, chunk, env, `upload chunk ${i}`);
      uploadedBytes += chunk.byteLength;
      await report(`分片 ${i + 1}/${chunks} 已校验通过`, 15 + Math.floor(((i + 1) / chunks) * 80), { currentChunk: i + 1 });
    }
  } finally {
    clearInterval(reportTimer);
    reportTimer = null;
  }
  await report('完成', 100, { status: 'done' });
  return { ssid: id, storage: 'github', size, filename, chunks };
}

async function deleteFileStorage(node, env) {
  if (node.storage === 'kv') {
    await getKV(node.ssid, env).delete(node.ssid);
  } else if (node.storage === 'github') {
    if (node.chunks > 1) {
      for (let i = 0; i < node.chunks; i++) {
        try { await githubDeleteFile(node.ssid, `chunk_${i}`, env); } catch (e) { console.error(e); }
      }
    } else if (node.chunks === 1) {
      try { await githubDeleteFile(node.ssid, 'chunk_0', env); } catch (e) { console.error(e); }
    } else {
      try { await githubDeleteFile(node.ssid, node.githubPath || node.name, env); } catch (e) { console.error(e); }
    }
    try { await githubDeleteRepo(node.ssid, env); } catch (e) { console.error(e); }
  }
}

async function buildDownloadResponse(node, filename, env, inline = false) {
  const disp = inline ? 'inline' : 'attachment';
  const headers = {
    'Content-Disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Type': getMime(filename)
  };

  try {
    if (node.storage === 'kv') {
      const data = await getKV(node.ssid, env).get(node.ssid, { type: 'arrayBuffer' });
      if (!data) throw new Error('KV 数据丢失');
      return new Response(data, { headers });
    }

    if (node.chunks > 1) {
      const { readable, writable } = new TransformStream();
      githubStreamChunks(node, writable, env);
      return new Response(readable, { headers });
    }

    // chunks === 1 或未标记分片数：统一按 chunk_0 读取（当前所有 GitHub 文件均为分片存储）
    if (node.chunks === 1) {
      const resp = await githubFetchFile(node.ssid, 'chunk_0', env);
      return new Response(resp.body, { headers });
    }

    // 兼容旧数据（单文件 githubPath）
    const resp = await githubFetchFile(node.ssid, node.githubPath || node.name || filename, env);
    return new Response(resp.body, { headers });
  } catch (e) {
    console.error('buildDownloadResponse error', e);
    return errorResponse('文件下载失败: ' + e.message, 500);
  }
}

// ==================== ZIP 打包下载 ====================

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  const bytes = new Uint8Array(buffer);
  let c = ~0;
  for (let i = 0; i < bytes.byteLength; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return ~c >>> 0;
}

function writeUintLE(view, offset, value, bytes) {
  for (let i = 0; i < bytes; i++) {
    view.setUint8(offset + i, (value >>> (8 * i)) & 0xFF);
  }
}

class ZipBuilder {
  constructor() {
    this.entries = [];
  }
  add(name, buffer) {
    const encodedName = new TextEncoder().encode(name);
    const crc = crc32(buffer);
    const size = buffer.byteLength;
    this.entries.push({ name, encodedName, buffer, crc, size });
  }
  build() {
    let localSize = 0;
    let centralSize = 0;
    for (const e of this.entries) {
      localSize += 30 + e.encodedName.byteLength + e.size;
      centralSize += 46 + e.encodedName.byteLength;
    }
    const total = localSize + centralSize + 22;
    const zip = new Uint8Array(total);
    const view = new DataView(zip.buffer);
    let offset = 0;
    const centralDir = [];
    for (const e of this.entries) {
      const nameLen = e.encodedName.byteLength;
      writeUintLE(view, offset, 0x04034b50, 4);
      writeUintLE(view, offset + 4, 20, 2);
      writeUintLE(view, offset + 6, 0, 2);
      writeUintLE(view, offset + 8, 0, 2);
      writeUintLE(view, offset + 10, 0, 2);
      writeUintLE(view, offset + 12, 0, 2);
      writeUintLE(view, offset + 14, e.crc, 4);
      writeUintLE(view, offset + 18, e.size, 4);
      writeUintLE(view, offset + 22, e.size, 4);
      writeUintLE(view, offset + 26, nameLen, 2);
      writeUintLE(view, offset + 28, 0, 2);
      zip.set(e.encodedName, offset + 30);
      zip.set(new Uint8Array(e.buffer), offset + 30 + nameLen);
      const localHeaderOffset = offset;
      offset += 30 + nameLen + e.size;
      centralDir.push({ ...e, localHeaderOffset });
    }
    const centralOffset = offset;
    for (const e of centralDir) {
      const nameLen = e.encodedName.byteLength;
      writeUintLE(view, offset, 0x02014b50, 4);
      writeUintLE(view, offset + 4, 20, 2);
      writeUintLE(view, offset + 6, 20, 2);
      writeUintLE(view, offset + 8, 0, 2);
      writeUintLE(view, offset + 10, 0, 2);
      writeUintLE(view, offset + 12, 0, 2);
      writeUintLE(view, offset + 14, 0, 2);
      writeUintLE(view, offset + 16, e.crc, 4);
      writeUintLE(view, offset + 20, e.size, 4);
      writeUintLE(view, offset + 24, e.size, 4);
      writeUintLE(view, offset + 28, nameLen, 2);
      writeUintLE(view, offset + 30, 0, 2);
      writeUintLE(view, offset + 32, 0, 2);
      writeUintLE(view, offset + 34, 0, 2);
      writeUintLE(view, offset + 36, 0, 2);
      writeUintLE(view, offset + 38, e.localHeaderOffset, 4);
      zip.set(e.encodedName, offset + 42);
      offset += 46 + nameLen;
    }
    writeUintLE(view, offset, 0x06054b50, 4);
    writeUintLE(view, offset + 4, 0, 2);
    writeUintLE(view, offset + 6, 0, 2);
    writeUintLE(view, offset + 8, this.entries.length, 2);
    writeUintLE(view, offset + 10, this.entries.length, 2);
    writeUintLE(view, offset + 12, centralSize, 4);
    writeUintLE(view, offset + 16, centralOffset, 4);
    writeUintLE(view, offset + 20, 0, 2);
    return zip.buffer;
  }
}

async function fetchFileBuffer(node, env) {
  if (node.storage === 'kv') {
    return await getKV(node.ssid, env).get(node.ssid, { type: 'arrayBuffer' });
  }
  if (!node.chunks || node.chunks === 1) {
    const resp = await githubFetchFile(node.ssid, node.githubPath || 'chunk_0', env);
    return await resp.arrayBuffer();
  }
  let total = 0;
  const chunks = [];
  for (let i = 0; i < node.chunks; i++) {
    const resp = await githubFetchFile(node.ssid, `chunk_${i}`, env);
    const buf = await resp.arrayBuffer();
    chunks.push(new Uint8Array(buf));
    total += buf.byteLength;
  }
  const combined = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    combined.set(c, off);
    off += c.byteLength;
  }
  return combined.buffer;
}

async function buildFolderZipResponse(folderPath, env) {
  const structure = await getStructure(env);
  const folder = getNode(structure, folderPath);
  if (!folder || folder.type !== 'folder') return errorResponse('文件夹不存在', 404);
  const prefix = folderPath ? folderPath + '/' : '';
  const paths = collectPaths(folder, folderPath);
  const zip = new ZipBuilder();
  const failed = [];
  for (const p of paths) {
    const node = getNode(structure, p);
    if (!node || node.type !== 'file') continue;
    try {
      const buf = await fetchFileBuffer(node, env);
      zip.add(p.slice(prefix.length).replace(/\\/g, '/'), buf);
    } catch (e) {
      console.error('打包失败：' + p, e);
      failed.push(p);
    }
  }
  const zipBuffer = zip.build();
  const folderName = folderPath ? folderPath.split('/').pop() : 'root';
  const headers = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(folderName)}.zip`
  };
  if (failed.length) {
    headers['X-Zip-Failed'] = failed.map(f => encodeURIComponent(f)).join(',');
  }
  return new Response(zipBuffer, { headers });
}

// ==================== WebDAV ====================

function checkBasicAuth(request, env) {
  const password = env.CLOUD_PASSWORD;
  if (!password) return true;
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  try {
    const creds = atob(m[1]);
    const pass = creds.split(':').slice(1).join(':');
    return pass === password;
  } catch (e) {
    return false;
  }
}

function davUnauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="netdisk"' }
  });
}

function davXmlResponse(xml, status = 207) {
  return new Response(xml, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'DAV': '1, 2' }
  });
}

function toDavDate(ts) {
  return new Date(ts).toUTCString();
}

function davHref(path) {
  return '/webdav' + encodeURI(path).replace(/%2F/g, '/');
}

function davPropResponse(path, node, isRoot = false) {
  const name = path ? path.split('/').filter(Boolean).pop() : '';
  const isFolder = !node || node.type === 'folder' || node.type === 'root';
  const href = davHref(path || '/');
  const lastMod = toDavDate(node && node.createdAt ? node.createdAt : Date.now());
  let props = `<D:displayname>${escapeXml(name || 'root')}</D:displayname>`;
  if (isFolder) {
    props += `<D:resourcetype><D:collection/></D:resourcetype><D:getcontentlength>0</D:getcontentlength>`;
  } else {
    props += `<D:resourcetype/><D:getcontentlength>${node.size || 0}</D:getcontentlength><D:getcontenttype>${getMime(name)}</D:getcontenttype>`;
  }
  props += `<D:getlastmodified>${lastMod}</D:getlastmodified>`;
  return `<D:response><D:href>${href}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
}

function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[m]));
}

async function handleWebDAV(request, env, reqPath) {
  if (!checkBasicAuth(request, env)) return davUnauthorized();
  const davPath = decodeURIComponent(reqPath.slice('/webdav'.length) || '/');
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'DAV': '1, 2',
        'Allow': 'OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, PROPFIND, PROPPATCH, MOVE, COPY, LOCK, UNLOCK',
        'MS-Author-Via': 'DAV'
      }
    });
  }

  if (method === 'PROPFIND') return await davPropfind(davPath, env, request);
  if (method === 'GET' || method === 'HEAD') return await davGet(davPath, env, method);
  if (method === 'PUT') return await davPut(davPath, env, request);
  if (method === 'DELETE') return await davDelete(davPath, env);
  if (method === 'MKCOL') return await davMkcol(davPath, env);
  if (method === 'MOVE') return await davMove(davPath, env, request);
  if (method === 'COPY') return await davCopy(davPath, env, request);
  if (method === 'LOCK') return davLock();
  if (method === 'UNLOCK') return davUnlock();

  return new Response('Method Not Allowed', { status: 405 });
}

async function davPropfind(davPath, env, request) {
  const depth = request.headers.get('Depth') || 'infinity';
  const structure = await getStructure(env);
  const node = davPath === '/' ? structure : getNode(structure, davPath);
  if (!node) return new Response('Not Found', { status: 404 });

  let responses = [davPropResponse(davPath || '/', node, davPath === '/')];
  if ((node.type === 'folder' || node.type === 'root') && depth !== '0') {
    for (const [name, child] of Object.entries(node.children || {})) {
      const childPath = davPath === '/' ? name : davPath + '/' + name;
      responses.push(davPropResponse(childPath, child));
      if ((depth === 'infinity' || depth === '-1') && child.type === 'folder') {
        const subPaths = collectPaths(child, childPath);
        for (const sp of subPaths) {
          responses.push(davPropResponse(sp, getNode(structure, sp)));
        }
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses.join('')}</D:multistatus>`;
  return davXmlResponse(xml);
}

async function davGet(davPath, env, method) {
  const structure = await getStructure(env);
  const node = getNode(structure, davPath);
  if (!node || node.type !== 'file') return new Response('Not Found', { status: 404 });
  if (method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': getMime(node.name),
        'Content-Length': String(node.size || 0),
        'Last-Modified': toDavDate(node.createdAt)
      }
    });
  }
  return buildDownloadResponse(node, node.name, env, true);
}

async function davPut(davPath, env, request) {
  const filename = davPath.split('/').pop();
  if (!filename) return new Response('Conflict', { status: 409 });
  const buffer = await request.arrayBuffer();
  const meta = await saveFile(buffer, filename, env);
  const structure = await getStructure(env);
  const oldNode = getNode(structure, davPath);
  if (oldNode && oldNode.type === 'file') {
    try { await deleteFileStorage(oldNode, env); } catch (e) { console.error(e); }
  }
  setNode(structure, davPath, {
    type: 'file',
    name: filename,
    ssid: meta.ssid,
    storage: meta.storage,
    size: meta.size,
    chunks: meta.chunks,
    githubPath: meta.githubPath,
    createdAt: Date.now()
  });
  await saveStructure(env, structure);
  return new Response(null, { status: oldNode ? 204 : 201 });
}

async function davDelete(davPath, env) {
  const structure = await getStructure(env);
  const node = getNode(structure, davPath);
  if (!node) return new Response('Not Found', { status: 404 });
  if (node.type === 'file') {
    await deleteFileStorage(node, env);
  } else {
    const paths = collectPaths(node, davPath);
    for (const p of paths) {
      const child = getNode(structure, p);
      if (child && child.type === 'file') await deleteFileStorage(child, env);
    }
  }
  deleteNode(structure, davPath);
  await saveStructure(env, structure);
  return new Response(null, { status: 204 });
}

async function davMkcol(davPath, env) {
  const structure = await getStructure(env);
  const existing = getNode(structure, davPath);
  if (existing) return new Response('Method Not Allowed', { status: 405 });
  const parts = davPath.split('/').filter(Boolean);
  let parent = structure;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!parent.children[p]) {
      parent.children[p] = { type: 'folder', name: p, children: {}, createdAt: Date.now() };
    }
    parent = parent.children[p];
  }
  await saveStructure(env, structure);
  return new Response(null, { status: 201 });
}

async function davMove(davPath, env, request) {
  const dest = request.headers.get('Destination');
  if (!dest) return new Response('Bad Request', { status: 400 });
  const destUrl = new URL(dest);
  let destPath = decodeURIComponent(destUrl.pathname);
  if (destPath.startsWith('/webdav')) destPath = destPath.slice('/webdav'.length) || '/';
  if (!destPath) destPath = '/';

  const structure = await getStructure(env);
  const node = getNode(structure, davPath);
  if (!node) return new Response('Not Found', { status: 404 });

  if (node.type === 'file') {
    const newName = destPath.split('/').pop();
    const newNode = { ...node, name: newName, createdAt: Date.now() };
    setNode(structure, destPath, newNode);
  } else {
    const oldPrefix = davPath;
    const newPrefix = destPath;
    const paths = collectPaths(node, oldPrefix);
    for (const p of paths) {
      const child = getNode(structure, p);
      if (!child) continue;
      const newP = newPrefix + p.slice(oldPrefix.length);
      setNode(structure, newP, { ...child, createdAt: Date.now() });
    }
    setNode(structure, destPath, { ...node, name: destPath.split('/').pop(), createdAt: Date.now() });
  }
  deleteNode(structure, davPath);
  await saveStructure(env, structure);
  return new Response(null, { status: 204 });
}

async function davCopy(davPath, env, request) {
  const dest = request.headers.get('Destination');
  if (!dest) return new Response('Bad Request', { status: 400 });
  const destUrl = new URL(dest);
  let destPath = decodeURIComponent(destUrl.pathname);
  if (destPath.startsWith('/webdav')) destPath = destPath.slice('/webdav'.length) || '/';
  if (!destPath) destPath = '/';

  const structure = await getStructure(env);
  const node = getNode(structure, davPath);
  if (!node) return new Response('Not Found', { status: 404 });

  if (node.type === 'file') {
    const buf = await fetchFileBuffer(node, env);
    const meta = await saveFile(buf, node.name, env);
    setNode(structure, destPath, {
      type: 'file',
      name: destPath.split('/').pop(),
      ssid: meta.ssid,
      storage: meta.storage,
      size: meta.size,
      chunks: meta.chunks,
      githubPath: meta.githubPath,
      createdAt: Date.now()
    });
  } else {
    return new Response('Not Implemented', { status: 501 });
  }
  await saveStructure(env, structure);
  return new Response(null, { status: 204 });
}

function davLock() {
  const token = 'opaquelocktoken:' + crypto.randomUUID();
  const xml = `<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>infinity</D:depth><D:owner></D:owner><D:timeout>Second-3600</D:timeout><D:locktoken><D:href>${token}</D:href></D:locktoken></D:activelock></D:lockdiscovery></D:prop>`;
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Lock-Token': '<' + token + '>' }
  });
}

function davUnlock() {
  return new Response(null, { status: 204 });
}

// ==================== HTML 模板 ====================

const COMMON_HEAD = `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
<style>
:root { --primary:#1976d2; --primary-dark:#115293; --surface:#fff; --bg:#f5f5f5; --divider:#e0e0e0; --text:#212121; --text-sec:#757575; --danger:#d32f2f; --success:#388e3c; --warn:#f9a825; }
* { box-sizing:border-box; }
body { margin:0; font-family:'Roboto',sans-serif; background:var(--bg); color:var(--text); }
.appbar { position:fixed; top:0; left:0; right:0; height:56px; background:var(--primary); color:#fff; display:flex; align-items:center; padding:0 16px; z-index:20; box-shadow:0 2px 4px rgba(0,0,0,.2); }
.appbar h1 { margin:0; font-size:18px; font-weight:500; flex:1; }
.appbar .material-icons { cursor:pointer; padding:8px; }
.container { padding:72px 16px 88px 16px; max-width:900px; margin:0 auto; }
.breadcrumbs { display:flex; align-items:center; gap:4px; margin-bottom:12px; flex-wrap:wrap; }
.breadcrumbs a { color:var(--primary); text-decoration:none; font-size:14px; }
.breadcrumbs span { color:var(--text-sec); font-size:14px; }
.card { background:var(--surface); border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.1); padding:12px; margin-bottom:12px; }
.file-card { background:#fff; border-radius:10px; box-shadow:0 1px 2px rgba(0,0,0,.08); padding:8px 10px; margin-bottom:6px; }
.file-main { display:flex; align-items:center; gap:8px; cursor:pointer; }
.file-icon { width:32px; height:32px; border-radius:6px; background:#e3f2fd; display:flex; align-items:center; justify-content:center; color:var(--primary); flex-shrink:0; }
.file-icon .material-icons { font-size:20px; }
.file-name-wrap { flex:1; min-width:0; overflow:hidden; }
.file-name { display:inline-block; font-size:14px; font-weight:500; white-space:nowrap; }
.file-name.marquee { padding-left:100%; animation:marquee 8s linear infinite; }
@keyframes marquee { 0% { transform:translateX(0); } 100% { transform:translateX(-100%); } }
.file-meta { font-size:11px; color:var(--text-sec); margin-top:1px; }
.file-actions { display:flex; gap:4px; margin-top:6px; justify-content:flex-end; flex-wrap:wrap; }
.file-actions button { background:none; border:none; color:var(--text-sec); cursor:pointer; padding:4px; border-radius:50%; }
.file-actions button .material-icons { font-size:18px; }
.file-card.selected { background:#e3f2fd !important; }
.sel-check { width:18px; height:18px; flex-shrink:0; accent-color:var(--primary); margin-right:4px; display:none; }
#file-list.selection-mode .sel-check { display:inline-block; }
.file-actions button:hover { background:#f5f5f5; color:var(--primary); }
.sort-select { flex:1; padding:6px 8px; border-radius:8px; border:1px solid var(--divider); background:var(--surface); font-size:14px; }
.selection-bar { display:none; align-items:center; gap:6px; margin-bottom:6px; padding:6px 10px; background:var(--surface); border-radius:10px; box-shadow:0 1px 2px rgba(0,0,0,.1); flex-wrap:wrap; }
.selection-bar.show { display:flex; }
.selection-bar button { padding:5px 8px; border:none; border-radius:6px; cursor:pointer; font-size:12px; background:#e0e0e0; color:var(--text); }
#btn-select-mode { padding:6px; }
#btn-select-mode .material-icons { font-size:20px; }
#btn-select-mode.active { color:var(--primary); background:#e3f2fd; }
.empty { text-align:center; padding:40px 0; color:var(--text-sec); }
.bottom-bar { position:fixed; bottom:0; left:0; right:0; height:64px; background:var(--surface); display:flex; box-shadow:0 -2px 6px rgba(0,0,0,.1); z-index:20; }
.bottom-bar button { flex:1; border:none; background:none; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-sec); cursor:pointer; font-size:12px; gap:2px; }
.bottom-bar button.active { color:var(--primary); }
.bottom-bar button:hover { background:#f5f5f5; }
.fab-menu { position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:var(--surface); border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.2); display:none; flex-direction:column; min-width:180px; z-index:30; }
.fab-menu.show { display:flex; }
.fab-menu button { padding:12px 16px; border:none; background:none; text-align:left; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:8px; }
.fab-menu button:hover { background:#f5f5f5; }
.drawer { position:fixed; top:0; right:-320px; width:320px; max-width:90vw; bottom:0; background:var(--surface); box-shadow:-2px 0 8px rgba(0,0,0,.2); z-index:40; transition:right .3s; display:flex; flex-direction:column; }
.drawer.show { right:0; }
.drawer-head { height:56px; background:var(--primary); color:#fff; display:flex; align-items:center; padding:0 16px; font-weight:500; }
.drawer-body { flex:1; overflow-y:auto; padding:12px; }
.drawer-close { cursor:pointer; }
.task-item { padding:12px; border-bottom:1px solid var(--divider); }
.task-title { font-size:14px; font-weight:500; }
.task-msg { font-size:12px; color:var(--text-sec); margin-top:2px; }
.task-progress { height:4px; background:var(--divider); border-radius:2px; margin-top:8px; overflow:hidden; }
.task-progress>div { height:100%; background:var(--primary); transition:width .3s; }
.task-actions { display:flex; gap:8px; margin-top:8px; }
.task-actions button { font-size:12px; padding:4px 8px; border:1px solid var(--divider); background:#fff; border-radius:4px; cursor:pointer; }
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:50; display:none; align-items:center; justify-content:center; }
.modal-overlay.show { display:flex; }
.modal { background:var(--surface); border-radius:12px; width:90%; max-width:400px; padding:20px; }
.modal h3 { margin:0 0 16px; font-size:18px; }
.modal input, .modal textarea { width:100%; padding:10px; border:1px solid var(--divider); border-radius:8px; font-size:14px; margin-bottom:12px; }
.modal textarea { min-height:120px; resize:vertical; }
.modal-actions { display:flex; justify-content:flex-end; gap:8px; }
.modal-actions button { padding:8px 16px; border:none; border-radius:8px; cursor:pointer; font-size:14px; }
.btn-primary { background:var(--primary); color:#fff; }
.btn-secondary { background:#e0e0e0; color:var(--text); }
.snackbar { position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:#323232; color:#fff; padding:10px 16px; border-radius:8px; font-size:14px; z-index:60; display:none; }
.snackbar.show { display:block; }
.preview-box { max-width:100%; overflow:auto; }
.preview-box img, .preview-box video { max-width:100%; border-radius:8px; }
.preview-box audio { width:100%; }
.preview-box pre { background:#263238; color:#aed581; padding:12px; border-radius:8px; overflow:auto; max-height:60vh; font-size:13px; }
.login-box { max-width:360px; margin:80px auto; }
</style>
`;

function page(title, body, scripts = '', themeCss = '') {
  return new Response(`<!DOCTYPE html><html><head>${COMMON_HEAD}${themeCss}<title>${escapeHtml(title)}</title></head><body>${body}${scripts}</body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ==================== 主页面 ====================

const HOME_BODY = `
<div class="appbar"><h1>我的网盘</h1><div style="display:flex;align-items:center;gap:8px;"><span class="material-icons" id="btn-refresh" title="刷新" style="cursor:pointer;padding:8px;">refresh</span><span class="material-icons" id="btn-settings" title="设置" style="cursor:pointer;padding:8px;">settings</span><span class="material-icons" id="btn-logout" title="退出登录" style="cursor:pointer;padding:8px;">logout</span></div></div>
<div class="container">
  <div class="breadcrumbs" id="breadcrumbs"><a href="/?path=">首页</a></div>
  <div id="selection-bar" class="selection-bar">
    <span id="selection-count" style="font-size:14px;flex:1;">已选 0</span>
    <button id="sel-all">全选</button>
    <button id="sel-cancel">取消</button>
    <button id="sel-move">移动</button>
    <button id="sel-copy">复制</button>
    <button id="sel-delete" style="color:var(--danger);">删除</button>
  </div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
    <select id="sort-select" class="sort-select">
      <option value="name-asc">名称正序</option>
      <option value="name-desc">名称倒序</option>
      <option value="time-desc">上传时间倒序</option>
      <option value="time-asc">上传时间正序</option>
      <option value="size-desc">文件大小倒序</option>
      <option value="size-asc">文件大小正序</option>
    </select>
    <span class="material-icons" id="btn-select-mode" title="多选" style="cursor:pointer;padding:8px;background:var(--surface);border-radius:50%;">check_circle</span>
  </div>
  <div id="file-list"></div>
</div>
<div class="fab-menu" id="new-menu">
  <button onclick="newText()"><span class="material-icons">article</span> 新建文本</button>
  <button onclick="newFolder()"><span class="material-icons">create_new_folder</span> 新建文件夹</button>
</div>
<div class="fab-menu" id="upload-menu">
  <button onclick="selectFile()"><span class="material-icons">upload_file</span> 上传文件</button>
  <button onclick="selectFolder()"><span class="material-icons">drive_folder_upload</span> 上传文件夹</button>
</div>
<div class="bottom-bar">
  <button id="btn-tasks"><span class="material-icons">assignment</span>任务</button>
  <button id="btn-new"><span class="material-icons">add_circle</span>新建</button>
  <button id="btn-upload"><span class="material-icons">cloud_upload</span>上传</button>
</div>
<div class="drawer" id="task-drawer">
  <div class="drawer-head"><span>任务列表</span><span class="material-icons drawer-close" id="close-tasks">close</span></div>
  <div class="drawer-body" id="task-list"></div>
  <div class="drawer-foot" style="padding:12px;border-top:1px solid var(--divider);display:flex;gap:8px;">
    <button class="btn-secondary" id="btn-refresh-tasks" style="flex:1;padding:10px;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;"><span class="material-icons">refresh</span>刷新</button>
    <button class="btn-secondary" id="btn-clear-done" style="flex:1;padding:10px;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;"><span class="material-icons">clear_all</span>清除已完成</button>
  </div>
</div>
<div class="modal-overlay" id="modal">
  <div class="modal">
    <h3 id="modal-title">标题</h3>
    <div id="modal-content"></div>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel" onclick="closeModal()">取消</button><button class="btn-primary" id="modal-ok">确定</button></div>
  </div>
</div>
<div class="snackbar" id="snackbar"></div>
<input type="file" id="file-input" style="display:none" multiple>
<input type="file" id="folder-input" style="display:none" webkitdirectory directory multiple>
`;

const HOME_SCRIPT = `
<script>
const params = new URLSearchParams(location.search);
let currentPath = params.get('path') || '';
let currentSort = localStorage.getItem('netdisk-sort') || 'name-asc';
let selectionMode = false;
let selectedPaths = new Set();

function showMsg(msg){ const s=document.getElementById('snackbar'); s.textContent=msg; s.classList.add('show'); setTimeout(()=>s.classList.remove('show'),2500); }
function escapeHtml(t){ return t.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[m])); }
function formatSize(b){ if(!b)return '0 B'; const k=1024, s=['B','KB','MB','GB']; const i=Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(2)+' '+s[i]; }
async function copyText(text){
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('execCommand copy failed');
    }
  } catch (e) { throw new Error('复制失败: ' + (e.message || e)); }
}

async function api(url, opts={}){
  const r=await fetch(url, opts);
  if(r.status===401){ location.href='/login?redirect='+encodeURIComponent(location.pathname+location.search); return null; }
  if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.error||r.statusText); }
  return r.json().catch(()=>null);
}

function sortEntries(a,b){
  const [nameA,nodeA]=a;
  const [nameB,nodeB]=b;
  const timeA=nodeA.createdAt||0;
  const timeB=nodeB.createdAt||0;
  const sizeA=nodeA.size||0;
  const sizeB=nodeB.size||0;
  switch(currentSort){
    case 'name-asc': return nameA.localeCompare(nameB,'zh-CN');
    case 'name-desc': return nameB.localeCompare(nameA,'zh-CN');
    case 'time-asc': return timeA-timeB;
    case 'time-desc': return timeB-timeA;
    case 'size-asc': return sizeA-sizeB;
    case 'size-desc': return sizeB-sizeA;
    default: return nameA.localeCompare(nameB,'zh-CN');
  }
}

function formatTime(ts){
  if(!ts) return '';
  const d=new Date(ts);
  return d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}

async function loadList(){
  const data=await api('/api/structure?path='+encodeURIComponent(currentPath));
  if(!data) return;
  renderBreadcrumbs();
  document.getElementById('sort-select').value=currentSort;
  const list=document.getElementById('file-list');
  const entries=data.children?Object.entries(data.children).sort(sortEntries):[];
  if(entries.length===0){ list.innerHTML='<div class="empty"><span class="material-icons" style="font-size:48px;color:#bdbdbd;">folder_open</span><p>空文件夹</p></div>'; updateSelectionUI(); return; }
  list.innerHTML=entries.map(([name,node])=>{
    const icon = node.type==='folder'?'folder':(getIcon(name));
    const sizeMeta = node.type==='folder'?'文件夹':(formatSize(node.size)||'');
    const timeMeta = formatTime(node.createdAt);
    const meta = timeMeta ? (sizeMeta + ' · ' + timeMeta) : sizeMeta;
    const path = currentPath?currentPath+'/'+name:name;
    const isSelected = selectedPaths.has(path);
    return \`<div class="file-card \${isSelected?'selected':''}" data-path="\${escapeHtml(path)}" data-type="\${node.type}" data-action="open">
      <div class="file-main">
        <input type="checkbox" class="sel-check" data-action="select" \${isSelected?'checked':''}>
        <div class="file-icon"><span class="material-icons">\${icon}</span></div>
        <div class="file-name-wrap">
          <div class="file-name" title="\${escapeHtml(name)}">\${escapeHtml(name)}</div>
        </div>
      </div>
      <div class="file-meta">\${meta}</div>
      <div class="file-actions">
        \${node.type==='file'?\`<button data-action="download" title="下载"><span class="material-icons">download</span></button>
        <button data-action="link" title="复制直链"><span class="material-icons">link</span></button>
        <button data-action="share" title="分享"><span class="material-icons">share</span></button>\`:''}
        \${node.type==='folder'?\`<button data-action="downloadFolder" title="打包下载"><span class="material-icons">folder_zip</span></button>\`:''}
        <button data-action="move" title="移动"><span class="material-icons">drive_file_move</span></button>
        <button data-action="copy" title="复制"><span class="material-icons">content_copy</span></button>
        <button data-action="rename" title="重命名"><span class="material-icons">edit</span></button>
        <button data-action="delete" title="删除"><span class="material-icons">delete</span></button>
      </div>
    </div>\`;
  }).join('');
  setupMarquee();
  updateSelectionUI();
}

function setupMarquee(){
  requestAnimationFrame(()=>{
    document.querySelectorAll('.file-name-wrap').forEach(wrap=>{
      const name=wrap.querySelector('.file-name');
      if(name && name.scrollWidth > wrap.clientWidth){
        name.classList.add('marquee');
      }
    });
  });
}

document.getElementById('file-list').addEventListener('click', e=>{
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const item = btn.closest('.file-card');
  if(!item) return;
  const p = item.dataset.path;
  const type = item.dataset.type;
  const action = btn.dataset.action;
  if(action==='select'){ toggleSelect(p); e.stopPropagation(); return; }
  if(selectionMode && action==='open'){ toggleSelect(p); return; }
  if(action==='open'){ type==='folder'?openFolder(p):openFile(p); }
  else if(action==='download') downloadFile(p);
  else if(action==='link') copyDirectLink(p);
  else if(action==='share') shareFile(p);
  else if(action==='downloadFolder') downloadFolder(p);
  else if(action==='move') moveItem(p);
  else if(action==='copy') copyItem(p);
  else if(action==='rename') renameItem(p);
  else if(action==='delete') deleteItem(p);
});

function toggleSelectionMode(){
  selectionMode = !selectionMode;
  selectedPaths.clear();
  document.getElementById('btn-select-mode').classList.toggle('active', selectionMode);
  document.getElementById('file-list').classList.toggle('selection-mode', selectionMode);
  updateSelectionUI();
}

function toggleSelect(p){
  if(selectedPaths.has(p)) selectedPaths.delete(p);
  else selectedPaths.add(p);
  updateSelectionUI();
  const card = Array.from(document.querySelectorAll('.file-card')).find(c => c.dataset.path === p);
  if(card) card.classList.toggle('selected', selectedPaths.has(p));
}

function updateSelectionUI(){
  const bar = document.getElementById('selection-bar');
  bar.classList.toggle('show', selectionMode);
  document.getElementById('selection-count').textContent = '已选 ' + selectedPaths.size;
  document.querySelectorAll('.file-card').forEach(card=>{
    const p = card.dataset.path;
    card.classList.toggle('selected', selectedPaths.has(p));
    const chk = card.querySelector('.sel-check');
    if(chk) chk.checked = selectedPaths.has(p);
  });
}

function selectAll(){
  document.querySelectorAll('.file-card').forEach(card=>{
    selectedPaths.add(card.dataset.path);
  });
  updateSelectionUI();
}

function clearSelection(){
  selectedPaths.clear();
  selectionMode = false;
  document.getElementById('btn-select-mode').classList.remove('active');
  document.getElementById('file-list').classList.remove('selection-mode');
  updateSelectionUI();
}

async function pickTargetFolder(currentTarget){
  const structure = await api('/api/structure?path=');
  const folders = collectFolderPathsClient(structure);
  const options = [{path:'',label:'根目录'}].concat(folders.map(f=>({path:f,label:'/'+f})));
  const target = currentTarget || currentPath || '';
  const opts = options.map(o=>'<option value="'+escapeHtml(o.path)+'" '+(o.path===target?'selected':'')+'>'+escapeHtml(o.label)+'</option>').join('');
  return new Promise(resolve=>{
    openModal('选择目标文件夹', '<select id="target-folder" style="width:100%;padding:10px;border:1px solid var(--divider);border-radius:8px;font-size:14px;">'+opts+'</select>', ()=>{
      const v = document.getElementById('target-folder').value;
      closeModal();
      resolve(v);
    });
    document.getElementById('modal-cancel').onclick = ()=>{ closeModal(); resolve(null); };
  });
}

function collectFolderPathsClient(node, base=''){
  let list = [];
  if(!node.children) return list;
  for(const [name, child] of Object.entries(node.children)){
    if(child.type !== 'folder') continue;
    const p = base ? base+'/'+name : name;
    list.push(p);
    list = list.concat(collectFolderPathsClient(child, p));
  }
  return list;
}

async function moveItem(p){
  try {
    const target = await pickTargetFolder();
    if(target === null) return;
    await api('/api/file/move', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:p, targetPath:target})});
    showMsg('移动成功');
    loadList();
  } catch(e) { showMsg('移动失败: ' + (e.message || e)); }
}

async function copyItem(p){
  try {
    const target = await pickTargetFolder();
    if(target === null) return;
    await api('/api/file/copy', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:p, targetPath:target})});
    showMsg('复制成功');
    loadList();
  } catch(e) { showMsg('复制失败: ' + (e.message || e)); }
}

async function batchMove(){
  if(selectedPaths.size===0){ showMsg('请先选择文件'); return; }
  try {
    const target = await pickTargetFolder();
    if(target === null) return;
    const paths = Array.from(selectedPaths);
    await api('/api/file/move', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({paths, targetPath:target})});
    showMsg('批量移动成功');
    selectedPaths.clear();
    loadList();
  } catch(e) { showMsg('批量移动失败: ' + (e.message || e)); }
}

async function batchCopy(){
  if(selectedPaths.size===0){ showMsg('请先选择文件'); return; }
  try {
    const target = await pickTargetFolder();
    if(target === null) return;
    const paths = Array.from(selectedPaths);
    await api('/api/file/copy', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({paths, targetPath:target})});
    showMsg('批量复制成功');
    selectedPaths.clear();
    loadList();
  } catch(e) { showMsg('批量复制失败: ' + (e.message || e)); }
}

async function batchDelete(){
  if(selectedPaths.size===0){ showMsg('请先选择文件'); return; }
  if(!confirm('确定删除选中的 '+selectedPaths.size+' 项?')) return;
  try {
    const paths = Array.from(selectedPaths);
    await api('/api/files/batch', {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({paths})});
    showMsg('批量删除成功');
    selectedPaths.clear();
    loadList();
  } catch(e) { showMsg('批量删除失败: ' + (e.message || e)); }
}

function getIcon(name){
  const ext=name.split('.').pop().toLowerCase();
  if(['mp4','webm','mkv'].includes(ext)) return 'movie';
  if(['mp3','wav','ogg','flac','m4a'].includes(ext)) return 'audiotrack';
  if(['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image';
  if(['zip','rar','7z','tar','gz'].includes(ext)) return 'folder_zip';
  if(['txt','md','json','js','css','html'].includes(ext)) return 'description';
  return 'insert_drive_file';
}

function renderBreadcrumbs(){
  const parts=currentPath.split('/').filter(Boolean);
  let html='<a href="/?path=">首页</a>';
  let acc='';
  parts.forEach(p=>{ acc=acc?acc+'/'+p:p; html+=\`<span>/</span><a href="/?path=\${encodeURIComponent(acc)}">\${escapeHtml(p)}</a>\`; });
  document.getElementById('breadcrumbs').innerHTML=html;
}

function openFolder(p){ currentPath=p; selectedPaths.clear(); selectionMode=false; document.getElementById('btn-select-mode').classList.remove('active'); document.getElementById('file-list').classList.remove('selection-mode'); history.pushState(null,'','/?path='+encodeURIComponent(p)); loadList(); }
function openFile(p){ location.href='/file?path='+encodeURIComponent(p); }

async function downloadFile(p){
  const node=await api('/api/file?path='+encodeURIComponent(p));
  if(!node) return;
  location.href='/download/'+encodeURIComponent(node.ssid)+'/'+encodeURIComponent(node.name);
}
async function shareFile(p){
  const node=await api('/api/file?path='+encodeURIComponent(p));
  if(!node) return;
  const url=location.origin+'/share/'+node.ssid;
  await copyText(url);
  showMsg('分享链接已复制');
}
async function copyDirectLink(p){
  const node=await api('/api/file?path='+encodeURIComponent(p));
  if(!node) return;
  const url=location.origin+'/direct/'+node.ssid+'/'+encodeURIComponent(node.name);
  await copyText(url);
  showMsg('直链已复制');
}
function downloadFolder(p){
  location.href='/api/folder/download?path='+encodeURIComponent(p);
}
async function renameItem(p){
  const name=p.split('/').pop();
  const newName=prompt('新名称',name);
  if(!newName||newName===name) return;
  await api('/api/file/rename',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p,newName})});
  loadList();
}
async function deleteItem(p){
  if(!confirm('确定删除 "'+p.split('/').pop()+'"?')) return;
  await api('/api/file?path='+encodeURIComponent(p),{method:'DELETE'});
  loadList();
}

// 新建
function newText(){
  document.getElementById('new-menu').classList.remove('show');
  const content=\`<h3>新建文本文件</h3><input id="new-text-name" placeholder="文件名"><textarea id="new-text-body" placeholder="内容"></textarea>\`;
  openModal('新建文本文件',content,async()=>{
    const name=document.getElementById('new-text-name').value.trim();
    const body=document.getElementById('new-text-body').value;
    if(!name){ showMsg('请输入文件名'); return; }
    const path=currentPath?currentPath+'/'+name:name;
    await api('/api/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,content:body})});
    closeModal(); loadList();
  });
}
function newFolder(){
  document.getElementById('new-menu').classList.remove('show');
  const content='<h3>新建文件夹</h3><input id="new-folder-name" placeholder="文件夹名">';
  openModal('新建文件夹',content,async()=>{
    const name=document.getElementById('new-folder-name').value.trim();
    if(!name){ showMsg('请输入文件夹名'); return; }
    const path=currentPath?currentPath+'/'+name:name;
    await api('/api/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})});
    closeModal(); loadList();
  });
}

// 上传
function genTaskId(){ return 'task_'+Date.now()+'_'+Math.random().toString(36).slice(2,9); }
let localTasks = new Map();
function addLocalTask(t){ localTasks.set(t.id, t); }
function removeLocalTask(id){ localTasks.delete(id); }

function selectFile(){ document.getElementById('file-input').click(); }
function selectFolder(){ document.getElementById('folder-input').click(); }

document.getElementById('file-input').addEventListener('change', e=>uploadFiles(e.target.files));
document.getElementById('folder-input').addEventListener('change', e=>uploadFiles(e.target.files));

async function uploadFiles(files){
  let any = false;
  for(const file of files){
    const rel = file.webkitRelativePath || file.name;
    const folderPrefix = file.webkitRelativePath ? file.webkitRelativePath.slice(0, -file.name.length) : '';
    const targetDir = folderPrefix ? (currentPath ? currentPath + '/' + folderPrefix.slice(0,-1) : folderPrefix.slice(0,-1)) : currentPath;
    try{ await uploadOne(file, targetDir); any = true; }catch(e){}
  }
  loadList();
}

async function uploadOne(file, dir){
  const path = dir ? dir + '/' + file.name : file.name;
  const taskId = genTaskId();
  const baseTask = { id: taskId, name: file.name, status: 'uploading', message: '正在发送...', progress: 1, size: file.size, createdAt: Date.now(), updatedAt: Date.now() };
  addLocalTask(baseTask);
  loadTasks();
  const CHUNK_SIZE = 5 * 1024 * 1024;
  const MAX_CONCURRENT = 6;
  try{
    if (file.size <= CHUNK_SIZE) {
      const form = new FormData();
      form.append('path', path);
      form.append('file', file);
      form.append('taskId', taskId);
      await api('/api/upload', { method: 'POST', body: form });
      removeLocalTask(taskId);
      showMsg('已开始上传: ' + file.name);
    } else {
      const start = await api('/api/upload/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path, filename: file.name, size: file.size, taskId: taskId, clientChunkSize: CHUNK_SIZE }) });
      if (!start) throw new Error('初始化上传失败');
      const chunkSize = start.chunkSize || CHUNK_SIZE;
      const total = start.chunks;
      const isSerial = start.mode === 'serial';
      const completed = new Array(total).fill(false);
      const chunkSizes = [];
      for (let i = 0; i < total; i++) {
        const begin = i * chunkSize;
        const end = Math.min(begin + chunkSize, file.size);
        chunkSizes[i] = end - begin;
      }
      let error = null;
      function formatSpeed(bps){
        if (bps >= 1024 * 1024) return (bps / (1024 * 1024)).toFixed(2) + ' MB/s';
        if (bps >= 1024) return (bps / 1024).toFixed(2) + ' KB/s';
        return bps.toFixed(0) + ' B/s';
      }
      function calcDoneBytes(){
        let sum = 0;
        for (let i = 0; i < total; i++) {
          if (completed[i]) sum += chunkSizes[i];
        }
        return sum;
      }
      let lastRender = 0;
      function renderTask(force){
        const now = Date.now();
        if (!force && now - lastRender < 300) return;
        lastRender = now;
        loadTasks();
      }
      const speedState = { lastTime: Date.now(), lastBytes: 0, str: ' · 0 B/s' };
      function updateProgress(force){
        const doneBytes = calcDoneBytes();
        const progress = Math.min(90, Math.floor((doneBytes / file.size) * 90));
        const stage = isSerial ? '已写入 GitHub ' : '已上传 ';
        addLocalTask({ ...baseTask, message: stage + formatSize(doneBytes) + ' / ' + formatSize(file.size) + speedState.str, progress: progress });
        renderTask(force);
      }
      const speedTimer = setInterval(() => {
        const now = Date.now();
        const doneBytes = calcDoneBytes();
        const dt = (now - speedState.lastTime) / 1000;
        if (dt >= 0.4) {
          const speed = (doneBytes - speedState.lastBytes) / dt;
          speedState.str = ' · ' + formatSpeed(Math.max(0, speed));
          speedState.lastTime = now;
          speedState.lastBytes = doneBytes;
        }
        updateProgress();
      }, 500);
      async function uploadChunk(i){
        const begin = i * chunkSize;
        const end = Math.min(begin + chunkSize, file.size);
        const blob = file.slice(begin, end);
        const form = new FormData();
        form.append('uploadId', start.uploadId);
        form.append('index', String(i));
        form.append('total', String(total));
        form.append('storage', start.storage);
        form.append('mode', start.mode || 'batch');
        form.append('path', path);
        form.append('filename', file.name);
        form.append('chunk', blob, file.name + '.part' + i);
        form.append('taskId', taskId);
        let retries = 0;
        while (true) {
          try {
            await api('/api/upload/chunk', { method: 'POST', body: form });
            completed[i] = true;
            updateProgress(true);
            return;
          } catch (e) {
            retries++;
            const currentSpeed = Math.max(0, (calcDoneBytes() - speedState.lastBytes) / ((Date.now() - speedState.lastTime) / 1000) || 0);
            if (retries > 2) throw new Error('分片 ' + (i + 1) + ' 上传失败: ' + (e.message || e));
            addLocalTask({ ...baseTask, message: '重试分片 ' + (i + 1) + ' (第' + retries + '次) · ' + formatSpeed(currentSpeed), progress: Math.floor((calcDoneBytes() / file.size) * 90) });
            renderTask(true);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      if (isSerial) {
        showMsg('文件大于 500MB，将逐片写入 GitHub，请勿退出页面');
        for (let i = 0; i < total; i++) {
          if (error) break;
          try { await uploadChunk(i); } catch (e) { error = e; }
        }
      } else {
        const queue = [];
        for (let i = 0; i < total; i++) queue.push(i);
        async function worker(){
          while (queue.length > 0) {
            if (error) return;
            const i = queue.shift();
            try {
              await uploadChunk(i);
            } catch (e) {
              error = e;
            }
          }
        }
        const workers = [];
        const threads = Math.min(MAX_CONCURRENT, total);
        for (let t = 0; t < threads; t++) workers.push(worker());
        await Promise.all(workers);
      }
      clearInterval(speedTimer);
      if (error) throw error;
      const finishRes = await api('/api/upload/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId: start.uploadId, path: path, filename: file.name, storage: start.storage, size: file.size, chunks: total, taskId: taskId, mode: start.mode || 'batch' }) });
      if (isSerial) {
        removeLocalTask(taskId);
        showMsg('上传完成: ' + file.name);
      } else if (start.storage === 'github') {
        addLocalTask({ ...baseTask, message: '客户端上传完成，服务端写入 GitHub...', progress: 92 });
        loadTasks();
        showMsg('客户端上传完成，服务端正在写入 GitHub: ' + file.name);
      } else {
        removeLocalTask(taskId);
        showMsg('上传完成: ' + file.name);
      }
    }
  }catch(e){
    addLocalTask({ ...baseTask, status: 'error', message: e.message || '上传失败', progress: 0 });
    loadTasks();
    showMsg('上传失败: ' + file.name + ' ' + e.message);
    throw e;
  }
}

// 任务
let taskTimer=null;
async function loadTasks(){
  const serverTasks=await api('/api/tasks')||[];
  // 清理已完成的本地任务
  for(const t of serverTasks){
    if(localTasks.has(t.id) && (t.status==='done' || t.status==='error' || t.status==='cancelled')){
      localTasks.delete(t.id);
    }
  }
  const map=new Map();
  // 本地任务（含实时进度/速度）优先于服务端任务
  for(const t of localTasks.values()) map.set(t.id, t);
  for(const t of serverTasks){ if(!map.has(t.id)) map.set(t.id, t); }
  const tasks=[...map.values()].sort((a,b)=>b.createdAt - a.createdAt);
  const box=document.getElementById('task-list');
  if(tasks.length===0){ box.innerHTML='<div class="empty">暂无任务</div>'; return; }
  box.innerHTML=tasks.map(t=>{
    const statusColor = t.status==='done'?'var(--success)':(t.status==='error'?'var(--danger)':(t.status==='cancelled'?'var(--text-sec)':'var(--primary)'));
    return \`<div class="task-item">
      <div class="task-title">\${escapeHtml(t.name)} <span style="color:\${statusColor};font-size:12px;">\${t.status}</span></div>
      <div class="task-msg">\${escapeHtml(t.message||'')}</div>
      <div class="task-progress"><div style="width:\${t.progress||0}%"></div></div>
      <div class="task-actions">
        \${t.status==='uploading'||t.status==='processing'?\`<button onclick="cancelTask('\${t.id}')">取消</button>\`:''}
        <button onclick="deleteTask('\${t.id}')">删除</button>
      </div>
    </div>\`;
  }).join('');
}
async function cancelTask(id){
  const t = localTasks.get(id);
  if (t) { t.status = 'cancelled'; t.message = '已取消'; }
  removeLocalTask(id);
  renderTask(true);
  await api('/api/tasks/' + id + '?cancel=1', { method: 'DELETE' });
  loadTasks();
}
async function deleteTask(id){
  removeLocalTask(id);
  renderTask(true);
  await api('/api/tasks/' + id, { method: 'DELETE' });
  loadTasks();
}
async function clearDoneTasks(){
  const serverTasks = await api('/api/tasks') || [];
  for (const t of serverTasks) {
    if (t.status === 'done' || t.status === 'error' || t.status === 'cancelled') {
      await api('/api/tasks/' + t.id, { method: 'DELETE' });
      removeLocalTask(t.id);
    }
  }
  loadTasks();
  showMsg('已完成任务已清除');
}

// 底部菜单
document.getElementById('btn-tasks').onclick=()=>{ document.getElementById('task-drawer').classList.add('show'); loadTasks(); if(taskTimer)clearInterval(taskTimer); taskTimer=setInterval(loadTasks,1500); };
document.getElementById('close-tasks').onclick=()=>{ document.getElementById('task-drawer').classList.remove('show'); if(taskTimer)clearInterval(taskTimer); };
document.getElementById('btn-refresh-tasks').onclick=loadTasks;
document.getElementById('btn-clear-done').onclick=clearDoneTasks;
document.getElementById('btn-refresh').onclick=loadList;
document.getElementById('btn-settings').onclick=()=>{ location.href='/settings'; };
document.getElementById('btn-select-mode').onclick=toggleSelectionMode;
document.getElementById('sel-all').onclick=selectAll;
document.getElementById('sel-cancel').onclick=clearSelection;
document.getElementById('sel-move').onclick=batchMove;
document.getElementById('sel-copy').onclick=batchCopy;
document.getElementById('sel-delete').onclick=batchDelete;
document.getElementById('sort-select').onchange=(e)=>{ currentSort=e.target.value; localStorage.setItem('netdisk-sort', currentSort); loadList(); };
document.getElementById('btn-new').onclick=()=>{ document.getElementById('upload-menu').classList.remove('show'); document.getElementById('new-menu').classList.toggle('show'); };
document.getElementById('btn-upload').onclick=()=>{ document.getElementById('new-menu').classList.remove('show'); document.getElementById('upload-menu').classList.toggle('show'); };
document.addEventListener('click',e=>{ if(!e.target.closest('#btn-new')&&!e.target.closest('#new-menu')) document.getElementById('new-menu').classList.remove('show'); if(!e.target.closest('#btn-upload')&&!e.target.closest('#upload-menu')) document.getElementById('upload-menu').classList.remove('show'); });
document.getElementById('btn-logout').onclick=async()=>{ await api('/api/logout'); location.href='/login'; };

// 模态框
function openModal(title,content,onOk){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-content').innerHTML=content;
  const ok=document.getElementById('modal-ok'); ok.onclick=onOk;
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal').classList.add('show');
}
function closeModal(){ document.getElementById('modal').classList.remove('show'); }

loadList();
</script>
`;

// ==================== 登录页 ====================

function loginPage() {
  return page('登录', `
<div class="container login-box">
  <div class="card">
    <h2 style="margin-top:0;color:var(--primary);">网盘登录</h2>
    <p style="color:var(--text-sec);">请输入访问密码</p>
    <input type="password" id="pwd" placeholder="密码" onkeydown="if(event.key==='Enter')login()">
    <button class="btn-primary" style="width:100%;padding:10px;border:none;border-radius:8px;cursor:pointer;" onclick="login()">进入</button>
    <p id="err" style="color:var(--danger);font-size:14px;"></p>
  </div>
</div>
<script>
async function login(){
  const pwd=document.getElementById('pwd').value;
  const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
  if(r.ok){ const params=new URLSearchParams(location.search); location.href=params.get('redirect')||'/'; }
  else { document.getElementById('err').textContent='密码错误'; }
}
</script>
`);
}

// ==================== 文件详情页 ====================

function fileBody(node, filePath) {
  const meta = formatSize(node.size) + ' · ' + new Date(node.createdAt).toLocaleString();
  const downloadUrl = '/download/' + node.ssid + '/' + encodeURIComponent(node.name);
  return `
<div class="appbar"><span class="material-icons" onclick="history.back()">arrow_back</span><h1 id="title">${escapeHtml(node.name)}</h1></div>
<div class="container">
  <div class="card">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <div class="file-icon" style="width:56px;height:56px;"><span class="material-icons" id="file-icon" style="font-size:28px;">insert_drive_file</span></div>
      <div>
        <div id="file-name" style="font-size:18px;font-weight:500;">${escapeHtml(node.name)}</div>
        <div id="file-meta" style="color:var(--text-sec);font-size:14px;">${meta}</div>
      </div>
    </div>
    <div class="preview-box" id="preview">
      <div class="empty">
        正在加载预览…<br>
        <a href="${downloadUrl}">如果无响应，请点击此处下载</a>
      </div>
    </div>
    <noscript>
      <div class="card" style="margin-top:12px;">
        <p>您的浏览器已禁用 JavaScript，无法自动加载预览。请使用上方“下载”按钮获取文件。</p>
      </div>
    </noscript>
  </div>
  <div class="card" style="display:flex;gap:8px;flex-wrap:wrap;">
    <a class="btn-primary" href="${downloadUrl}" style="display:inline-flex;align-items:center;gap:4px;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;text-decoration:none;"><span class="material-icons">download</span> 下载</a>
    <button class="btn-secondary" onclick="shareFile()" style="display:flex;align-items:center;gap:4px;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;"><span class="material-icons">share</span> 分享</button>
    <button class="btn-secondary" onclick="copyDirectLink()" style="display:flex;align-items:center;gap:4px;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;"><span class="material-icons">link</span> 复制直链</button>
    <button class="btn-secondary" onclick="renameFile()" style="display:flex;align-items:center;gap:4px;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;"><span class="material-icons">edit</span> 重命名</button>
    <button class="btn-secondary" onclick="deleteFile()" style="display:flex;align-items:center;gap:4px;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;color:var(--danger);"><span class="material-icons">delete</span> 删除</button>
    <button class="btn-secondary" id="btn-save" onclick="saveText()" style="display:none;align-items:center;gap:4px;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;"><span class="material-icons">save</span> 保存</button>
  </div>
</div>
<div class="snackbar" id="snackbar"></div>
`;
}

const FILE_SCRIPT = `
<script>
const params=new URLSearchParams(location.search);
const path=params.get('path')||'';
let fileNode=null;
let textContent='';
let editorInstance=null;
let musicPlayer=null;
function showMsg(msg){ const s=document.getElementById('snackbar'); s.textContent=msg; s.classList.add('show'); setTimeout(()=>s.classList.remove('show'),2500); }
function escapeHtml(t){ return t.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function formatSize(b){ if(!b)return '0 B'; const k=1024, s=['B','KB','MB','GB']; const i=Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(2)+' '+s[i]; }
async function copyText(text){
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('execCommand copy failed');
    }
  } catch (e) { throw new Error('复制失败: ' + (e.message || e)); }
}
async function api(url, opts={}){
  const r=await fetch(url, opts);
  if(r.status===401){ location.href='/login?redirect='+encodeURIComponent(location.pathname+location.search); return null; }
  if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.error||r.statusText); }
  return r.json().catch(()=>null);
}
function loadScript(src, timeout=8000){ return new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=src; const t=setTimeout(()=>reject(new Error('load timeout: '+src)), timeout); s.onload=()=>{ clearTimeout(t); resolve(); }; s.onerror=()=>{ clearTimeout(t); reject(new Error('load failed: '+src)); }; document.head.appendChild(s); }); }
function loadCSS(href, timeout=8000){ return new Promise((resolve,reject)=>{ const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; const t=setTimeout(()=>reject(new Error('load timeout: '+href)), timeout); l.onload=()=>{ clearTimeout(t); resolve(); }; l.onerror=()=>{ clearTimeout(t); reject(new Error('load failed: '+href)); }; document.head.appendChild(l); }); }
function getMime(name){
  const ext=name.split('.').pop().toLowerCase();
  const map={mp4:'video/mp4',webm:'video/webm',mkv:'video/x-matroska',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac',m4a:'audio/mp4',txt:'text/plain',md:'text/markdown',json:'application/json',js:'application/javascript',css:'text/css',html:'text/html',xml:'application/xml',zip:'application/zip',rar:'application/vnd.rar','7z':'application/x-7z-compressed',tar:'application/x-tar',gz:'application/gzip',pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp'};
  return map[ext]||'application/octet-stream';
}
async function load(){
  const preview=document.getElementById('preview');
  try{
    fileNode=await api('/api/file?path='+encodeURIComponent(path));
    if(!fileNode){ preview.innerHTML='<div class="empty">文件不存在或无权访问</div>'; return; }
    document.getElementById('file-name').textContent=fileNode.name;
    document.getElementById('file-meta').textContent=formatSize(fileNode.size)+' · '+new Date(fileNode.createdAt).toLocaleString();
    document.getElementById('title').textContent=fileNode.name;
    await renderPreview();
  }catch(e){
    console.error('文件详情加载失败',e);
    preview.innerHTML='<div class="empty">加载失败: '+escapeHtml(e.message)+'</div>';
  }
}
async function renderPreview(){
  const ext=fileNode.name.split('.').pop().toLowerCase();
  const mime=getMime(fileNode.name);
  const preview=document.getElementById('preview');
  const url='/direct/'+fileNode.ssid+'/'+encodeURIComponent(fileNode.name);
  const downloadUrl='/download/'+fileNode.ssid+'/'+encodeURIComponent(fileNode.name);
  preview.innerHTML='<div class="empty">正在加载预览...</div>';
  try{
    if(mime.startsWith('video/')){
      await loadCSS('https://cdn.jsdelivr.net/npm/mui-player@1.8.1/dist/mui-player.min.css');
      await loadScript('https://cdn.jsdelivr.net/npm/mui-player@1.8.1/dist/mui-player.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/mui-player-mobile-plugin@1.4.1/dist/mui-player-mobile-plugin.min.js');
      preview.innerHTML='<div id="video-zoom-wrap" style="width:100%;height:70vh;overflow:hidden;touch-action:none;position:relative;background:#000;">'+
        '<div id="mui-player" style="width:100%;height:100%;">'+
          '<template slot="mute-btn"><span class="material-icons" style="color:#fff;font-size:20px;line-height:1;" id="mute-icon">volume_up</span></template>'+
        '</div>'+
      '</div>';
      const mp=new MuiPlayer({
        container:'#mui-player',
        src:url,
        title:fileNode.name,
        autoplay:false,
        preload:'metadata',
        autoFit:true,
        width:'100%',
        height:'100%',
        lang:'zh-cn',
        objectFit:'contain',
        custom:{
          footerControls:[
            { slot:'mute-btn', position:'right', tooltip:'静音/取消静音', oftenShow:true, click:function(e){ const v=mp.video(); v.muted=!v.muted; const icon=document.getElementById('mute-icon'); if(icon) icon.textContent=v.muted?'volume_off':'volume_up'; } }
          ]
        },
        plugins:[
          new MuiPlayerMobilePlugin({
            showMenuButton:true,
            defaultMenuConfig:{ showSpeedSwitch:true, showFillSwitch:true, showLoopSwitch:true }
          })
        ]
      });
      window.currentMuiPlayer=mp;
      const wrap=document.getElementById('video-zoom-wrap');
      const playerEl=document.getElementById('mui-player');
      let initialDistance=0, initialScale=1, currentScale=1;
      wrap.addEventListener('touchstart', function(e){ if(e.touches.length===2){ const dx=e.touches[0].clientX-e.touches[1].clientX; const dy=e.touches[0].clientY-e.touches[1].clientY; initialDistance=Math.sqrt(dx*dx+dy*dy); initialScale=currentScale; } });
      wrap.addEventListener('touchmove', function(e){ if(e.touches.length===2){ const dx=e.touches[0].clientX-e.touches[1].clientX; const dy=e.touches[0].clientY-e.touches[1].clientY; const dist=Math.sqrt(dx*dx+dy*dy); currentScale=Math.max(1, Math.min(initialScale*(dist/initialDistance), 4)); playerEl.style.transform='scale('+currentScale+')'; playerEl.style.transformOrigin='center center'; e.preventDefault(); } });
      wrap.addEventListener('touchend', function(e){ if(e.touches.length<2 && currentScale<1){ currentScale=1; playerEl.style.transform='scale(1)'; } });
    } else if(mime.startsWith('audio/')){
      await loadCSS('https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css');
      await loadScript('https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.min.js');
      preview.innerHTML='<audio id="media-player" controls style="width:100%;"><source src="'+url+'" type="'+mime+'"></audio>';
      new Plyr('#media-player',{controls:['play','progress']});
    } else if(['txt','md','json','js','css','html','xml'].includes(ext)){
      const r=await fetch(url);
      if(!r.ok) throw new Error('读取文本失败: '+r.status);
      textContent=await r.text();
      preview.innerHTML='<textarea id="fallback-editor" style="width:100%;min-height:400px;font-family:monospace;padding:12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;">'+escapeHtml(textContent)+'</textarea>';
      document.getElementById('btn-save').style.display='inline-flex';
    } else if(ext==='zip'||ext==='rar'||ext==='7z'||ext==='tar'||ext==='gz'){
      preview.innerHTML='<div id="zip-list" class="card" style="padding:0;max-height:60vh;overflow:auto;"><div class="empty">正在读取压缩包...</div></div>';
      await renderZip(url);
    } else if(mime.startsWith('image/')){
      preview.innerHTML='<img id="preview-img" src="'+url+'" alt="'+escapeHtml(fileNode.name)+'" style="max-width:100%;border-radius:8px;cursor:pointer;">';
      try{
        await loadCSS('https://cdn.jsdelivr.net/npm/viewerjs@1.11.6/dist/viewer.min.css');
        await loadScript('https://cdn.jsdelivr.net/npm/viewerjs@1.11.6/dist/viewer.min.js');
        new Viewer(document.getElementById('preview-img'),{url:'src',title:false});
      }catch(e){ console.log('viewerjs 加载失败，使用原生图片预览'); }
    } else {
      preview.innerHTML='<div class="empty"><span class="material-icons" style="font-size:48px;color:#bdbdbd;">insert_drive_file</span><p>该文件类型无法预览</p><a href="'+downloadUrl+'">下载文件</a></div>';
    }
  }catch(e){
    console.error('预览加载失败',e);
    if(mime.startsWith('video/')){
      preview.innerHTML='<div class="empty">MuiPlayer 加载失败，使用原生播放器</div><video controls playsinline style="width:100%;max-height:70vh;"><source src="'+url+'" type="'+mime+'"></video>';
    }else if(mime.startsWith('audio/')){
      preview.innerHTML='<div class="empty">Plyr 加载失败，使用原生播放器</div><audio controls src="'+url+'" style="width:100%;"></audio>';
    }else if(['txt','md','json','js','css','html','xml'].includes(ext)){
      try{
        const r=await fetch(url);
        textContent=await r.text();
        preview.innerHTML='<textarea id="fallback-editor" style="width:100%;min-height:400px;font-family:monospace;padding:12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;">'+escapeHtml(textContent)+'</textarea>';
        document.getElementById('btn-save').style.display='inline-flex';
      }catch(e2){
        preview.innerHTML='<div class="empty">文本读取失败: '+escapeHtml(e2.message)+'<br><a href="'+url+'" target="_blank">点击测试直链</a></div>';
      }
    }else{
      preview.innerHTML='<div class="empty">预览加载失败: '+escapeHtml(e.message)+'<br><a href="'+url+'" target="_blank">点击测试直链</a><br><a href="'+downloadUrl+'">下载文件</a></div>';
    }
  }
  const iconMap={'mp4':'movie','mp3':'audiotrack','wav':'audiotrack','ogg':'audiotrack','jpg':'image','jpeg':'image','png':'image','gif':'image','webp':'image','zip':'folder_zip','rar':'folder_zip','7z':'folder_zip','tar':'folder_zip','gz':'folder_zip','txt':'description','md':'description','json':'description','js':'description','css':'description','html':'description'};
  document.getElementById('file-icon').textContent=iconMap[ext]||'insert_drive_file';
}
async function renderZip(url){
  const list=document.getElementById('zip-list');
  list.innerHTML='<div class="empty">正在读取压缩包...</div>';
  try{
    const fflate=await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
    const r=await fetch(url);
    const buf=await r.arrayBuffer();
    const entries=await new Promise((resolve,reject)=>{
      const result={};
      fflate.unzip(new Uint8Array(buf), (err, data)=>{
        if(err){ reject(err); return; }
        resolve(data);
      });
    });
    const names=Object.keys(entries).sort();
    if(names.length===0){ list.innerHTML='<div class="empty">压缩包为空</div>'; return; }
    list.innerHTML=names.map(name=>{
      const entry=entries[name];
      const isDir=name.endsWith('/');
      return '<div class="zip-item" data-name="'+escapeHtml(name)+'" style="padding:10px 12px;border-bottom:1px solid #e0e0e0;display:flex;align-items:center;gap:8px;cursor:'+(isDir?'default':'pointer')+';">'+
        '<span class="material-icons" style="color:#757575;">'+(isDir?'folder':'insert_drive_file')+'</span>'+
        '<span style="flex:1;word-break:break-all;">'+escapeHtml(name)+'</span>'+
        '<span style="color:#757575;font-size:12px;">'+formatSize(entry.length)+'</span>'+
      '</div>';
    }).join('');
    list.querySelectorAll('.zip-item').forEach(item=>{
      if(item.dataset.name.endsWith('/')) return;
      item.onclick=async()=>{
        const entry=entries[item.dataset.name];
        const ext=item.dataset.name.split('.').pop().toLowerCase();
        const textExts=['txt','md','json','js','css','html','xml'];
        if(textExts.includes(ext)){
          const text=fflate.strFromU8(entry);
          const wrap=document.createElement('div'); wrap.style.padding='12px';
          const backBtn=document.createElement('button'); backBtn.className='btn-secondary'; backBtn.textContent='返回列表'; backBtn.style.marginBottom='12px';
          backBtn.onclick=()=>renderZip(url);
          const pre=document.createElement('pre'); pre.style.cssText='background:#263238;color:#aed581;padding:12px;border-radius:8px;overflow:auto;max-height:60vh;font-size:13px;';
          pre.textContent=text;
          wrap.appendChild(backBtn); wrap.appendChild(pre);
          list.innerHTML=''; list.appendChild(wrap);
        } else {
          const blob=new Blob([entry.buffer], {type:getMime(item.dataset.name)});
          const blobUrl=URL.createObjectURL(blob);
          const a=document.createElement('a'); a.href=blobUrl; a.download=item.dataset.name.split('/').pop(); a.click();
        }
      };
    });
  }catch(e){
    console.error(e);
    list.innerHTML='<div class="empty">读取压缩包失败: '+escapeHtml(e.message)+'</div>';
  }
}
function downloadFile(){ if(!fileNode){ showMsg('文件未加载'); return; } location.href='/download/'+fileNode.ssid+'/'+encodeURIComponent(fileNode.name); }
async function shareFile(){ if(!fileNode){ showMsg('文件未加载'); return; } await copyText(location.origin+'/share/'+fileNode.ssid); showMsg('分享链接已复制'); }
async function copyDirectLink(){ if(!fileNode){ showMsg('文件未加载'); return; } const url=location.origin+'/direct/'+fileNode.ssid+'/'+encodeURIComponent(fileNode.name); await copyText(url); showMsg('直链已复制'); }
async function renameFile(){ if(!fileNode){ showMsg('文件未加载'); return; } const n=prompt('新名称',fileNode.name); if(!n||n===fileNode.name) return; await api('/api/file/rename',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,newName:n})}); location.reload(); }
async function deleteFile(){ if(!fileNode){ showMsg('文件未加载'); return; } if(!confirm('确定删除?')) return; await api('/api/file?path='+encodeURIComponent(path),{method:'DELETE'}); location.href='/?path='+encodeURIComponent(path.split('/').slice(0,-1).join('/')); }
async function saveText(){
  let body;
  if(editorInstance){ body=editorInstance.getText(); }
  else {
    const ta=document.getElementById('fallback-editor');
    if(!ta){ showMsg('编辑器未加载'); return; }
    body=ta.value;
  }
  try{
    await api('/api/file/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,content:body})});
    showMsg('已保存');
  }catch(e){ showMsg('保存失败: '+e.message); }
}
load();
</script>
`;

// ==================== 设置页 ====================

function settingsPage(settings = {}) {
  const primary = settings.primary || '#1976d2';
  const bg = settings.bg || '';
  const cardOpacity = settings.cardOpacity != null ? settings.cardOpacity : 1;
  const fontFamily = settings.fontFamily || '';
  const useCustomFont = fontFamily && (fontFamily.startsWith('http') || fontFamily.startsWith('/'));
  return page('设置', `
<div class="appbar"><span class="material-icons" onclick="history.back()">arrow_back</span><h1>设置</h1></div>
<div class="container">
  <div class="card">
    <h3 style="margin-top:0;">外观</h3>
    <label style="display:block;margin-bottom:8px;font-size:14px;color:var(--text-sec);">主题颜色</label>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
      <input type="color" id="primary-color" value="${primary}" style="width:56px;height:36px;padding:0;border:none;background:none;cursor:pointer;">
      <span id="primary-label" style="font-size:14px;">${primary}</span>
    </div>
    <label style="display:block;margin-bottom:8px;font-size:14px;color:var(--text-sec);">全局字体</label>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;">
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;">
        <input type="radio" name="font-mode" value="system" ${!useCustomFont ? 'checked' : ''}> 手机默认字体
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;">
        <input type="radio" name="font-mode" value="custom" ${useCustomFont ? 'checked' : ''}> 自定义字体
      </label>
    </div>
    <div id="font-upload-wrap" style="display:${useCustomFont ? 'flex' : 'none'};gap:8px;margin-bottom:16px;align-items:center;">
      <input type="text" id="font-value" placeholder="字体 URL" value="${escapeHtml(fontFamily)}" style="flex:1;">
      <input type="file" id="font-file" accept=".ttf,.otf,.woff,.woff2" style="display:none">
      <button class="btn-secondary" onclick="document.getElementById('font-file').click()" style="display:flex;align-items:center;gap:4px;padding:8px;border:none;border-radius:8px;cursor:pointer;white-space:nowrap;"><span class="material-icons">font_download</span>上传</button>
    </div>
    <label style="display:block;margin-bottom:8px;font-size:14px;color:var(--text-sec);">文件列表背景</label>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <input type="text" id="bg-value" placeholder="颜色/图片URL" value="${escapeHtml(bg)}" style="flex:1;">
      <input type="color" id="bg-color" value="#f5f5f5" style="width:48px;padding:0;border:none;background:none;cursor:pointer;">
      <input type="file" id="bg-file" accept="image/*" style="display:none">
      <button class="btn-secondary" onclick="document.getElementById('bg-file').click()" style="display:flex;align-items:center;gap:4px;padding:8px;border:none;border-radius:8px;cursor:pointer;white-space:nowrap;"><span class="material-icons">image</span>上传</button>
    </div>
    <label style="display:block;margin-bottom:8px;font-size:14px;color:var(--text-sec);">文件卡片透明度: <span id="opacity-label">${Math.round(cardOpacity * 100)}%</span></label>
    <input type="range" id="card-opacity" min="0.2" max="1" step="0.05" value="${cardOpacity}" style="width:100%;margin-bottom:16px;">
  </div>
  <div class="card">
    <h3 style="margin-top:0;">危险操作</h3>
    <button class="btn-secondary" onclick="clearAllData()" style="width:100%;padding:12px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--danger);"><span class="material-icons">delete_forever</span> 一键清空网盘</button>
  </div>
  <div class="card" style="text-align:center;">
    <button class="btn-primary" onclick="saveSettings()" style="padding:12px 24px;border:none;border-radius:8px;cursor:pointer;">保存设置</button>
  </div>
</div>
<div class="snackbar" id="snackbar"></div>
`, `
<script>
let currentSettings = { primary: '${primary}', bg: '${escapeHtml(bg)}', cardOpacity: ${cardOpacity}, fontFamily: '${escapeHtml(fontFamily)}' };
function getFontFamily(){
  const mode = document.querySelector('input[name="font-mode"]:checked').value;
  return mode === 'custom' ? document.getElementById('font-value').value.trim() : '';
}
function updateFontUI(){
  const mode = document.querySelector('input[name="font-mode"]:checked').value;
  document.getElementById('font-upload-wrap').style.display = mode === 'custom' ? 'flex' : 'none';
}
function showMsg(msg){ const s=document.getElementById('snackbar'); s.textContent=msg; s.classList.add('show'); setTimeout(()=>s.classList.remove('show'),2500); }
function escapeHtml(t){ return t.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
async function api(url, opts={}){
  const r=await fetch(url, opts);
  if(r.status===401){ location.href='/login?redirect='+encodeURIComponent(location.pathname+location.search); return null; }
  if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.error||r.statusText); }
  return r.json().catch(()=>null);
}
document.getElementById('primary-color').oninput = function(){
  document.getElementById('primary-label').textContent = this.value;
};
document.getElementById('bg-color').oninput = function(){
  document.getElementById('bg-value').value = this.value;
};
document.getElementById('card-opacity').oninput = function(){
  document.getElementById('opacity-label').textContent = Math.round(parseFloat(this.value) * 100) + '%';
};
document.getElementById('bg-file').onchange = async function(){
  const file = this.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  try {
    const r = await fetch('/api/upload/background', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '上传失败');
    document.getElementById('bg-value').value = j.url;
    showMsg('背景图已上传');
  } catch (e) {
    showMsg('背景图上传失败: ' + e.message);
  }
};
document.querySelectorAll('input[name="font-mode"]').forEach(radio => {
  radio.onchange = updateFontUI;
});
document.getElementById('font-file').onchange = async function(){
  const file = this.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  try {
    const r = await fetch('/api/upload/font', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '上传失败');
    document.getElementById('font-value').value = j.url;
    showMsg('字体已上传');
  } catch (e) {
    showMsg('字体上传失败: ' + e.message);
  }
};
async function saveSettings(){
  const settings = {
    primary: document.getElementById('primary-color').value,
    bg: document.getElementById('bg-value').value.trim(),
    cardOpacity: parseFloat(document.getElementById('card-opacity').value),
    fontFamily: getFontFamily()
  };
  await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
  showMsg('设置已保存');
  setTimeout(() => location.reload(), 600);
}
async function clearAllData(){
  const pwd = prompt('警告：这将清空所有文件、任务和设置，且无法恢复。请输入网盘密码确认：');
  if (!pwd) return;
  await api('/api/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) });
  showMsg('网盘已清空');
  setTimeout(() => location.href = '/', 800);
}
</script>
`, settings.themeCss || '');
}

function generateThemeCss(settings = {}) {
  const primary = settings.primary || '#1976d2';
  const bg = settings.bg || '';
  const cardOpacity = settings.cardOpacity != null ? settings.cardOpacity : 1;
  const fontFamily = settings.fontFamily || '';
  let css = '<style id="theme-style">';
  css += ':root { --primary:' + primary + '; --primary-dark:' + adjustColor(primary, -30) + '; }';
  if (fontFamily) {
    css += '@font-face { font-family: "CustomNetdiskFont"; src: url(' + fontFamily + '); }';
    css += 'body, input, select, button, textarea { font-family: "CustomNetdiskFont", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; }';
  } else {
    css += 'body, input, select, button, textarea { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important; }';
  }
  if (bg) {
    if (bg.startsWith('http') || bg.startsWith('data:') || bg.startsWith('/')) {
      css += 'html, body { background: transparent !important; }';
      css += 'body::before { content:""; position:fixed; inset:0; z-index:-1; background-image: url(' + bg + '); background-size: cover; background-attachment: fixed; background-position: center; }';
    } else {
      css += 'html, body { background: ' + bg + ' !important; }';
    }
  }
  const alpha = Math.round(cardOpacity * 255).toString(16).padStart(2, '0');
  const cardBg = cardOpacity < 1 ? 'ffffff' + alpha : 'ffffff';
  css += '.file-card, .sort-select, #btn-select-mode, .selection-bar, .selection-bar button { background-color: #' + cardBg + ' !important; }';
  css += '</style>';
  return css;
}

function adjustColor(hex, amount) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ==================== 分享页 ====================

function sharePage(node) {
  return page('分享', `
<div class="appbar"><h1>文件分享</h1></div>
<div class="container">
  <div class="card" style="text-align:center;">
    <div class="file-icon" style="width:72px;height:72px;margin:0 auto;"><span class="material-icons" style="font-size:36px;">insert_drive_file</span></div>
    <h2 style="margin:12px 0 4px;">${escapeHtml(node.name)}</h2>
    <p style="color:var(--text-sec);">${formatSize(node.size)}</p>
    <div style="margin-top:20px;display:flex;gap:12px;justify-content:center;">
      <button class="btn-primary" onclick="location.href='/direct/${node.ssid}/${encodeURIComponent(node.name)}'" style="padding:10px 20px;border:none;border-radius:8px;cursor:pointer;">下载</button>
      <button class="btn-secondary" onclick="preview()" style="padding:10px 20px;border:none;border-radius:8px;cursor:pointer;">预览</button>
    </div>
  </div>
</div>
<script>
async function preview(){
  try{
    const r=await fetch('/api/share/${node.ssid}');
    if(!r.ok){ alert('获取分享信息失败: '+r.status); return; }
    const info=await r.json();
    if(info.previewUrl) location.href=info.previewUrl; else alert('无法预览');
  }catch(e){ alert('预览失败: '+e.message); }
}
</script>
`);
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ==================== 路由处理 ====================

async function handleRequest(request, env, ctx = null) {
  const url = new URL(request.url);
  const path = decodeURIComponent(url.pathname);

  // API 路由
  if (path === '/api/login') {
    const body = await request.json();
    if (body.password === env.CLOUD_PASSWORD) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `auth=${encodeURIComponent(env.CLOUD_PASSWORD)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
        }
      });
    }
    return errorResponse('密码错误', 401);
  }

  if (path === '/api/logout') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
      }
    });
  }

  if (path === '/api/structure') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const p = url.searchParams.get('path') || '';
    const structure = await getStructure(env);
    const node = p ? getNode(structure, p) : structure;
    if (!node) return errorResponse('路径不存在', 404);
    return jsonResponse(node);
  }

  if (path === '/api/folder' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const structure = await getStructure(env);
    const parts = body.path.split('/').filter(Boolean);
    let parent = structure;
    for (const p of parts) {
      if (!parent.children[p]) {
        parent.children[p] = { type: 'folder', name: p, children: {}, createdAt: Date.now() };
      }
      parent = parent.children[p];
    }
    await saveStructure(env, structure);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/text' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const content = new TextEncoder().encode(body.content || '');
    const name = body.path.split('/').pop() || 'untitled.txt';
    const taskId = ssid();
    await addTask(env, {
      id: taskId,
      name,
      status: 'uploading',
      message: '保存文本到 GitHub...',
      progress: 0,
      size: content.byteLength,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    try {
      const meta = await saveFile(content.buffer, name, env, taskId);
      const structure = await getStructure(env);
      setNode(structure, body.path, {
        type: 'file',
        name,
        ssid: meta.ssid,
        storage: meta.storage,
        size: meta.size,
        chunks: meta.chunks,
        createdAt: Date.now()
      });
      await saveStructure(env, structure);
      await updateTask(env, taskId, { status: 'done', message: '完成', progress: 100 });
    } catch (e) {
      console.error('文本保存失败', e);
      await updateTask(env, taskId, { status: 'error', message: e.message || '保存失败', progress: 0 });
      return errorResponse(e.message || '保存失败', 500);
    }
    return jsonResponse({ ok: true, taskId });
  }

  if (path === '/api/upload' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const form = await request.formData();
    const filePath = form.get('path') || '';
    const file = form.get('file');
    if (!file || !filePath) return errorResponse('缺少文件或路径');
    const arrayBuffer = await file.arrayBuffer();
    const taskId = form.get('taskId') || ssid();
    const task = {
      id: taskId,
      name: file.name,
      status: 'uploading',
      message: '准备上传...',
      progress: 0,
      size: arrayBuffer.byteLength,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await addTask(env, task);
    try {
      const meta = await saveFile(arrayBuffer, file.name, env, taskId);
      const structure = await getStructure(env);
      const oldNode = getNode(structure, filePath);
      if (oldNode && oldNode.type === 'file') await deleteFileStorage(oldNode, env);
      setNode(structure, filePath, {
        type: 'file',
        name: file.name,
        ssid: meta.ssid,
        storage: meta.storage,
        size: meta.size,
        chunks: meta.chunks,
        githubPath: meta.githubPath,
        createdAt: Date.now()
      });
      await saveStructure(env, structure);
    } catch (e) {
      console.error('上传失败', e);
      await updateTask(env, taskId, { status: 'error', message: e.message || '上传失败', progress: 0 });
      return errorResponse(e.message || '上传失败', 500);
    }
    return jsonResponse({ ok: true, taskId });
  }

  // 大文件客户端分片上传：初始化
  if (path === '/api/upload/start' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const filePath = body.path;
    const filename = body.filename;
    const size = body.size;
    const taskId = body.taskId || ssid();
    if (!filePath || !filename || size == null) return errorResponse('缺少路径/文件名/大小');
    const uploadId = ssid();
    const storage = size <= KV_SIZE_LIMIT ? 'kv' : 'github';
    const chunkSize = Math.min(body.clientChunkSize || CLIENT_CHUNK_SIZE, CHUNK_SIZE);
    const chunks = Math.ceil(size / chunkSize);
    const mode = (size > SERIAL_THRESHOLD || storage === 'kv') ? 'serial' : 'batch';
    if (mode === 'serial') {
      await updateTask(env, taskId, { message: '大文件串流上传：创建 GitHub 仓库...', progress: 1 });
      await githubCreateRepo(uploadId, env);
    }
    await addTask(env, {
      id: taskId,
      name: filename,
      status: 'uploading',
      message: mode === 'serial' ? '大文件串流上传：等待 GitHub 写入中...' : '准备分片上传...',
      progress: 0,
      size,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    return jsonResponse({ uploadId, storage, chunks, chunkSize, taskId, mode });
  }

  // 大文件客户端分片上传：接收单分片
  // batch 模式：只写入 KV，等 /finish 后台串行写入 GitHub
  // serial 模式：收到分片后先写 KV 缓冲，立即上传 GitHub，成功后立刻删除该分片
  if (path === '/api/upload/chunk' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const form = await request.formData();
    const uploadId = form.get('uploadId');
    const index = parseInt(form.get('index'), 10);
    const total = parseInt(form.get('total'), 10);
    const taskId = form.get('taskId');
    const chunkFile = form.get('chunk');
    const mode = form.get('mode') || 'batch';
    if (!uploadId || isNaN(index) || !chunkFile) return errorResponse('缺少分片参数');
    const chunkBuf = await chunkFile.arrayBuffer();
    const kv = getKV(uploadId, env);
    const chunkKey = uploadId + '_chunk_' + index;
    try {
      await kv.put(chunkKey, chunkBuf);
      if (mode === 'serial') {
        await githubUploadFile(uploadId, 'chunk_' + index, chunkBuf, env, 'chunk ' + index);
        await kv.delete(chunkKey);
        if (!isNaN(total) && taskId) {
          await updateTask(env, taskId, {
            message: '分片 ' + (index + 1) + '/' + total + ' 已写入 GitHub',
            progress: Math.min(90, Math.floor(((index + 1) / total) * 90))
          });
        }
      }
      return jsonResponse({ ok: true, index, mode });
    } catch (e) {
      console.error('分片上传失败', e);
      try { await updateTask(env, taskId, { status: 'error', message: e.message || '分片上传失败', progress: 0 }); } catch (_) {}
      return errorResponse(e.message || '分片上传失败', 500);
    }
  }

  // 大文件客户端分片上传：完成并写入目录（服务端串行写入 GitHub）
  if (path === '/api/upload/finish' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const filePath = body.path;
    const uploadId = body.uploadId;
    const filename = body.filename;
    const storage = body.storage;
    const size = body.size;
    const chunks = body.chunks;
    const taskId = body.taskId;
    const mode = body.mode || 'batch';
    if (!filePath || !uploadId || !filename || !storage) return errorResponse('缺少完成参数');

    // 客户端上传阶段已完成，立即返回，后续 GitHub 写入在后台执行
    const finishBackground = async () => {
      const structure = await getStructure(env);
      const oldNode = getNode(structure, filePath);
      if (oldNode && oldNode.type === 'file') {
        try { await deleteFileStorage(oldNode, env); } catch (e) { console.error(e); }
      }

      let finalStorage = storage;
      let finalSsid = uploadId;

      if (mode === 'serial') {
        await updateTask(env, taskId, { message: '串流上传完成，正在写入目录...', progress: 95 });
      } else if (storage === 'github') {
        await updateTask(env, taskId, { message: '服务端：创建/校验 GitHub 仓库...', progress: 92 });
        let reportTimer = null;
        try {
          await githubCreateRepo(uploadId, env);

          const totalBytes = Number(size) || 0;
          let uploadedBytes = 0;
          const startTime = Date.now();
          const reportSpeed = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? uploadedBytes / elapsed : 0;
            const progress = 92 + Math.min(7, Math.floor((totalBytes > 0 ? uploadedBytes / totalBytes : 0) * 7));
            updateTask(env, taskId, {
              message: '服务端写入 GitHub... ' + formatSize(uploadedBytes) + ' / ' + formatSize(totalBytes) + ' · ' + formatSpeed(speed),
              progress
            }).catch(() => {});
          };
          reportTimer = setInterval(reportSpeed, 800);

          for (let i = 0; i < chunks; i++) {
            if (await isTaskCancelled(env, taskId)) {
              clearInterval(reportTimer);
              reportTimer = null;
              await updateTask(env, taskId, { status: 'cancelled', message: '已取消', progress: 0 });
              return;
            }
            await updateTask(env, taskId, { message: '服务端：读取分片 ' + (i + 1) + '/' + chunks, progress: 92 + Math.floor((i / chunks) * 7) });
            const b = await getKV(uploadId, env).get(uploadId + '_chunk_' + i, { type: 'arrayBuffer' });
            if (!b) throw new Error('分片 ' + (i + 1) + ' 在服务端丢失');
            await githubUploadFile(uploadId, 'chunk_' + i, b, env, 'chunk ' + i);
            uploadedBytes += b.byteLength;
            await getKV(uploadId, env).delete(uploadId + '_chunk_' + i);
            await updateTask(env, taskId, { message: '服务端：分片 ' + (i + 1) + '/' + chunks + ' 写入并校验通过', progress: 92 + Math.floor(((i + 1) / chunks) * 7) });
          }
          clearInterval(reportTimer);
          reportTimer = null;
        } catch (e) {
          if (reportTimer) { clearInterval(reportTimer); reportTimer = null; }
          console.error('服务端写入 GitHub 失败', e);
          await updateTask(env, taskId, { status: 'error', message: 'GitHub 写入失败: ' + e.message, progress: 0 });
          return;
        }
      } else if (storage === 'kv' && chunks > 1) {
        try {
          await updateTask(env, taskId, { message: '服务端合并分片...', progress: 92 });
          let totalLen = 0;
          const bufs = [];
          for (let i = 0; i < chunks; i++) {
            const b = await getKV(uploadId, env).get(uploadId + '_chunk_' + i, { type: 'arrayBuffer' });
            bufs.push(new Uint8Array(b));
            totalLen += b.byteLength;
          }
          const combined = new Uint8Array(totalLen);
          let off = 0;
          for (const b of bufs) { combined.set(b, off); off += b.byteLength; }
          await getKV(finalSsid, env).put(finalSsid, combined.buffer);
          for (let i = 0; i < chunks; i++) await getKV(uploadId, env).delete(uploadId + '_chunk_' + i);
          finalStorage = 'kv';
        } catch (e) {
          console.error('服务端合并分片失败', e);
          await updateTask(env, taskId, { status: 'error', message: '合并分片失败: ' + e.message, progress: 0 });
          return;
        }
      }

      const structure2 = await getStructure(env);
      setNode(structure2, filePath, {
        type: 'file',
        name: filename,
        ssid: finalSsid,
        storage: finalStorage,
        size,
        chunks: storage === 'kv' ? 1 : chunks,
        createdAt: Date.now()
      });
      await saveStructure(env, structure2);
      await updateTask(env, taskId, { status: 'done', message: '完成', progress: 100 });
    };

    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(finishBackground());
    } else {
      // 没有 ctx 时同步执行（兼容本地测试）
      await finishBackground();
    }

    return jsonResponse({ ok: true, stage: 'server' });
  }

  if (path === '/api/file' && request.method === 'GET') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const p = url.searchParams.get('path') || '';
    const structure = await getStructure(env);
    const node = getNode(structure, p);
    if (!node || node.type !== 'file') return errorResponse('文件不存在', 404);
    return jsonResponse(node);
  }

  if (path === '/api/file' && request.method === 'DELETE') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const p = url.searchParams.get('path') || '';
    const structure = await getStructure(env);
    const node = getNode(structure, p);
    if (!node) return errorResponse('不存在', 404);
    if (node.type === 'file') {
      await deleteFileStorage(node, env);
    } else {
      // 递归删除文件夹
      const paths = collectPaths(node, p);
      for (const cp of paths) {
        const child = getNode(structure, cp);
        if (child && child.type === 'file') await deleteFileStorage(child, env);
      }
    }
    deleteNode(structure, p);
    await saveStructure(env, structure);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/file/rename' && request.method === 'PUT') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const structure = await getStructure(env);
    renameNode(structure, body.path, body.newName);
    await saveStructure(env, structure);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/file/move' && request.method === 'PUT') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const structure = await getStructure(env);
    const paths = Array.isArray(body.paths) ? body.paths : [body.path];
    const targetPath = body.targetPath || '';
    const errors = [];
    for (const p of paths) {
      const res = moveNode(structure, p, targetPath);
      if (!res.ok) errors.push(`${p}: ${res.error}`);
    }
    await saveStructure(env, structure);
    if (errors.length) return errorResponse(errors.join('; '), 400);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/file/copy' && request.method === 'PUT') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const structure = await getStructure(env);
    const paths = Array.isArray(body.paths) ? body.paths : [body.path];
    const targetPath = body.targetPath || '';
    const errors = [];
    for (const p of paths) {
      const res = copyNode(structure, p, targetPath);
      if (!res.ok) errors.push(`${p}: ${res.error}`);
    }
    await saveStructure(env, structure);
    if (errors.length) return errorResponse(errors.join('; '), 400);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/files/batch' && request.method === 'DELETE') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const paths = body.paths || [];
    const structure = await getStructure(env);
    for (const p of paths) {
      const node = getNode(structure, p);
      if (!node) continue;
      if (node.type === 'file') {
        await deleteFileStorage(node, env);
      } else {
        const childPaths = collectPaths(node, p);
        for (const cp of childPaths) {
          const child = getNode(structure, cp);
          if (child && child.type === 'file') await deleteFileStorage(child, env);
        }
      }
      deleteNode(structure, p);
    }
    await saveStructure(env, structure);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/file/content' && request.method === 'PUT') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const structure = await getStructure(env);
    const node = getNode(structure, body.path);
    if (!node || node.type !== 'file') return errorResponse('文件不存在', 404);
    const content = new TextEncoder().encode(body.content || '');
    if (node.storage === 'kv') {
      await getKV(node.ssid, env).put(node.ssid, content);
    } else {
      // GitHub 文本文件编辑：当前所有文件按 chunk_0 单分片存储
      const githubPath = node.chunks === 1 ? 'chunk_0' : (node.githubPath || node.name);
      await githubUploadFile(node.ssid, githubPath, content.buffer, env, 'edit text');
    }
    node.size = content.byteLength;
    await saveStructure(env, structure);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/folder/download' && request.method === 'GET') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const p = url.searchParams.get('path') || '';
    return buildFolderZipResponse(p, env);
  }

  if (path === '/api/tasks' && request.method === 'GET') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const tasks = await getTasks(env);
    return jsonResponse(tasks);
  }

  if (path.startsWith('/api/tasks/') && request.method === 'DELETE') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const id = path.slice('/api/tasks/'.length);
    if (url.searchParams.get('cancel') === '1') {
      await cancelTask(env, id);
    } else {
      await deleteTask(env, id);
    }
    return jsonResponse({ ok: true });
  }

  if (path.startsWith('/api/share/')) {
    const id = path.slice('/api/share/'.length);
    // 通过遍历结构查找
    const structure = await getStructure(env);
    const allPaths = collectPaths(structure);
    let found = null;
    for (const p of allPaths) {
      const n = getNode(structure, p);
      if (n && n.type === 'file' && n.ssid === id) { found = { path: p, node: n }; break; }
    }
    if (!found) return errorResponse('分享文件不存在', 404);
    return jsonResponse({
      name: found.node.name,
      size: found.node.size,
      ssid: found.node.ssid,
      downloadUrl: '/download/' + found.node.ssid + '/' + encodeURIComponent(found.node.name),
      previewUrl: '/direct/' + found.node.ssid + '/' + encodeURIComponent(found.node.name)
    });
  }

  if (path === '/api/settings' && request.method === 'PUT') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    const settings = {
      primary: body.primary || '#1976d2',
      bg: body.bg || '',
      cardOpacity: body.cardOpacity != null ? body.cardOpacity : 1,
      fontFamily: body.fontFamily || 'Roboto, sans-serif'
    };
    await saveSettings(env, settings);
    return jsonResponse({ ok: true });
  }

  if (path === '/api/settings' && request.method === 'GET') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const settings = await getSettings(env);
    return jsonResponse(settings);
  }

  if (path === '/api/upload/background' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const form = await request.formData();
    const file = form.get('file');
    if (!file) return errorResponse('缺少文件');
    const buffer = await file.arrayBuffer();
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    try {
      const url = await uploadBackgroundImage(buffer, ext, env);
      return jsonResponse({ ok: true, url });
    } catch (e) {
      console.error('背景图上传失败', e);
      return errorResponse(e.message || '背景图上传失败', 500);
    }
  }

  if (path === '/api/upload/font' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const form = await request.formData();
    const file = form.get('file');
    if (!file) return errorResponse('缺少文件');
    const buffer = await file.arrayBuffer();
    const ext = (file.name.split('.').pop() || 'ttf').toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return errorResponse('仅支持 ttf/otf/woff/woff2 字体文件', 400);
    try {
      const url = await uploadFontFile(buffer, ext, env);
      return jsonResponse({ ok: true, url });
    } catch (e) {
      console.error('字体上传失败', e);
      return errorResponse(e.message || '字体上传失败', 500);
    }
  }

  if (path === '/api/clear' && request.method === 'POST') {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const body = await request.json();
    if (body.password !== env.CLOUD_PASSWORD) return errorResponse('密码错误', 403);
    const structure = await getStructure(env);
    const allPaths = collectPaths(structure);
    for (const p of allPaths) {
      const node = getNode(structure, p);
      if (node && node.type === 'file') {
        try { await deleteFileStorage(node, env); } catch (e) { console.error(e); }
      }
    }
    // 清理所有 FILE_KV 中的 key（包括 KV 小文件和分片临时 key）
    for (const kv of [env.FILE_KV_1, env.FILE_KV_2, env.FILE_KV_3, env.FILE_KV_4, env.FILE_KV_5]) {
      try {
        const list = await kv.list();
        for (const key of list.keys) {
          try { await kv.delete(key.name); } catch (e) { console.error(e); }
        }
      } catch (e) { console.error(e); }
    }
    await d1Set(env, 'file_structure', { type: 'root', name: '', children: {}, createdAt: Date.now() });
    await d1Set(env, 'tasks', []);
    await d1Set(env, 'app_settings', {});
    return jsonResponse({ ok: true });
  }

  // HTML 页面路由
  if (path === '/login') return loginPage();
  if (path === '/') {
    if (!checkPassword(request, env)) return loginPage();
    const settings = await getSettings(env);
    const themeCss = generateThemeCss(settings);
    return page('我的网盘', HOME_BODY, HOME_SCRIPT, themeCss);
  }
  if (path === '/file') {
    if (!checkPassword(request, env)) return loginPage();
    const filePath = url.searchParams.get('path') || '';
    const structure = await getStructure(env);
    const node = getNode(structure, filePath);
    if (!node || node.type !== 'file') return errorResponse('文件不存在或已删除', 404);
    const settings = await getSettings(env);
    const themeCss = generateThemeCss(settings);
    return page(node.name, fileBody(node, filePath), FILE_SCRIPT, themeCss);
  }
  if (path === '/settings') {
    if (!checkPassword(request, env)) return loginPage();
    const settings = await getSettings(env);
    settings.themeCss = generateThemeCss(settings);
    return settingsPage(settings);
  }

  // WebDAV 入口
  if (path === '/webdav' || path.startsWith('/webdav/')) {
    return handleWebDAV(request, env, path);
  }

  // 下载路由 /download/:ssid/:filename （需密码）
  if (path.startsWith('/download/')) {
    const forbid = requirePassword(request, env);
    if (forbid) return forbid;
    const parts = path.slice('/download/'.length).split('/');
    const id = parts[0];
    const filename = decodeURIComponent(parts.slice(1).join('/'));
    const structure = await getStructure(env);
    const allPaths = collectPaths(structure);
    let node = null;
    for (const p of allPaths) {
      const n = getNode(structure, p);
      if (n && n.type === 'file' && n.ssid === id) { node = n; break; }
    }
    if (!node) return errorResponse('文件不存在', 404);
    return buildDownloadResponse(node, filename || node.name, env, false);
  }

  // 直链 /direct/:ssid/:filename （无需密码）
  if (path.startsWith('/direct/')) {
    const parts = path.slice('/direct/'.length).split('/');
    const id = parts[0];
    const filename = decodeURIComponent(parts.slice(1).join('/'));
    const structure = await getStructure(env);
    const allPaths = collectPaths(structure);
    let node = null;
    for (const p of allPaths) {
      const n = getNode(structure, p);
      if (n && n.type === 'file' && n.ssid === id) { node = n; break; }
    }
    if (!node) return errorResponse('文件不存在', 404);
    return buildDownloadResponse(node, filename || node.name, env, true);
  }

  // 分享页 /share/:ssid （无需密码）
  if (path.startsWith('/share/')) {
    const id = path.slice('/share/'.length);
    const structure = await getStructure(env);
    const allPaths = collectPaths(structure);
    let found = null;
    for (const p of allPaths) {
      const n = getNode(structure, p);
      if (n && n.type === 'file' && n.ssid === id) { found = { path: p, node: n }; break; }
    }
    if (!found) return errorResponse('分享文件不存在', 404);
    return sharePage(found.node);
  }

  return errorResponse('Not Found', 404);
}

// ==================== 入口 ====================

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      console.error(e);
      return errorResponse(e.message || 'Internal Error', 500);
    }
  }
};
