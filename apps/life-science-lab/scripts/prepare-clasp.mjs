import { mkdir,copyFile,writeFile,readFile } from 'node:fs/promises';
import { randomHex } from '../server/auth.js';
const app=new URL('../',import.meta.url),staging=new URL('.qa/gas-project/',app);
await mkdir(staging,{recursive:true});
for(const name of ['Code.gs','Domain.gs','Seed.gs','Views.gs'])await copyFile(new URL('google-apps-script/'+name,app),new URL(name,staging));
await writeFile(new URL('appsscript.json',staging),JSON.stringify({
  timeZone:'Asia/Seoul',exceptionLogging:'STACKDRIVER',runtimeVersion:'V8',
  oauthScopes:['https://www.googleapis.com/auth/spreadsheets'],
  webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}
},null,2));
const configFile = new URL('.qa/operator-config.json',app);
const config = JSON.parse(await readFile(configFile,'utf8'));
if(!config.LAB_SHEETS_SECRET) {
  config.LAB_SHEETS_SECRET = randomHex(32);
  await writeFile(configFile,JSON.stringify(config),{mode:0o600});
}
await writeFile(new URL('Bootstrap.gs',staging),
  'function labBootstrapConfig_() { return '+JSON.stringify({spreadsheetId:'10YZYoEJhYknsCvi00dLonO2Qoo6p31RHP_59AOk3xyA',secret:config.LAB_SHEETS_SECRET})+'; }\n',
  {mode:0o600});
console.log('Google 로그인 후 사용할 전용 Apps Script 업로드 폴더: .qa/gas-project/');
