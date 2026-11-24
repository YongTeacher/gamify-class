const heading='<div class="page-heading"><span class="eyebrow">RESEARCH QUIZ</span><h1>퀴즈</h1><p>탐구에서 배운 내용을 확인하세요.</p></div>';
const qType={ox:'O/X',short:'단답형',essay:'서술형'};
export async function renderQuiz({main,api,user,esc}) {
  if(!user){main.innerHTML=heading+'<section class="panel"><h2>로그인이 필요합니다</h2><p>학생 또는 교사로 로그인하면 현재 연구 그룹의 퀴즈를 볼 수 있습니다.</p><a class="button primary" href="#lab">로그인</a></section>';return;}
  let current=null,quiz=null,attempt=null,results=null;
  const message=(value)=>{const el=main.querySelector('#quiz-message');if(el)el.textContent=value;};
  async function list(){
    const data=await api('quiz.list');
    main.innerHTML=heading+'<p id="quiz-message" role="status"></p>'+(user.role==='teacher' ?
      '<section class="panel stack"><h2>새 퀴즈 만들기</h2><form id="quiz-create" class="stack"><label>퀴즈 제목<input name="title" maxlength="120" required></label><div id="quiz-questions"></div><div class="actions"><button type="button" id="quiz-add">문항 추가</button><button class="primary">비공개로 저장</button></div></form><p class="hint">서술형은 교사가 최종 점수를 확정합니다. AI 채점 연결 전에는 수동으로 채점합니다.</p></section>' : '')+
      '<section class="panel"><h2>'+ (user.role==='teacher'?'등록한 퀴즈':'응시 가능한 퀴즈')+'</h2><div class="quiz-list">'+(data.quizzes.length ? data.quizzes.map((q)=>'<article class="quiz-card"><div><h3>'+esc(q.title)+'</h3><p>'+q.questions.length+'문항 · '+({hidden:'비공개',open:'응시 중',closed:'종료'}[q.status]||q.status)+'</p></div><div class="actions"><button type="button" data-open="'+esc(q.id)+'">'+(user.role==='teacher'?'답안·채점 보기':'응시하기')+'</button>'+(user.role==='teacher'?'<select aria-label="'+esc(q.title)+' 운영 상태" data-status="'+esc(q.id)+'"><option value="hidden"'+(q.status==='hidden'?' selected':'')+'>비공개</option><option value="open"'+(q.status==='open'?' selected':'')+'>응시 중</option><option value="closed"'+(q.status==='closed'?' selected':'')+'>종료</option></select>':'')+'</div></article>').join(''):'<p class="hint">아직 공개된 퀴즈가 없습니다.</p>')+'</div></section>';
    if(user.role==='teacher'){
      const holder=main.querySelector('#quiz-questions');
      function addQuestion(){const i=holder.children.length+1;const item=document.createElement('fieldset');item.className='quiz-question';item.innerHTML='<legend>문항 '+i+'</legend><div class="form-grid"><label>유형<select name="type"><option value="ox">O/X</option><option value="short">단답형</option><option value="essay">서술형</option></select></label><label>배점<input name="points" type="number" min="1" max="100" value="5" required></label></div><label>문제<textarea name="prompt" maxlength="1000" required></textarea></label><label>정답 및 허용할 유사 정답 (쉼표 또는 줄바꿈으로 구분)<textarea name="accepted" maxlength="2000" placeholder="O 또는 X / 단답형의 허용 답안"></textarea></label><label>서술형 채점 기준<textarea name="rubric" maxlength="3000" placeholder="점수를 부여할 핵심 개념과 기준"></textarea></label><button type="button" class="quiz-remove">문항 삭제</button>';holder.append(item);}
      main.querySelector('#quiz-add').onclick=addQuestion;addQuestion();
      holder.onclick=(e)=>{if(e.target.matches('.quiz-remove'))e.target.closest('fieldset').remove();};
      main.querySelector('#quiz-create').onsubmit=async(e)=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{
        // Read each fieldset independently; FormData(form) would repeat names.
        const rows=[...holder.children].map((el)=>Object.fromEntries([...el.querySelectorAll('[name]')].map((input)=>[input.name,input.value])));
        await api('quiz.create',{title:e.target.elements.title.value,questions:rows});await list();message('퀴즈를 비공개로 저장했습니다. 운영 상태를 응시 중으로 바꾸면 학생에게 공개됩니다.');
      }catch(err){message(err.message);}finally{button.disabled=false;}};
    }
    main.querySelectorAll('[data-open]').forEach((b)=>b.onclick=()=>user.role==='teacher'?showResults(b.dataset.open):showStudent(b.dataset.open));
    main.querySelectorAll('[data-status]').forEach((select)=>select.onchange=async()=>{try{await api('quiz.status',{id:select.dataset.status,status:select.value});await list();}catch(err){message(err.message);}});
  }
  async function showStudent(id){
    const data=await api('quiz.attempt',{quizId:id});quiz=data.quiz;attempt=data.attempt;
    main.innerHTML=heading+'<div class="actions"><button id="quiz-back">목록으로</button></div><p id="quiz-message" role="status"></p><section class="panel"><h2>'+esc(quiz.title)+'</h2><form id="quiz-answer" class="stack">'+quiz.questions.map((q,i)=>'<fieldset class="quiz-question"><legend>'+(i+1)+'. '+esc(q.prompt)+' <small>'+q.points+'점</small></legend>'+(q.type==='ox'?'<label><input type="radio" name="'+esc(q.id)+'" value="O"> O</label><label><input type="radio" name="'+esc(q.id)+'" value="X"> X</label>':q.type==='short'?'<input name="'+esc(q.id)+'" data-student-answer maxlength="4000" autocomplete="off">':'<textarea name="'+esc(q.id)+'" data-student-answer maxlength="4000" rows="6"></textarea>')+'</fieldset>').join('')+'<div class="actions"><button type="button" id="quiz-save">임시 저장</button><button class="primary" type="submit">최종 제출</button></div></form></section>';
    main.querySelector('#quiz-back').onclick=list;
    const form=main.querySelector('#quiz-answer');
    for(const q of quiz.questions){const value=attempt?.answers?.[q.id]||'';if(q.type==='ox'){const radio=[...form.querySelectorAll('[type=radio]')].find((el)=>el.name===q.id&&el.value===value);if(radio)radio.checked=true;}else form.elements.namedItem(q.id).value=value;}
    const locked=quiz.status!=='open'||attempt && attempt.status!=='draft';if(locked){form.querySelectorAll('input,textarea,button').forEach((el)=>el.disabled=true);message(attempt?.status==='graded'?'교사 채점이 완료됐습니다. 총점 '+Object.values(attempt.grading||{}).reduce((n,g)=>n+(g.score||0),0)+'점':attempt?.status==='submitted'?'제출했습니다. 교사 채점을 기다려 주세요.':'응시가 종료된 퀴즈입니다.');}
    const save=async(submit)=>{if(submit&&!confirm('최종 제출하면 답안을 수정할 수 없습니다. 제출할까요?'))return;const answers={};for(const q of quiz.questions)answers[q.id]=q.type==='ox'?(form.querySelector('input[name="'+CSS.escape(q.id)+'"]:checked')?.value||''):form.elements.namedItem(q.id).value;
      try{const saved=await api(submit?'quiz.submit':'quiz.save',{quizId:id,answers,version:attempt?.version});attempt={...attempt,...saved,answers};message(submit?'최종 제출했습니다. 교사 채점을 기다려 주세요.':'임시 저장했습니다.');if(submit)await showStudent(id);}catch(err){message('저장 실패: '+err.message+' 입력한 답안은 이 화면에 남아 있습니다. 다시 시도하세요.');}};
    form.onsubmit=(e)=>{e.preventDefault();save(true);};main.querySelector('#quiz-save').onclick=()=>save(false);
  }
  async function showResults(id){
    results=await api('quiz.results',{id});
    const qs=results.quiz.questions;
    main.innerHTML=heading+'<div class="actions"><button id="quiz-back">목록으로</button></div><p id="quiz-message" role="status"></p><section class="panel"><h2>'+esc(results.quiz.title)+' · 제출 현황</h2>'+(results.attempts.length?results.attempts.map((a)=>'<article class="quiz-card"><div><h3>'+esc(a.student)+'</h3><p>'+({draft:'작성 중',submitted:'채점 대기',graded:'채점 완료'}[a.status]||a.status)+'</p></div><button data-grade="'+esc(a.id)+'">답안 확인</button></article>').join(''):'<p class="hint">아직 제출한 학생이 없습니다.</p>')+'</section><section id="quiz-detail"></section>';
    main.querySelector('#quiz-back').onclick=list;
    main.querySelectorAll('[data-grade]').forEach((b)=>b.onclick=()=>{const a=results.attempts.find((r)=>r.id===b.dataset.grade);const detail=main.querySelector('#quiz-detail');detail.innerHTML='<section class="panel"><h2>'+esc(a.student)+' 답안</h2><form id="quiz-grade" class="stack">'+qs.map((q,i)=>'<fieldset class="quiz-question"><legend>'+(i+1)+'. '+esc(q.prompt)+' <small>'+q.points+'점</small></legend><p class="quiz-answer-text">'+esc(a.answers?.[q.id]||'(미작성)')+'</p><p class="hint">'+(q.type==='essay'?'채점 기준: '+esc(q.rubric):'허용 답안: '+esc(q.accepted.join(', ')))+'</p><label>점수<input type="number" data-score="'+esc(q.id)+'" min="0" max="'+q.points+'" value="'+(a.grading?.[q.id]?.score??0)+'" required></label><label>피드백<textarea data-feedback="'+esc(q.id)+'" maxlength="2000">'+esc(a.grading?.[q.id]?.feedback||'')+'</textarea></label></fieldset>').join('')+'<button class="primary"'+(a.status==='draft'?' disabled':'')+'>교사 최종 점수 확정</button></form></section>';detail.scrollIntoView({behavior:'smooth'});
      detail.querySelector('form').onsubmit=async(e)=>{e.preventDefault();const scores={},feedback={};detail.querySelectorAll('[data-score]').forEach((el)=>scores[el.dataset.score]=Number(el.value));detail.querySelectorAll('[data-feedback]').forEach((el)=>feedback[el.dataset.feedback]=el.value);try{await api('quiz.grade',{id:a.id,version:a.version,scores,feedback});await showResults(id);message('최종 점수를 저장했습니다.');}catch(err){message(err.message);}};
    });
  }
  try{await list();}catch(err){main.innerHTML=heading+'<section class="panel"><p role="alert">'+esc(err.message)+'</p></section>';}
}
