import { mkdir,copyFile,writeFile } from 'node:fs/promises';
const app=new URL('../',import.meta.url),staging=new URL('.qa/gas-project/',app);
await mkdir(staging,{recursive:true});
for(const name of ['Code.gs','Domain.gs','Seed.gs'])await copyFile(new URL('google-apps-script/'+name,app),new URL(name,staging));
await writeFile(new URL('appsscript.json',staging),JSON.stringify({
  timeZone:'Asia/Seoul',exceptionLogging:'STACKDRIVER',runtimeVersion:'V8',
  oauthScopes:['https://www.googleapis.com/auth/spreadsheets'],
  webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}
},null,2));
console.log('Google 로그인 후 사용할 전용 Apps Script 업로드 폴더: .qa/gas-project/');
