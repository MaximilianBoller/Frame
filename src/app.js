import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js';
import { GitHub, escapeHtml as h, formatSize, filePath, mediaUrl, validateFiles, validateManifest } from './core.js';
const $ = s => document.querySelector(s);
const config = window.PORTAL_CONFIG || {};
const configured = !!(config.owner && config.repo);
let github = null, projects = [], current = null, filter = 'all', search = '', busy = false;
let lightboxIndex = 0, toastTimer;
const previews = new Map();
const app = $('#app'), modal = $('#modal'), lightbox = $('#lightbox');
const demoProjects = [
  { id:'demo-nord',title:'Zwischen den Hügeln',description:'Landschaft, Licht und ein bisschen Fernweh.',created_at:'2026-11-08T12:00:00Z',art:'landscape',files:[] },
  { id:'demo-studio',title:'Studio Objects',description:'Klare Formen. Natürliche Materialien. Neue Perspektiven.',created_at:'2026-11-06T12:00:00Z',art:'studio',files:[] },
  { id:'demo-motion',title:'Form & Bewegung',description:'Eine kleine Studie in Farbe und Bewegung.',created_at:'2026-11-03T12:00:00Z',art:'abstract',files:[] }
];
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 6000); }
function date(value) { return new Date(value).toLocaleDateString('de-DE', { day:'2-digit',month:'short',year:'numeric' }); }
function total(files) { return files.reduce((n, f) => n + f.size, 0); }
function isDemo(p) { return p.id.startsWith('demo-'); }
function source(file) { return previews.get(file.id) || mediaUrl(file.path); }
function art(name) { return `<div class="art ${h(name)}" aria-label="Illustrative Projektvorschau"></div>`; }
function cover(p) {
  if (p.art) return art(p.art);
  const f = p.files.find(f => f.type.startsWith('image/')) || p.files[0];
  if (!f) return art('abstract');
  return f.type.startsWith('video/') ? `<video src="${h(source(f))}#t=0.1" muted preload="metadata" playsinline></video>` : `<img src="${h(source(f))}" alt="" loading="lazy">`;
}
function showDialog(html) { $('#modal-body').innerHTML = html; if (!modal.open) modal.showModal(); bindClose(); }
function bindClose() { modal.querySelectorAll('[data-close]').forEach(b => b.onclick = () => modal.close()); }
function shareLink(p) { const url = new URL(location.href); url.hash = `project=${p.id}`; return url.href; }
async function clipboard(value) {
  try { await navigator.clipboard.writeText(value); toast('Link kopiert. Bereit zum Teilen.'); }
  catch { showDialog(`<h2>Projektlink</h2><p>Markiere und kopiere diesen Link:</p><div class="link-output">${h(value)}</div><div class="dialog-actions"><button data-close class="button">Schließen</button></div>`); }
}
function render() {
  const id = new URLSearchParams(location.hash.slice(1)).get('project');
  current = projects.find(p => p.id === id) || (!configured ? demoProjects.find(p => p.id === id) : null);
  $('#settings').textContent = github ? 'Verwaltung ✓' : 'Verwalten ↗';
  if (id && !current) { app.innerHTML = `<main class="shell"><a class="breadcrumb" href="#">← Zur Übersicht</a><div class="empty"><h1>Projekt nicht gefunden.</h1><p>Der Link ist ungültig oder das Projekt wurde entfernt.</p></div></main>`; return; }
  if (current) renderProject(); else renderHome();
}
function renderHome() {
  const list = configured ? projects : demoProjects;
  const files = projects.flatMap(p => p.files);
  app.innerHTML = `<main class="shell"><div class="intro"><div><div class="eyebrow">Dein kreativer Raum</div><h1>Alles bereit.<br>Zum Weitergeben.</h1><p>Deine Bilder und Videos, gesammelt in Projekten.<br>Ein Link. Alle Dateien. Einfach geteilt.</p></div><div class="intro-actions"><button id="new-project" class="button dark"><span>＋</span> Neues Projekt</button></div></div>
    ${!configured ? `<div class="setup-banner"><div><strong>Dein neuer Projektraum ist bereit.</strong><p>Du siehst eine Designvorschau. Verbinde dein GitHub-Repository, um eigene Projekte hochzuladen.</p></div><button id="setup" class="button ghost">Einrichtung ansehen ↗</button></div>` : ''}
    <div class="summary"><span><strong>${projects.length.toString().padStart(2,'0')}</strong> Projekte</span><span><strong>${files.length.toString().padStart(2,'0')}</strong> Dateien</span><span><strong>${formatSize(total(files))}</strong> Originaldateien</span></div>
    <div class="toolbar"><h2>${configured ? 'Deine Projekte' : 'So sehen deine Projekte aus'} <span class="tag">${configured ? 'ÜBERSICHT' : 'VORSCHAU'}</span></h2><input id="project-search" class="search" type="search" placeholder="Projekt suchen …" aria-label="Projekt suchen" value="${h(search)}"></div><div class="project-grid" id="projects"></div>
    ${!configured ? '<p class="demo-note">Die drei Beispielcover sind Illustrationen. Es wurden noch keine Dateien hochgeladen.</p>' : ''}</main>`;
  function cards() {
    const shown = list.filter(p => (p.title + ' ' + p.description).toLowerCase().includes(search.toLowerCase()));
    $('#projects').innerHTML = shown.map((p, i) => `<a href="#project=${h(p.id)}" class="project-card"><div class="cover">${cover(p)}<span class="cover-badge">${isDemo(p) ? 'BEISPIELPROJEKT' : p.files.some(f => f.type.startsWith('video/')) ? 'BILDER & VIDEOS' : 'BILDER'}</span><span class="cover-num">FRAME / ${String(i + 1).padStart(2,'0')}</span></div><div class="project-info"><h2>${h(p.title)}</h2><p>${h(p.description || 'Alle Dateien für dein Projekt.')}</p><div class="card-bottom"><span>${p.files.length} Dateien · ${date(p.created_at)}</span><span class="arrow">↗</span></div></div></a>`).join('') || '<div class="empty"><h2>Noch ganz viel Platz.</h2><p>Erstelle dein erstes Projekt und lade Bilder oder Videos hoch.</p></div>';
  }
  cards(); $('#project-search').oninput = e => { search = e.target.value; cards(); };
  $('#new-project').onclick = () => github ? createProject() : settings();
  if ($('#setup')) $('#setup').onclick = settings;
}
function renderProject() {
  const p = current, demo = isDemo(p);
  const images = p.files.filter(f => f.type.startsWith('image/')).length;
  app.innerHTML = `<main class="shell"><div class="breadcrumb"><a href="#">Projekte</a><span>/</span><span>${h(p.title)}</span></div>
    ${!demo ? `<div class="admin-strip"><span>${github ? 'Verwaltungsmodus · Änderungen werden direkt auf GitHub gespeichert.' : 'Zum Bearbeiten und Löschen bitte die Verwaltung öffnen.'}</span><div class="admin-actions">${github ? '<button id="edit-project" class="button ghost small">Projekt bearbeiten</button><button id="delete-project" class="button ghost small">Projekt entfernen</button>' : '<button id="open-management" class="button ghost small">Verwaltung öffnen ↗</button>'}</div></div>` : ''}
    <section class="project-hero"><div><div class="eyebrow">${demo ? 'Beispielprojekt' : 'Deine Projektdateien'}</div><h1>${h(p.title)}</h1><p>${h(p.description || 'Hier findest du alle Bilder und Videos in Originalqualität.')}</p></div><div class="intro-actions"><button id="share" class="button ghost">↗ Link teilen</button><button id="download-all" class="button" ${!p.files.length ? 'disabled' : ''}>↓ Alles herunterladen</button></div></section>
    <div class="project-meta"><span>${p.files.length} Dateien</span><span>${images} Bilder · ${p.files.length - images} Videos</span><span>${formatSize(total(p.files))} gesamt</span><span>Erstellt am ${date(p.created_at)}</span><span>Originalqualität</span></div>
    ${github && !demo ? `<label class="dropzone" id="dropzone" tabindex="0"><strong>↑ Bilder & Videos hinzufügen</strong><span class="dropzone-help">Dateien hier ablegen oder auswählen · bis 90 MiB pro Datei</span><input id="file-input" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/x-m4v" class="visually-hidden"></label>` : ''}
    <div id="operation-status" hidden class="upload-status" role="status" aria-live="polite"></div><div class="toolbar"><div class="tabs"><button class="tab ${filter==='all'?'active':''}" data-filter="all">Alle Dateien <span>${p.files.length}</span></button><button class="tab ${filter==='image'?'active':''}" data-filter="image">Bilder</button><button class="tab ${filter==='video'?'active':''}" data-filter="video">Videos</button></div><input id="file-search" class="search" type="search" placeholder="Datei suchen …" aria-label="Datei suchen" value="${h(search)}"></div><div id="files" class="file-grid"></div>
    ${demo ? '<div class="empty"><h2>Hier kommt deine Arbeit hin.</h2><p>Nach der Einrichtung erscheinen hier deine Bilder und Videos mit Vorschau und Download.</p><button id="demo-setup" class="button">GitHub verbinden ↗</button></div>' : ''}</main>`;
  renderFiles();
  $('[data-filter="'+filter+'"]').classList.add('active');
  app.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter=b.dataset.filter; app.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === b)); renderFiles(); });
  $('#file-search').oninput = e => { search=e.target.value; renderFiles(); };
  $('#share').onclick = () => demo ? toast('Beispielprojekte dienen nur der Vorschau.') : clipboard(shareLink(p));
  $('#download-all').onclick = downloadAll;
  if ($('#demo-setup')) $('#demo-setup').onclick = settings;
  if ($('#edit-project')) $('#edit-project').onclick = () => createProject(p);
  if ($('#open-management')) $('#open-management').onclick = settings;
  if ($('#delete-project')) $('#delete-project').onclick = () => confirmDeleteProject(p);
  const drop = $('#dropzone');
  if (drop) {
    $('#file-input').onchange = e => uploadFiles([...e.target.files]);
    drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-input').click(); } };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); uploadFiles([...e.dataTransfer.files]); };
  }
}
function renderFiles() {
  const files = current.files.filter(f => (filter === 'all' || f.type.startsWith(filter + '/')) && f.name.toLowerCase().includes(search.toLowerCase()));
  $('#files').innerHTML = files.map(f => `<article class="file-card"><button class="file-preview" data-preview="${h(f.id)}" aria-label="${h(f.name)} ansehen">${f.type.startsWith('image/') ? `<img src="${h(source(f))}" alt="${h(f.name)}" loading="lazy">` : `<video src="${h(source(f))}#t=0.1" preload="metadata" muted playsinline></video><span class="play">▶</span>`}<span class="file-kind">${f.type.startsWith('image/')?'BILD':'VIDEO'}</span></button><div class="file-info"><div><div class="file-name" title="${h(f.name)}">${h(f.name)}</div><div class="file-size">${formatSize(f.size)} · ORIGINAL</div></div><div class="file-actions"><button class="icon-button" data-download="${h(f.id)}" aria-label="${h(f.name)} herunterladen">↓</button>${github ? `<button class="file-delete" data-delete="${h(f.id)}" title="Datei aus dem Projekt entfernen" aria-label="${h(f.name)} entfernen">Entfernen</button>` : ''}</div></div></article>`).join('') || (!isDemo(current) ? '<div class="empty"><h2>Keine Dateien gefunden.</h2><p>Hier erscheinen die Bilder und Videos dieses Projekts.</p></div>' : '');
  app.querySelectorAll('[data-preview]').forEach(b => b.onclick = () => openPreview(current.files.findIndex(f => f.id === b.dataset.preview)));
  app.querySelectorAll('[data-download]').forEach(b => b.onclick = () => downloadOne(current.files.find(f => f.id === b.dataset.download)));
  app.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => confirmDeleteFile(current.files.find(f => f.id === b.dataset.delete)));
}
function settings() {
  if (busy) return toast('Bitte warte, bis der aktuelle Vorgang abgeschlossen ist.');
  showDialog(`<div class="eyebrow">Dein Projektraum</div><h2 class="dialog-title">${github ? 'Mit GitHub verbunden.' : 'Projekte verwalten.'}</h2>${configured ? `<p>Repository: <strong>${h(config.owner)}/${h(config.repo)}</strong></p><p>Zum Hochladen meldest du dich mit einem GitHub-Zugangsschlüssel an. Besucher brauchen keine Anmeldung.</p>${github ? '<p>Dein Schlüssel bleibt nur für diese geöffnete Seite gespeichert.</p><div class="dialog-actions"><button data-close class="button ghost">Schließen</button><button id="logout" class="button dark">Abmelden</button></div>' : `<form id="login-form"><label class="field">GitHub-Zugangsschlüssel<input id="token" type="password" autocomplete="off" placeholder="github_pat_…" required></label><p class="hint">Fine-grained Personal Access Token → nur dieses Repository → Contents: Read and write. Dein Schlüssel wird nur an api.github.com gesendet und nicht dauerhaft gespeichert.</p><p id="login-error" class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close class="button ghost">Abbrechen</button><button type="submit" class="button dark">Verbinden ↗</button></div></form>`}` : '<p>Trage in <code>public/config.js</code> deinen GitHub-Benutzernamen und Repository-Namen ein. Die vollständige Schritt-für-Schritt-Anleitung liegt in der README.</p><p class="hint">Website und hochgeladene Dateien sind öffentlich. Der Projektlink ist eine praktische Adresse, kein Passwort.</p><div class="dialog-actions"><button data-close class="button">Verstanden</button></div>'}`);
  if ($('#logout')) $('#logout').onclick = () => { github=null; modal.close(); render(); toast('Abgemeldet.'); };
  if ($('#login-form')) {
    const help=document.createElement('a');help.href='https://github.com/settings/personal-access-tokens/new';help.target='_blank';help.rel='noopener noreferrer';help.className='token-help';help.textContent='GitHub-Zugangsschlüssel erstellen ↗';$('#login-form').insertBefore(help,$('#login-error'));
  }
  if ($('#login-form')) $('#login-form').onsubmit = async e => {
    e.preventDefault(); const button=e.submitter; button.disabled=true;
    try {
      const client = new GitHub(config, $('#token').value.trim());
      await client.verify(); const snapshot = await client.read();
      github=client; projects=snapshot.data.projects; modal.close(); render(); toast('Verbunden. Du kannst jetzt Projekte verwalten.');
    } catch (error) { $('#login-error').textContent=error.message; } finally { button.disabled=false; }
  };
}
function createProject(existing = null) {
  if (busy) return;
  showDialog(`<h2>${existing ? 'Projekt bearbeiten.' : 'Platz für dein nächstes Projekt.'}</h2><p>${existing ? 'Passe Name und Beschreibung an. Dein Projektlink bleibt gleich.' : 'Gib deinem Projekt einen Namen. Die Dateien fügst du im nächsten Schritt hinzu.'}</p><form id="project-form"><label class="field">Projektname<input id="title" maxlength="100" value="${h(existing?.title || '')}" placeholder="z. B. Sommerkollektion 2026" required></label><label class="field">Beschreibung <span class="hint">Optional</span><textarea id="description" maxlength="1000" placeholder="Ein paar Worte zu deinem Projekt …">${h(existing?.description || '')}</textarea></label><p class="hint">Das Projekt und seine Dateien werden öffentlich auf GitHub gespeichert.</p><p id="form-error" class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close class="button ghost">Abbrechen</button><button type="submit" class="button dark">${existing ? 'Änderungen speichern' : 'Projekt erstellen ↗'}</button></div></form>`);
  $('#project-form').onsubmit = async e => {
    e.preventDefault(); if (busy) return; busy=true; e.submitter.disabled=true;
    const p={id:existing?.id || crypto.randomUUID(),title:$('#title').value.trim(),description:$('#description').value.trim(),created_at:new Date().toISOString(),files:[]};
    if (!p.title) { busy=false; e.submitter.disabled=false; return; }
    try {
      const s=await github.read();
      if (existing) {
        const target=s.data.projects.find(x => x.id === existing.id);
        if (!target) throw Error('Das Projekt wurde inzwischen entfernt.');
        target.title=p.title; target.description=p.description;
      } else s.data.projects.unshift(p);
      await github.commit(s,s.data,[],`${existing ? 'Projekt bearbeitet' : 'Projekt erstellt'}: ${p.title}`); projects=s.data.projects;
      modal.close(); location.hash=`project=${p.id}`; render(); toast(`${existing ? 'Änderungen gespeichert.' : 'Projekt erstellt.'} GitHub veröffentlicht die Änderung in wenigen Minuten.`);
    } catch (error) { $('#form-error').textContent=error.message; } finally { busy=false; e.submitter.disabled=false; }
  };
}
function status(message, percent) {
  const el=$('#operation-status'); if (!el) return;
  el.hidden=false; el.innerHTML=`<span>${h(message)}</span>${percent === undefined ? '' : `<progress max="100" value="${percent}"></progress>`}`;
}
async function uploadFiles(files) {
  if (!github || busy || !files.length) return;
  try { validateFiles(files, projects); } catch (e) { return toast(e.message); }
  busy=true; const p=current;
  try {
    const s=await github.read(), target=s.data.projects.find(x => x.id === p.id);
    if (!target) throw Error('Das Projekt wurde inzwischen entfernt.');
    validateFiles(files,s.data.projects);
    const entries=[], added=[];
    for (const [index,file] of files.entries()) {
      status(`${index+1} / ${files.length} · ${file.name} wird hochgeladen …`, index / files.length * 90);
      const id=crypto.randomUUID(), path=filePath(p.id,id,file.name);
      const sha=await github.blob(new Uint8Array(await file.arrayBuffer()));
      entries.push({path,mode:'100644',type:'blob',sha});
      added.push({id,name:file.name,type:file.type,size:file.size,path,created_at:new Date().toISOString()});
    }
    status('Alle Dateien werden gemeinsam veröffentlicht …',95);
    target.files.push(...added);
    await github.commit(s,s.data,entries,`${files.length} Dateien zu ${p.title} hinzugefügt`);
    files.forEach((file,i) => previews.set(added[i].id,URL.createObjectURL(file)));
    projects=s.data.projects; render();
    status('Upload gespeichert. Die Download-Links sind nach dem GitHub-Pages-Deployment verfügbar (meist 1–3 Minuten).',100);
    toast('Upload abgeschlossen. GitHub veröffentlicht deine Dateien.');
  } catch (error) { status(error.message); toast(error.message); }
  finally { busy=false; }
}
function confirmDeleteFile(file) {
  if (busy) return;
  const projectId=current.id;
  confirmAction('Datei entfernen?', `„${file.name}“ wird aus dem Projekt entfernt. Frühere Versionen können in der Git-Historie weiterhin öffentlich abrufbar sein.`, async () => {
    const s=await github.read(), p=s.data.projects.find(x => x.id === projectId);
    if (!p) throw Error('Projekt nicht mehr vorhanden.');
    p.files=p.files.filter(f => f.id !== file.id);
    await github.commit(s,s.data,[{path:file.path,mode:'100644',type:'blob',sha:null}],`Datei entfernt: ${file.name}`); projects=s.data.projects;
    if (previews.has(file.id)) { URL.revokeObjectURL(previews.get(file.id)); previews.delete(file.id); }
    render(); toast('Datei entfernt. Die Website wird aktualisiert.');
  });
}
function confirmDeleteProject(project) {
  if (busy) return;
  confirmAction('Projekt entfernen?',`„${project.title}“ und alle zugehörigen Dateien werden aus der aktuellen Website entfernt. Frühere Versionen bleiben in der öffentlichen Git-Historie.`,async () => {
    const s=await github.read(), p=s.data.projects.find(x => x.id === project.id);
    if (!p) throw Error('Projekt nicht mehr vorhanden.');
    s.data.projects=s.data.projects.filter(x => x.id !== p.id);
    await github.commit(s,s.data,p.files.map(f => ({path:f.path,mode:'100644',type:'blob',sha:null})),`Projekt entfernt: ${p.title}`);
    for (const f of p.files) if (previews.has(f.id)) { URL.revokeObjectURL(previews.get(f.id)); previews.delete(f.id); }
    projects=s.data.projects; location.hash=''; render(); toast('Projekt entfernt. Die Website wird aktualisiert.');
  });
}
function confirmAction(title,message,action) {
  showDialog(`<h2>${h(title)}</h2><p>${h(message)}</p><p id="action-error" class="error" role="alert"></p><div class="dialog-actions"><button data-close class="button ghost">Abbrechen</button><button id="confirm-action" class="button danger">Entfernen</button></div>`);
  $('#confirm-action').onclick=async e => { busy=true; e.target.disabled=true; try { await action(); modal.close(); } catch (error) { $('#action-error').textContent=error.message; } finally { busy=false; e.target.disabled=false; } };
}
function openPreview(index) {
  lightboxIndex=(index+current.files.length)%current.files.length;
  const f=current.files[lightboxIndex];
  $('#lightbox-content').innerHTML=f.type.startsWith('video/') ? `<video src="${h(source(f))}" controls autoplay playsinline></video>` : `<img src="${h(source(f))}" alt="${h(f.name)}">`;
  $('#lightbox-caption').innerHTML=`<span>${h(f.name)} <span class="hint">· ${lightboxIndex+1} / ${current.files.length}</span></span><button id="preview-download" class="button">↓ Original herunterladen</button>`;
  $('#preview-download').onclick=() => downloadOne(f);
  $('#previous').disabled=$('#next').disabled=current.files.length<2;
  if (!lightbox.open) lightbox.showModal();
}
function saveBlob(blob,name) {
  const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(() => URL.revokeObjectURL(url),60000);
}
async function downloadOne(file) {
  try {
    const response=await fetch(source(file));
    if (!response.ok) throw Error('Die Datei ist noch nicht veröffentlicht oder wurde entfernt. Bitte in wenigen Minuten erneut versuchen.');
    saveBlob(await response.blob(),file.name); toast('Download gestartet.');
  } catch (error) { toast(error.message); }
}
async function downloadAll() {
  if (busy || !current.files.length) return;
  const p=current, name=p.title.replace(/[\\/:*?"<>|]/g,'_')+'.zip';
  let output, writer;
  try {
    // Request the picker while the click still has user activation.
    if (total(p.files)>200*1024**2 && 'showSaveFilePicker' in window) {
      const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'ZIP-Archiv',accept:{'application/zip':['.zip']}}]});
      output=await handle.createWritable();
    } else if (total(p.files)>400*1024**2) {
      return toast('Für dieses große ZIP bitte Chrome oder Edge am Computer verwenden. Einzel-Downloads funktionieren auch hier.');
    }
    busy=true; $('#download-all').disabled=true;
    writer=new ZipWriter(output || new BlobWriter('application/zip'),{useWebWorkers:false,level:0});
    const used=new Set();
    for (const [i,f] of p.files.entries()) {
      status(`ZIP wird erstellt · ${i+1} / ${p.files.length} · ${f.name}`,i / p.files.length*100);
      const response=await fetch(source(f));
      if (!response.ok) throw Error('Eine Datei ist noch nicht veröffentlicht. Bitte nach dem GitHub-Deployment erneut versuchen.');
      let entry=f.name.replace(/[\\/\x00-\x1f]/g,'_'); if (used.has(entry)) entry=f.id.slice(0,8)+'_'+entry; used.add(entry);
      await writer.add(entry,new BlobReader(await response.blob()),{lastModDate:new Date(f.created_at)});
    }
    const blob=await writer.close(); if (!output) saveBlob(blob,name);
    status('Dein ZIP-Archiv ist bereit.',100); toast('Alle Dateien als ZIP heruntergeladen.');
  } catch (error) {
    if (output) try { await output.abort(); } catch {}
    if (error.name!=='AbortError') { status(error.message); toast(error.message); }
  } finally { busy=false; if ($('#download-all')) $('#download-all').disabled=!current?.files.length; }
}
$('#settings').onclick=settings;
$('#lightbox-close').onclick=() => lightbox.close();
$('#previous').onclick=() => openPreview(lightboxIndex-1);
$('#next').onclick=() => openPreview(lightboxIndex+1);
lightbox.addEventListener('close',() => { $('#lightbox-content').innerHTML=''; });
document.addEventListener('keydown',e => { if (lightbox.open && !['INPUT','TEXTAREA'].includes(e.target.tagName)) { if (e.key==='ArrowLeft') openPreview(lightboxIndex-1); if (e.key==='ArrowRight') openPreview(lightboxIndex+1); } });
window.addEventListener('hashchange',() => { if (lightbox.open) lightbox.close(); search='';filter='all';render(); });
window.addEventListener('beforeunload',e => { if (busy) {e.preventDefault();e.returnValue='';} });
async function init() {
  if (configured) {
    try {
      const res=await fetch('./data/projects.json',{cache:'no-store'});
      if (!res.ok) throw Error('Projektverzeichnis konnte nicht geladen werden.');
      projects=validateManifest(await res.json()).projects;
    } catch (error) { app.innerHTML=`<main class="shell"><div class="empty"><h1>Gerade nicht erreichbar.</h1><p>${h(error.message)}</p><button class="button" id="retry">Erneut laden</button></div></main>`;$('#retry').onclick=() => location.reload();return; }
  }
  render();
}
init();
