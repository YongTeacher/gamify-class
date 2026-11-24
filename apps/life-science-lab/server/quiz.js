const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const parse = (value) => JSON.parse(value || '[]');
const clean = (value) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase('ko');
const quizRow = (row, teacher = false) => row && ({ id:row.id, title:row.title, status:row.status,
  questions:parse(row.questions).map((q) => teacher ? q : {id:q.id,type:q.type,prompt:q.prompt,points:q.points}),
  updatedAt:row.updatedAt });
const attemptRow = (row, teacher = false) => row && ({ id:row.id, quizId:row.quizId, studentId:teacher ? row.studentId : undefined,
  answers:parse(row.answers), status:row.status, version:row.version, updatedAt:row.updatedAt,
  grading:teacher || row.status === 'graded' ? parse(row.grading) : undefined });
const question = (raw) => {
  const type=String(raw.type||'');
  if (!['ox','short','essay'].includes(type)) fail(400,'문항 유형을 선택하세요.');
  const prompt=String(raw.prompt||'').trim();
  const points=Number(raw.points);
  if (!prompt || prompt.length>1000 || !Number.isInteger(points) || points<1 || points>100) fail(400,'문항과 1~100점 배점을 확인하세요.');
  const accepted=type==='essay' ? [] : String(raw.accepted||'').split(/\n|,/).map((s)=>s.trim()).filter(Boolean).slice(0,20);
  if (type!=='essay' && !accepted.length) fail(400,'O/X·단답형의 정답을 입력하세요.');
  if (type==='ox' && accepted.some((s)=>!['O','X'].includes(s.toUpperCase()))) fail(400,'O/X 정답은 O 또는 X로 입력하세요.');
  const rubric=String(raw.rubric||'').trim().slice(0,3000);
  if (type==='essay' && !rubric) fail(400,'서술형 채점 기준을 입력하세요.');
  return {id:String(raw.id||crypto.randomUUID()),type,prompt,points,accepted,rubric};
};
async function getQuiz(db,id,groupId) {
  const row=await db.prepare('SELECT * FROM LabQuizzes WHERE id = ? AND groupId = ?').bind(id,groupId).first();
  if(!row) fail(404,'퀴즈를 찾을 수 없습니다.');
  return row;
}
async function getAttempt(db,quizId,user) {
  return db.prepare('SELECT * FROM LabQuizAttempts WHERE quizId = ? AND groupId = ? AND studentId = ?').bind(quizId,user.groupId,user.id).first();
}
export async function handleQuiz(action,p,user,env) {
  if(!env.LAB_DB) fail(503,'퀴즈 저장소가 연결되지 않았습니다.');
  const db=env.LAB_DB, groupId=String(user.groupId||'legacy'), teacher=user.role==='teacher';
  if(groupId!=='legacy') {
    const stored=await db.prepare('SELECT data FROM Settings WHERE id=?').bind('group:'+groupId).first();
    const group=stored ? JSON.parse(stored.data).value : null;
    if(!group) fail(401,'연구 그룹을 다시 선택해 로그인하세요.');
    if(teacher && !user.owner && user.groupVersion!==group.authVersion) fail(401,'그룹 암호가 변경되었습니다. 다시 로그인하세요.');
  }
  if(!teacher) {
    const stored=await db.prepare('SELECT data FROM Students WHERE id=?').bind(user.id).first();
    const student=stored && JSON.parse(stored.data);
    if(!student || student.groupId!==groupId && !(groupId==='legacy'&&!student.groupId) || student.active===false || student.authVersion!==user.authVersion) fail(401,'학생 계정으로 다시 로그인하세요.');
  }
  if(action==='quiz.list') {
    const {results}=await db.prepare('SELECT * FROM LabQuizzes WHERE groupId = ? ORDER BY createdAt DESC').bind(groupId).all();
    return {quizzes:results.filter((r)=>teacher||r.status!=='hidden').map((r)=>quizRow(r,teacher))};
  }
  if(action==='quiz.attempt') {
    if(teacher) fail(403,'학생 전용 요청입니다.');
    const quiz=await getQuiz(db,String(p.quizId||''),groupId);
    if(quiz.status==='hidden') fail(403,'현재 응시할 수 없는 퀴즈입니다.');
    return {quiz:quizRow(quiz),attempt:attemptRow(await getAttempt(db,quiz.id,user))};
  }
  if(action==='quiz.save' || action==='quiz.submit') {
    if(teacher) fail(403,'학생 전용 요청입니다.');
    const quiz=await getQuiz(db,String(p.quizId||''),groupId);
    if(quiz.status!=='open') fail(403,'현재 응시할 수 없는 퀴즈입니다.');
    const existing=await getAttempt(db,quiz.id,user);
    if(existing && existing.status!=='draft') fail(409,'이미 제출한 퀴즈입니다.');
    if(existing && Number(p.version)!==existing.version) fail(409,'다른 화면에서 답안이 변경됐습니다. 다시 불러오세요.');
    const questions=parse(quiz.questions), input=p.answers && typeof p.answers==='object' ? p.answers : {};
    const answers=Object.fromEntries(questions.map((q)=>[q.id,String(input[q.id]||'').slice(0,4000)]));
    const submit=action==='quiz.submit';
    const grading=submit ? Object.fromEntries(questions.map((q)=>[q.id,q.type==='essay'
      ? {score:null,source:'teacher-pending',feedback:''}
      : {score:q.accepted.some((v)=>clean(v)===clean(answers[q.id])) ? q.points : 0,source:'automatic',feedback:''}])) : {};
    const now=new Date().toISOString(), id=existing?.id||crypto.randomUUID();
    if(existing) {
      const result=await db.prepare('UPDATE LabQuizAttempts SET answers=?,grading=?,status=?,version=version+1,updatedAt=? WHERE id=? AND version=? AND status=?').bind(JSON.stringify(answers),JSON.stringify(grading),submit?'submitted':'draft',now,id,existing.version,'draft').run();
      if(!result.meta.changes) fail(409,'답안이 변경됐습니다. 다시 불러오세요.');
    } else {
      await db.prepare('INSERT INTO LabQuizAttempts (id,quizId,groupId,studentId,answers,grading,status,version,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,quiz.id,groupId,user.id,JSON.stringify(answers),JSON.stringify(grading),submit?'submitted':'draft',1,now,now).run();
    }
    return {id,version:(existing?.version||0)+1,status:submit?'submitted':'draft'};
  }
  if(!teacher) fail(403,'교사 전용 요청입니다.');
  if(action==='quiz.create') {
    const title=String(p.title||'').trim();
    const questions=Array.isArray(p.questions) ? p.questions.map(question) : [];
    if(!title || title.length>120 || !questions.length || questions.length>50) fail(400,'제목과 1~50개 문항을 확인하세요.');
    const id=crypto.randomUUID(),now=new Date().toISOString();
    await db.prepare('INSERT INTO LabQuizzes (id,groupId,title,status,questions,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)').bind(id,groupId,title,'hidden',JSON.stringify(questions),now,now).run();
    return {id};
  }
  if(action==='quiz.status') {
    const quiz=await getQuiz(db,String(p.id||''),groupId);
    if(!['hidden','open','closed'].includes(p.status)) fail(400,'운영 상태를 확인하세요.');
    await db.prepare('UPDATE LabQuizzes SET status=?,updatedAt=? WHERE id=? AND groupId=?').bind(p.status,new Date().toISOString(),quiz.id,groupId).run();
    return {ok:true};
  }
  if(action==='quiz.results') {
    const quiz=await getQuiz(db,String(p.id||''),groupId);
    const {results}=await db.prepare('SELECT a.*,s.data AS studentData FROM LabQuizAttempts a LEFT JOIN Students s ON s.id=a.studentId WHERE a.quizId=? AND a.groupId=? ORDER BY a.updatedAt DESC').bind(quiz.id,groupId).all();
    return {quiz:quizRow(quiz,true),attempts:results.map((r)=>({...attemptRow(r,true),student:JSON.parse(r.studentData||'{}').name||r.studentId}))};
  }
  if(action==='quiz.grade') {
    const row=await db.prepare('SELECT a.* FROM LabQuizAttempts a JOIN LabQuizzes q ON q.id=a.quizId WHERE a.id=? AND a.groupId=? AND q.groupId=?').bind(String(p.id||''),groupId,groupId).first();
    if(!row || row.status==='draft') fail(404,'제출한 답안을 찾을 수 없습니다.');
    if(row.version!==Number(p.version)) fail(409,'답안이 변경됐습니다. 다시 불러오세요.');
    const quiz=await getQuiz(db,row.quizId,groupId), current=parse(row.grading), scores=p.scores||{};
    for(const q of parse(quiz.questions)) {
      const value=Number(scores[q.id]);
      if(!Number.isFinite(value)||value<0||value>q.points) fail(400,'각 문항의 점수를 0점부터 배점 사이로 입력하세요.');
      current[q.id]={score:value,source:'teacher',feedback:String(p.feedback?.[q.id]||'').slice(0,2000)};
    }
    const result=await db.prepare('UPDATE LabQuizAttempts SET grading=?,status=?,version=version+1,updatedAt=? WHERE id=? AND version=?').bind(JSON.stringify(current),'graded',new Date().toISOString(),row.id,row.version).run();
    if(!result.meta.changes) fail(409,'채점 결과가 변경됐습니다. 다시 불러오세요.');
    return {ok:true};
  }
  fail(404,'지원하지 않는 퀴즈 요청입니다.');
}
