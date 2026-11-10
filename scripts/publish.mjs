// Uses the existing Git Credential Manager login; never writes or prints a token.
import { execFileSync } from 'node:child_process';
const owner='MaximilianBoller', repo='share';
let result;
try { result=execFileSync('git',['-c','credential.interactive=never','credential','fill'],{
  input:`protocol=https\nhost=github.com\nusername=${owner}\n\n`,encoding:'utf8',
  env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'},stdio:['pipe','pipe','pipe']
}); } catch {
  console.error('Bitte zuerst im Git Credential Manager als MaximilianBoller anmelden. Danach npm run publish:github erneut ausführen.');
  process.exit(1);
}
const credential=Object.fromEntries(result.trim().split(/\r?\n/).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
if (!credential.password) throw Error('Bitte zuerst mit MaximilianBoller im Git Credential Manager anmelden.');
async function api(path,method='GET',body) {
  const response=await fetch('https://api.github.com'+path,{method,headers:{Authorization:`Bearer ${credential.password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok) throw Object.assign(Error(`GitHub ${response.status}: ${(await response.json()).message}`),{status:response.status});
  return response.status===204?null:response.json();
}
const user=await api('/user');
if(user.login.toLowerCase()!==owner.toLowerCase()) throw Error(`Abbruch: Angemeldet ist ${user.login}, erwartet wird ${owner}.`);
console.log(`GitHub-Anmeldung bestätigt: ${user.login}`);
execFileSync('git',['-c',`credential.username=${owner}`,'push','-u','origin','main'],{stdio:'inherit',env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'}});
try {
  await api(`/repos/${owner}/${repo}/pages`);
  await api(`/repos/${owner}/${repo}/pages`,'PUT',{build_type:'workflow'});
} catch(error) {
  if(error.status!==404) throw error;
  await api(`/repos/${owner}/${repo}/pages`,'POST',{build_type:'workflow'});
}
await api(`/repos/${owner}/${repo}/actions/workflows/pages.yml/dispatches`,'POST',{ref:'main'});
console.log('GitHub Pages eingerichtet und Veröffentlichung gestartet.');
console.log(`Fortschritt: https://github.com/${owner}/${repo}/actions`);
console.log(`Nach erfolgreichem Workflow: https://${owner.toLowerCase()}.github.io/${repo}/`);
