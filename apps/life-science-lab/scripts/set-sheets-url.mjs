import { readFile,writeFile } from 'node:fs/promises';
const url = new URL(process.argv[2]);
if(url.origin!=='https://script.google.com' || !/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname))throw new Error('Invalid Apps Script web app URL');
const file=new URL('../.qa/operator-config.json',import.meta.url);
const config=JSON.parse(await readFile(file,'utf8'));
config.LAB_SHEETS_URL=url.toString();
await writeFile(file,JSON.stringify(config),{mode:0o600});
console.log('로컬 비공개 설정에 Apps Script 운영 URL을 저장했습니다.');
