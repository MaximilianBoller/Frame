export const MAX_FILE = 90 * 1024 ** 2;
export const MAX_TOTAL = 850 * 1024 ** 2;
export const TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime','video/x-m4v']);
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
export function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(0)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(2)} GB`;
}
export function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export function decodeJson(value) { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)))); }
export function filePath(projectId, fileId, name) {
  const ext = String(name).split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  return `public/media/${projectId}/${fileId}.${ext}`;
}
export function mediaUrl(path) {
  if (!/^public\/media\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.[a-z0-9]{1,8}$/.test(path)) throw Error('Ungültiger Dateipfad.');
  return new URL('./' + path.slice(7), document.baseURI).href;
}
export function validateFiles(files, projects) {
  let total = projects.flatMap(p => p.files).reduce((n, f) => n + f.size, 0);
  for (const file of files) {
    if (!TYPES.has(file.type)) throw Error(`${file.name}: Bitte JPG, PNG, WebP, AVIF, GIF, MP4, MOV oder WebM verwenden.`);
    if (!file.size || file.size > MAX_FILE) throw Error(`${file.name}: Maximal 90 MiB pro Datei. Größere Videos bitte vorher komprimieren.`);
    total += file.size;
  }
  if (total > MAX_TOTAL) throw Error('Der Website-Speicher ist voll (850 MiB). Bitte Dateien oder Projekte entfernen.');
}
export function validateManifest(data) {
  if (data?.version !== 1 || !Array.isArray(data.projects)) throw Error('Das Projektverzeichnis hat ein ungültiges Format.');
  for (const p of data.projects) {
    if (!/^[a-zA-Z0-9-]+$/.test(p.id) || typeof p.title !== 'string' || !Array.isArray(p.files)) throw Error('Ungültiges Projekt.');
    for (const f of p.files) {
      if (!/^[a-zA-Z0-9-]+$/.test(f.id) || !f.path?.startsWith(`public/media/${p.id}/`) || !/^public\/media\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.[a-z0-9]{1,8}$/.test(f.path) || !TYPES.has(f.type) || !Number.isSafeInteger(f.size) || f.size <= 0 || typeof f.name !== 'string') throw Error('Ungültige Datei im Projektverzeichnis.');
    }
  }
  return data;
}
export class GitHub {
  constructor(config, token, fetcher = fetch) {
    if (!/^[a-zA-Z0-9-]+$/.test(config.owner) || !/^[a-zA-Z0-9_.-]+$/.test(config.repo)) throw Error('Bitte GitHub-Benutzer und Repository in config.js eintragen.');
    this.config = config; this.token = token; this.fetcher = fetcher.bind(globalThis);
    this.root = `https://api.github.com/repos/${config.owner}/${config.repo}`;
  }
  async request(path, options = {}) {
    const res = await this.fetcher(this.root + path, { ...options, headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...options.headers } });
    if (!res.ok) {
      let msg = ''; try { msg = (await res.json()).message || ''; } catch {}
      if (res.status === 401) throw Error('Der GitHub-Zugangsschlüssel ist ungültig oder abgelaufen.');
      if (res.status === 403 || res.status === 429) throw Error('GitHub verweigert den Zugriff. Bitte Token-Rechte und API-Limit prüfen. ' + msg);
      if (res.status === 409 || res.status === 422) throw Error('Das Repository wurde zwischenzeitlich geändert. Bitte neu laden und erneut versuchen. ' + msg);
      throw Object.assign(Error(`GitHub (${res.status}): ${msg || 'Anfrage fehlgeschlagen.'}`), { status: res.status });
    }
    return res.status === 204 ? null : res.json();
  }
  async verify() {
    const repo = await this.request('');
    if (repo.private) throw Error('Bitte ein öffentliches Repository verwenden. Diese Website teilt öffentliche Dateien.');
    if (!repo.permissions?.push) throw Error('Dieser Zugangsschlüssel hat keinen Schreibzugriff auf das Repository.');
    return repo;
  }
  async read() {
    const ref = await this.request(`/git/ref/heads/${encodeURIComponent(this.config.branch || 'main')}`);
    const head = ref.object.sha;
    const commit = await this.request(`/git/commits/${head}`);
    const content = await this.request(`/contents/public/data/projects.json?ref=${head}`, { headers: { Accept:'application/vnd.github.raw+json' } });
    return { head, tree: commit.tree.sha, data: validateManifest(content) };
  }
  async blob(bytes) { return (await this.request('/git/blobs', { method:'POST', body:JSON.stringify({ content: base64(bytes), encoding:'base64' }) })).sha; }
  // Publish data and file changes in one commit. A concurrent branch change is never overwritten.
  async commit(snapshot, data, entries, message) {
    validateManifest(data);
    const manifestSha = await this.blob(new TextEncoder().encode(JSON.stringify(data, null, 2) + '\n'));
    const tree = await this.request('/git/trees', { method:'POST', body:JSON.stringify({ base_tree:snapshot.tree, tree:[...entries, { path:'public/data/projects.json', mode:'100644', type:'blob', sha:manifestSha }] }) });
    const commit = await this.request('/git/commits', { method:'POST', body:JSON.stringify({ message, tree:tree.sha, parents:[snapshot.head] }) });
    await this.request(`/git/refs/heads/${encodeURIComponent(this.config.branch || 'main')}`, { method:'PATCH', body:JSON.stringify({ sha:commit.sha, force:false }) });
    return commit.sha;
  }
}
