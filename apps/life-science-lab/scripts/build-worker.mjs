import { mkdir, copyFile } from 'node:fs/promises';
const app = new URL('../',import.meta.url);
for (const file of ['index.html','styles.css','app.js','autosave.js','seed.js','vendor/xlsx.full.min.js']) {
  const target = new URL('dist/'+file,app);
  await mkdir(new URL('./',target),{recursive:true});
  await copyFile(new URL(file,app),target);
}
const fonts = new URL('dist/fonts/',app);
await mkdir(fonts,{recursive:true});
await copyFile(new URL('../../fonts/PretendardVariable.woff2',app),new URL('PretendardVariable.woff2',fonts));
console.log('Worker용 공개 화면·글꼴만 dist/에 준비했습니다.');
