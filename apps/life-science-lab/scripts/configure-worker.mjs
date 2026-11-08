// Generate first-use operator credentials locally and send encrypted secrets via stdin.
// Never print credentials, tokens, or the secret payload.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { passwordHash, randomHex } from '../server/auth.js';
const app=new URL('../',import.meta.url), configFile=new URL('.qa/operator-config.json',app);
await mkdir(new URL('.qa/',app),{recursive:true});
let values;
try{values=JSON.parse(await readFile(configFile,'utf8'));}
catch(e){
  if(e.code!=='ENOENT')throw e;
  const password=randomHex(16);
  values={LAB_ADMIN_HASH:await passwordHash(password),LAB_SESSION_SECRET:randomHex(32)};
  await writeFile(configFile,JSON.stringify(values),{mode:0o600,flag:'wx'});
  await writeFile(new URL('.qa/operator-access.txt',app),'연구소 교사 관리자 최초 비밀번호\n'+password+'\n운영 주소: https://life-science-lab.bsy0708.workers.dev/#teacher\n이 파일은 Git에서 제외됩니다. 본인 암호 관리 도구로 옮긴 뒤 안전하게 관리하세요.\n',{mode:0o600,flag:'wx'});
}
const root=new URL('../../',app);
const cli=fileURLToPath(new URL('apps/class-manitto/node_modules/wrangler/bin/wrangler.js',root));
const child=spawn(process.execPath,[cli,'secret','bulk','--config',fileURLToPath(new URL('wrangler.jsonc',app))],{cwd:fileURLToPath(app),stdio:['pipe','inherit','inherit']});
child.stdin.end(JSON.stringify(values));
const code=await new Promise((resolve)=>child.on('exit',resolve));
if(code!==0)process.exit(code||1);
console.log('관리자 해시와 세션키를 암호화된 Worker 비밀 변수로 설정했습니다.');
console.log('관리자 최초 비밀번호는 이 컴퓨터의 .qa/operator-access.txt 에만 보관했습니다.');
