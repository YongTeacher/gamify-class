import { passwordHash, randomHex } from '../server/auth.js';
// Read through stdin; never place a real password in command arguments or Git.
let password = '';
process.stdin.setEncoding('utf8');
if (process.stdin.isTTY) {
  process.stdout.write('관리자 비밀번호 (12자 이상, 입력은 표시되지 않습니다): ');
  process.stdin.setRawMode(true);
  password = await new Promise((resolve) => {
    const onData = (chunk) => {
      if (chunk.includes('\u0003')) process.exit(130);
      if (/[\r\n]/.test(chunk)) { process.stdin.setRawMode(false); process.stdin.off('data',onData); process.stdin.pause(); process.stdout.write('\n'); resolve(password); }
      else if (chunk === '\u007f' || chunk === '\b') password = password.slice(0,-1);
      else password += chunk;
    };
    process.stdin.on('data',onData);
  });
} else {
  for await (const chunk of process.stdin) password += chunk;
}
password = password.trim();
if (password.length < 12) throw new Error('관리자 비밀번호는 12자 이상이어야 합니다.');
console.log('LAB_ADMIN_HASH=' + await passwordHash(password));
console.log('LAB_SESSION_SECRET=' + randomHex(32));
