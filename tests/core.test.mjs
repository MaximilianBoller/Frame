import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHub, base64, decodeJson, escapeHtml, validateFiles, validateManifest, MAX_FILE, MAX_TOTAL } from '../src/core.js';
import { ZipWriter, BlobWriter, BlobReader, ZipReader } from '@zip.js/zip.js';
test('Unicode manifests survive GitHub base64 and HTML is escaped',()=>{
  const data={title:'Für schöne Bilder 🎬'};
  assert.deepEqual(decodeJson(base64(new TextEncoder().encode(JSON.stringify(data)))),data);
  assert.equal(escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
});
test('uploads enforce file types, individual size and total storage',()=>{
  assert.doesNotThrow(()=>validateFiles([{name:'Film.mp4',type:'video/mp4',size:MAX_FILE}],[]));
  assert.throws(()=>validateFiles([{name:'Film.mp4',type:'video/mp4',size:MAX_FILE+1}],[]), /90 MiB/);
  assert.throws(()=>validateFiles([{name:'Bild.svg',type:'image/svg+xml',size:10}],[]), /Bitte JPG/);
  assert.throws(()=>validateFiles([{name:'Bild.jpg',type:'image/jpeg',size:20}],[{files:[{size:MAX_TOTAL}]}]), /voll/);
});
test('manifest rejects external paths and script MIME types',()=>{
  const data={version:1,projects:[{id:'p',title:'Projekt',files:[{id:'f',path:'public/media/p/f.jpg',type:'image/jpeg',size:10,name:'a.jpg'}]}]};
  assert.equal(validateManifest(data),data);
  data.projects[0].files[0].path='https://evil.example/tracker';
  assert.throws(()=>validateManifest(data),/Ungültige Datei/);
});
test('a publish uses one manifest/tree/commit and a non-force ref update',async()=>{
  const calls=[];
  const client=new GitHub({owner:'MaximilianBoller',repo:'Frame',branch:'main'},'test-token',async(url,options)=>{
    calls.push({url,...options,body:JSON.parse(options.body)});
    return Response.json({sha:'new-sha'});
  });
  await client.commit({head:'old-head',tree:'old-tree'},{version:1,projects:[]},[{path:'public/media/p/f.jpg',mode:'100644',type:'blob',sha:'file-sha'}],'Upload');
  assert.equal(calls.length,4);
  assert.equal(calls[1].body.base_tree,'old-tree');
  assert.equal(calls[1].body.tree.length,2);
  assert.deepEqual(calls[2].body.parents,['old-head']);
  assert.deepEqual(calls[3].body,{sha:'new-sha',force:false});
  assert.ok(calls.every(c=>c.url.startsWith('https://api.github.com/')));
});
test('concurrent updates are reported without overwriting the branch',async()=>{
  const client=new GitHub({owner:'MaximilianBoller',repo:'Frame'},'token',async()=>Response.json({message:'Update is not a fast forward'},{status:422}));
  await assert.rejects(client.request('/git/refs/heads/main',{method:'PATCH'}),/zwischenzeitlich geändert/);
});
test('real ZIP roundtrip preserves original bytes and Unicode filenames',async()=>{
  const bytes=Uint8Array.from([0,1,255,42,10,0]);
  const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false,level:0});
  await writer.add('Grüße 🎬.mp4',new BlobReader(new Blob([bytes])));
  await writer.add('Bild.jpg',new BlobReader(new Blob(['original'])));
  const blob=await writer.close();
  const reader=new ZipReader(new BlobReader(blob),{useWebWorkers:false});
  const entries=await reader.getEntries();
  assert.equal(entries.length,2);assert.equal(entries[0].filename,'Grüße 🎬.mp4');
  assert.deepEqual(new Uint8Array(await (await entries[0].getData(new BlobWriter())).arrayBuffer()),bytes);
  await reader.close();
});
