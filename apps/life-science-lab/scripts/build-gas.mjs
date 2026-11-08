import { copyFile } from 'node:fs/promises';
await copyFile(new URL('../domain.js', import.meta.url), new URL('../google-apps-script/Domain.gs', import.meta.url));
await copyFile(new URL('../seed.js', import.meta.url), new URL('../google-apps-script/Seed.gs', import.meta.url));
console.log('Apps Script용 Domain.gs / Seed.gs 생성 완료');
