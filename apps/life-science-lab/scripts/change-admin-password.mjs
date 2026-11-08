// Read the password from hidden input/stdin; never pass it as a shell argument.
import { readFile,writeFile } from 'node:fs/promises';
import { passwordHash } from '../server/auth.js';
let password='';
process.stdin.setEncoding('utf8');
if(process.stdin.isTTY){
  process.stdout.write('새 관리자 비밀번호 (8자 이상, 입력은 표시되지 않습니다): ');
  process.stdin.setRawMode(true);
  password=await new Promise((resolve)=>{
    const onData=(chunk)=>{
      for(const character of chunk){
        if(character==='\u0003')process.exit(130);
        if(character==='\r'||character==='\n'){process.stdin.setRawMode(false);process.stdin.off('data',onData);process.stdin.pause();process.stdout.write('\n');resolve(password);return;}
        if(character==='\u007f'||character==='\b')password=password.slice(0,-1);
        else password+=character;
      }
    };
    process.stdin.on('data',onData);
  });
}else{
  for await(const chunk of process.stdin)password+=chunk;
  password=password.replace(/\r?\n$/,'');
}
if(password.length<8||password.length>128)throw new Error('8~128자로 입력하세요.');
const file=new URL('../.qa/operator-config.json',import.meta.url);
const values=JSON.parse(await readFile(file,'utf8'));
values.LAB_ADMIN_HASH=await passwordHash(password);
await writeFile(file,JSON.stringify(values),{mode:0o600});
await writeFile(new URL('../.qa/operator-access.txt',import.meta.url),'연구소 교사 관리자 비밀번호\n'+password+'\n운영 주소: https://life-science-lab.bsy0708.workers.dev/#teacher\n이 파일은 Git에서 제외됩니다.\n',{mode:0o600});
console.log('로컬 관리자 해시를 변경했습니다. configure-worker.mjs로 운영에 반영하세요.');
