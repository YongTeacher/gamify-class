/* Storage-independent rules, executed under an Apps Script storage lock.
   Node tests execute this exact source. */
globalThis.LabDomain = (() => {
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
  const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
  const num = (v, min, max) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) fail(400, '숫자 입력 범위를 확인해 주세요.');
    return n;
  };
  const teacher = (actor) => { if (actor.role !== 'teacher') fail(403, '교사 권한이 필요합니다.'); };
  const find = (db, table, id) => db.all(table).find((r) => r.id === id);
  function learner(db, actor) {
    if (actor.role !== 'student') fail(403, '학생으로 로그인해 주세요.');
    const s = find(db, 'Students', actor.id);
    if (!s || !s.active || s.authVersion !== actor.authVersion) fail(401, '로그인이 만료되었습니다.');
    return s;
  }
  const publicStudent = (s) => ({ id: s.id, year: s.year, grade: s.grade, classNo: s.classNo, number: s.number, name: s.name, active: s.active });
  function assessment(db, id) {
    const a = find(db, 'Assessments', id);
    if (!a) fail(404, '탐구 활동을 찾을 수 없습니다.');
    return { ...a, fields: db.all('AssessmentFields').filter((f) => f.assessmentId === id).sort((a, b) => a.order - b.order) };
  }
  function canWrite(a, now) {
    if (a.status !== 'open') fail(409, '현재 작성할 수 없는 탐구입니다.');
    if (a.startAt && a.startAt > now) fail(409, '아직 탐구 시작 전입니다.');
    if (a.deadline && a.deadline < now) fail(409, '제출 마감일이 지났습니다. 선생님께 문의하세요.');
  }
  function fieldSet(fields) {
    if (!Array.isArray(fields) || fields.length < 1 || fields.length > 20) fail(400, '탐구 항목은 1~20개로 구성해 주세요.');
    const ids = new Set();
    return fields.map((f, i) => {
      const id = text(f.id, 50);
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id) || !text(f.title)) fail(400, '항목 ID는 서로 다른 영문·숫자여야 하며 항목명이 필요합니다.');
      ids.add(id);
      return { id, title: text(f.title, 100), guide: text(f.guide, 1500), type: f.type === 'references' ? 'references' : 'text', required: !!f.required, order: i };
    });
  }
  function answers(fields, input, submit) {
    const result = {};
    for (const f of fields) {
      const v = input?.[f.id];
      if (f.type === 'references') {
        result[f.id] = (Array.isArray(v) ? v : []).slice(0, 20).map((r) => ({
          title: text(r.title, 300), author: text(r.author, 200), source: text(r.source, 800)
        })).filter((r) => r.title || r.author || r.source);
        if (submit && f.required && (!result[f.id].length || result[f.id].some((r) => !r.title || !r.author || !r.source))) {
          fail(400, f.title + ': 자료 제목, 저자·기관, URL·서지 정보를 모두 입력하세요.');
        }
      } else {
        result[f.id] = text(v, 6000);
        if (submit && f.required && !result[f.id]) fail(400, f.title + ' 항목을 작성해 주세요.');
      }
    }
    if (JSON.stringify(result).length > 32000) fail(400, '보고서 전체를 32,000자 이하로 작성해 주세요.');
    return result;
  }
  const ownReport = (db, actor, id) => {
    const s = learner(db, actor);
    const r = find(db, 'Reports', id);
    if (!r || r.studentId !== s.id) fail(404, '보고서를 찾을 수 없습니다.');
    return r;
  };
  const latestReview = (db, id) => db.all('Reviews').filter((v) => v.reportId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.sequence - a.sequence)[0] || null;
  function publicWork(p) {
    return { id: p.id, category: p.category, year: p.year, publishedAt: p.publishedAt, version: p.publishedVersion, ...copy(p.published) };
  }
  function exhibition(content, fields) {
    const sections = fields.map((f) => ({
      id: f.id, title: f.title, body: f.type === 'references'
        ? (content[f.id] || []).map((r) => r.title + ' · ' + r.author + '\n' + r.source).join('\n\n')
        : String(content[f.id] || '')
    }));
    return { title: '나의 생명과학 탐구', displayName: '익명의 연구자', summary: '', sections };
  }
  function execute(db, action, p = {}, actor = {}, ctx) {
    const { now, uuid } = ctx;
    if (action === 'bootstrap') {
      return { assessments: db.all('Assessments').filter((a) => a.status !== 'hidden').map((a) => assessment(db, a.id)) };
    }
    if (action === 'archive') {
      return { works: db.all('Publications').filter((v) => v.visible && v.published).map(publicWork).sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)) };
    }
    if (action === 'auth.lookup') {
      if (actor.role !== 'system') fail(403, '인증 경로 오류');
      return db.all('Students').find((s) => s.active && s.year === Number(p.year) && s.grade === Number(p.grade)
        && s.classNo === Number(p.classNo) && s.number === Number(p.number) && s.name === text(p.name)) || null;
    }
    if (action === 'auth.rate') {
      if (actor.role !== 'system') fail(403, '인증 경로 오류');
      const id = 'rate:' + p.key, old = find(db, 'Settings', id);
      const reset = !old || old.expiresAt <= now;
      const value = reset ? 1 : Number(old.value) + 1;
      if (value > (p.limit || 10)) fail(429, '로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.');
      db.put('Settings', { id, value, expiresAt: reset ? new Date(Date.parse(now) + 900000).toISOString() : old.expiresAt });
      return { ok: true };
    }
    if (action === 'me') {
      if (actor.role === 'teacher') return { role: 'teacher', name: '교사 관리자' };
      return { role: 'student', ...publicStudent(learner(db, actor)) };
    }
    if (action === 'myReports') {
      const s = learner(db, actor);
      return { reports: db.all('Reports').filter((r) => r.studentId === s.id).map((r) => ({ ...r, review: latestReview(db, r.id) })) };
    }
    if (action === 'report.open') {
      const s = learner(db, actor);
      const existing = db.all('Reports').find((r) => r.studentId === s.id && r.assessmentId === p.assessmentId);
      if (existing) return { ...existing, review: latestReview(db, existing.id) };
      const a = assessment(db, p.assessmentId);
      canWrite(a, now);
      if (a.year !== s.year) fail(403, '학년도에 맞는 탐구를 선택해 주세요.');
      const r = { id: uuid(), studentId: s.id, assessmentId: a.id, title: a.title, fields: a.fields, content: {}, status: 'draft', version: 0, createdAt: now, updatedAt: now, submittedAt: '' };
      db.put('Reports', r); return r;
    }
    if (action === 'report.save' || action === 'report.submit') {
      const r = ownReport(db, actor, p.id);
      if (!['draft', 'revision'].includes(r.status)) fail(409, '제출된 보고서는 보완 요청 후에만 수정할 수 있습니다.');
      canWrite(assessment(db, r.assessmentId), now);
      if (Number(p.version) !== r.version) fail(409, '다른 창에서 내용이 변경되었습니다. 복구본을 내려받고 최신 보고서를 다시 불러오세요.');
      const submit = action === 'report.submit';
      const content = answers(r.fields, p.content, submit);
      const next = { ...r, content, version: r.version + 1, updatedAt: now, status: submit ? 'submitted' : r.status, submittedAt: submit ? now : r.submittedAt };
      db.put('Reports', next); return next;
    }
    teacher(actor);
    if (action === 'students.list') return { students: db.all('Students').map(publicStudent) };
    if (action === 'students.import') {
      if (!Array.isArray(p.students) || !p.students.length || p.students.length > 100) fail(400, '한 번에 1~100명씩 등록하세요.');
      const all = db.all('Students'), keys = new Set();
      const rows = p.students.map((v) => {
        const s = { year: num(v.year, 2020, 2100), grade: num(v.grade, 1, 12), classNo: num(v.classNo, 1, 100), number: num(v.number, 1, 999), name: text(v.name, 40) };
        const key = [s.year, s.grade, s.classNo, s.number].join(':');
        if (!s.name || keys.has(key)) fail(400, '이름 누락 또는 명단 내 중복 학번을 확인하세요.');
        keys.add(key);
        const old = all.find((v) => [v.year,v.grade,v.classNo,v.number].join(':') === key);
        if (old && old.name !== s.name) fail(409, '이미 등록된 학번의 이름이 다릅니다. 기존 학생을 먼저 확인하세요.');
        if (!old && !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(v.passwordHash || '')) fail(400, '접속 코드가 필요합니다.');
        return old || { ...s, id: uuid(), passwordHash: v.passwordHash, authVersion: 1, active: true, createdAt: now };
      });
      rows.forEach((s) => db.put('Students', s)); return { count: rows.length };
    }
    if (action === 'student.update') {
      const s = find(db, 'Students', p.id);
      if (!s) fail(404, '학생을 찾을 수 없습니다.');
      if (p.passwordHash && !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(p.passwordHash)) fail(400, '접속 코드 오류');
      db.put('Students', { ...s, active: p.active === undefined ? s.active : !!p.active, passwordHash: p.passwordHash || s.passwordHash, authVersion: s.authVersion + 1 });
      return { ok: true };
    }
    if (action === 'assessments.list') return { assessments: db.all('Assessments').map((a) => assessment(db, a.id)) };
    if (action === 'assessment.save') {
      const id = p.id || uuid();
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) fail(400, '탐구 ID 형식을 확인하세요.');
      const old = find(db, 'Assessments', id);
      const fields = fieldSet(p.fields);
      for (const k of ['startAt', 'deadline']) if (p[k] && !Number.isFinite(Date.parse(p[k]))) fail(400, '날짜 형식을 확인하세요.');
      if (p.startAt && p.deadline && p.startAt >= p.deadline) fail(400, '시작일은 마감일보다 빨라야 합니다.');
      const a = { id, title: text(p.title, 120), subject: text(p.subject, 80), category: text(p.category, 80), year: num(p.year, 2020, 2100),
        description: text(p.description, 1000), guide: text(p.guide, 6000), startAt: p.startAt ? new Date(p.startAt).toISOString() : '',
        deadline: p.deadline ? new Date(p.deadline).toISOString() : '', status: ['open','closed','hidden'].includes(p.status) ? p.status : 'hidden', version: (old?.version || 0) + 1 };
      if (!a.title || !a.category) fail(400, '탐구 제목과 분야를 입력하세요.');
      if (old && Number(p.version) !== old.version) fail(409, '탐구 설정이 변경됐습니다. 새로고침하세요.');
      db.replaceFields(id, fields.map((f) => ({ ...f, assessmentId: id })));
      db.put('Assessments', a); return { ...a, fields };
    }
    if (action === 'reports.list') {
      const students = db.all('Students');
      return { reports: db.all('Reports').map((r) => ({ ...r, student: publicStudent(students.find((s) => s.id === r.studentId)), review: latestReview(db, r.id) })) };
    }
    if (action === 'review') {
      const r = find(db, 'Reports', p.id);
      if (!r || r.status !== 'submitted') fail(409, '검토 대기 중인 보고서를 선택하세요.');
      if (Number(p.version) !== r.version) fail(409, '보고서가 변경되었습니다. 새로고침하세요.');
      if (!['approved', 'revision', 'rejected'].includes(p.status)) fail(400, '검토 상태를 확인하세요.');
      if (p.status !== 'approved' && !text(p.feedback)) fail(400, '학생에게 전달할 피드백을 입력하세요.');
      const reviews = db.all('Reviews');
      const review = { id: uuid(), reportId: r.id, status: p.status, feedback: text(p.feedback, 4000), reviewer: '교사 관리자', createdAt: now, sequence: reviews.length + 1, reportVersion: r.version };
      db.put('Reviews', review);
      db.put('Reports', { ...r, status: p.status, version: r.version + 1, updatedAt: now }); return { ok: true };
    }
    if (action === 'publications.list') return { publications: db.all('Publications') };
    if (action === 'publication.generate') {
      const r = find(db, 'Reports', p.id);
      if (!r || r.status !== 'approved') fail(409, '승인된 보고서만 전시본을 만들 수 있습니다.');
      const old = db.all('Publications').find((v) => v.reportId === r.id);
      if (old) return old;
      const a = assessment(db, r.assessmentId);
      const pub = { id: uuid(), reportId: r.id, category: a.category, year: a.year, draft: { ...exhibition(r.content, r.fields), title: r.title }, version: 1,
        visible: false, published: null, publishedVersion: 0, publishedAt: '', createdAt: now };
      db.put('Publications', pub); return pub;
    }
    if (['publication.save', 'publication.publish', 'publication.hide'].includes(action)) {
      const pub = find(db, 'Publications', p.id);
      if (!pub) fail(404, '전시본을 찾을 수 없습니다.');
      if (Number(p.version) !== pub.version) fail(409, '전시본이 변경되었습니다. 새로고침하세요.');
      if (action === 'publication.hide') {
        const next = { ...pub, visible: false, version: pub.version + 1 };
        db.put('Publications', next); return next;
      }
      const r = find(db, 'Reports', pub.reportId);
      if (!r || r.status !== 'approved') fail(409, '보고서 승인이 필요합니다.');
      if (action === 'publication.save') {
        if (!Array.isArray(p.content?.sections) || p.content.sections.length > 20) fail(400, '전시 항목 오류');
        const draft = { title: text(p.content.title, 120), summary: text(p.content.summary, 1200), displayName: text(p.content.displayName, 40) || '익명의 연구자',
          sections: p.content.sections.map((s, i) => ({ id: String(i), title: text(s.title, 100), body: text(s.body, 6000) })) };
        if (!draft.title || JSON.stringify(draft).length > 40000) fail(400, '제목과 전시본 길이를 확인하세요.');
        const next = { ...pub, draft, version: pub.version + 1 };
        db.put('Publications', next); return next;
      }
      if (p.consent !== true) fail(400, '개인정보·공개 동의 확인이 필요합니다.');
      const next = { ...pub, published: copy(pub.draft), visible: true, version: pub.version + 1, publishedVersion: pub.publishedVersion + 1, publishedAt: now };
      db.put('PublicationVersions', { id: uuid(), publicationId: pub.id, version: next.publishedVersion, content: copy(pub.draft), createdAt: now });
      db.put('Publications', next); return next;
    }
    fail(404, '지원하지 않는 요청입니다.');
  }
  return { execute, fieldSet, answers };
})();
