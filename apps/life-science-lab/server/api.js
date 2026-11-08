import { passwordHash, verifyPassword, signSession, readSession, hmac } from './auth.js';
import { sheetsRepository } from './repository.js';
const STUDENT = new Set(['myReports','report.open','report.save','report.submit']);
const ADMIN = new Set(['groups.create','groups.update','students.list','students.import','student.update','assessments.list','assessment.save','reports.list','review','publications.list','publication.generate','publication.save','publication.publish','publication.hide']);
const PUBLIC = new Set(['groups.list','bootstrap','archive']);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
});
export async function handle(request, env, injectedRepository) {
  try {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/health')) {
      return json({ configured: !!(env.LAB_SHEETS_URL && env.LAB_SHEETS_SECRET && env.LAB_SESSION_SECRET && env.LAB_ADMIN_HASH) });
    }
    if (request.method !== 'POST') return json({ error: 'POST 요청이 필요합니다.' }, 405);
    if (request.headers.get('Origin') !== url.origin) return json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, 415);
    const raw = await request.text();
    if (raw.length > 120000) return json({ error: '요청이 너무 큽니다.' }, 413);
    const { action, payload = {} } = JSON.parse(raw);
    const repo = injectedRepository || sheetsRepository(env);
    if (PUBLIC.has(action)) return json({ result: await repo.execute(action, payload) });
    if (!env.LAB_SESSION_SECRET || !env.LAB_ADMIN_HASH) return json({ error: '교사 인증 설정을 준비 중입니다.' }, 503);
    const cookie = (token, age = 28800) => 'lab_session=' + token + '; HttpOnly; SameSite=Strict; Path=/api/lab; Max-Age=' + age + (url.protocol === 'https:' ? '; Secure' : '');
    if (action === 'logout') return json({ result: true }, 200, { 'Set-Cookie': cookie('', 0) });
    if (action === 'login') {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const groupId=String(payload.groupId || 'legacy');
      const identity = groupId+':' + (payload.role === 'teacher' ? 'teacher' : [payload.year, payload.grade, payload.classNo, payload.number].join(':'));
      await repo.execute('auth.rate', { key: await hmac(env.LAB_SESSION_SECRET, 'ip:' + ip), limit: 100 }, { role: 'system' });
      await repo.execute('auth.rate', { key: await hmac(env.LAB_SESSION_SECRET, identity), limit: 10 }, { role: 'system' });
      const password = String(payload.password || '').slice(0, 128);
      let user;
      if (payload.role === 'teacher') {
        const group = groupId==='legacy' ? null : await repo.execute('auth.group',{groupId},{role:'system'});
        const hash=groupId==='legacy' ? env.LAB_ADMIN_HASH : (group?.passwordHash || '0'.repeat(32)+':'+ '0'.repeat(64));
        if (await verifyPassword(password, hash) && (groupId==='legacy' || group)) user = { role: 'teacher',groupId,owner:groupId==='legacy',groupVersion:group?.authVersion || 1 };
      } else {
        const s = await repo.execute('auth.lookup', payload, { role: 'system' });
        // Constant-cost password derivation even when a roster entry doesn't exist.
        const stored = s?.passwordHash || '00000000000000000000000000000000:' + '0'.repeat(64);
        if (await verifyPassword(password, stored) && s) user = { role: 'student', groupId, id: s.id, authVersion: s.authVersion };
      }
      if (!user) return json({ error: '등록 정보 또는 접속 코드가 일치하지 않습니다.' }, 401);
      return json({ result: await repo.execute('me', {}, user) }, 200, { 'Set-Cookie': cookie(await signSession(user, env.LAB_SESSION_SECRET)) });
    }
    const user = await readSession(request, env.LAB_SESSION_SECRET);
    if (!user) return json({ error: '로그인해 주세요.' }, 401);
    if (action === 'me') return json({ result: await repo.execute('me', {}, user) });
    if(action==='groups.enter') {
      const group=await repo.execute(action,payload,user);
      const next={role:'teacher',owner:true,groupId:group.id};
      return json({result:await repo.execute('me',{},next)},200,{'Set-Cookie':cookie(await signSession(next,env.LAB_SESSION_SECRET))});
    }
    if (!STUDENT.has(action) && !ADMIN.has(action)) return json({ error: '지원하지 않는 요청입니다.' }, 404);
    if ((ADMIN.has(action) && user.role !== 'teacher') || (STUDENT.has(action) && user.role !== 'student')) return json({ error: '접근 권한이 없습니다.' }, 403);
    if(action==='groups.create' || action==='groups.update') {
      delete payload.passwordHash;
      if(payload.password){
        if(typeof payload.password!=='string' || payload.password.length<8 || payload.password.length>128) return json({error:'그룹 교사 암호는 8~128자로 지정하세요.'},400);
        payload.passwordHash=await passwordHash(payload.password);
      }
      delete payload.password;
    }
    if (action === 'students.import') {
      if (!Array.isArray(payload.students) || payload.students.length > 100) return json({ error: '1~100명씩 등록하세요.' }, 400);
      const rows = [];
      for (const student of payload.students) {
        const password = String(student.password || '');
        if (password && (password.length < 8 || password.length > 128)) return json({ error: '학생 접속 코드는 8~128자로 지정하세요.' }, 400);
        const { password: ignored, passwordHash: untrusted, ...info } = student;
        rows.push({ ...info, ...(password ? { passwordHash: await passwordHash(password) } : {}) });
      }
      payload.students = rows;
    }
    if (action === 'student.update') {
      delete payload.passwordHash;
      if (payload.password) {
        if (payload.password.length < 8 || payload.password.length > 128) return json({ error: '접속 코드는 8~128자로 지정하세요.' }, 400);
        payload.passwordHash = await passwordHash(payload.password);
      }
      delete payload.password;
    }
    return json({ result: await repo.execute(action, payload, user) });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 502);
    return json({ error: error.status ? error.message : '요청을 처리하지 못했습니다. 저장 상태를 확인하고 다시 시도하세요.' }, status);
  }
}
