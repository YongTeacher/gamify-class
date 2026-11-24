import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {d1Shim} from './d1-shim.js';
import {handleQuiz} from '../server/quiz.js';

test('퀴즈는 그룹과 역할을 격리하고 교사가 최종 채점을 확정한다',async()=>{
  const LAB_DB=d1Shim();
  LAB_DB.raw.exec(readFileSync(new URL('../migrations/0003_quizzes.sql',import.meta.url),'utf8'));
  const student={id:'student-1',groupId:'legacy',authVersion:1,active:true,name:'테스트학생'};
  LAB_DB.raw.prepare('INSERT INTO Students (id,grp,data) VALUES (?,?,?)').run(student.id,'legacy',JSON.stringify(student));
  const teacher={role:'teacher',groupId:'legacy',owner:true};
  const pupil={role:'student',groupId:'legacy',id:student.id,authVersion:1};
  const env={LAB_DB};
  const call=(action,p={},actor=teacher)=>handleQuiz(action,p,actor,env);
  const created=await call('quiz.create',{title:'효소 퀴즈',questions:[
    {id:'a',type:'ox',prompt:'효소는 단백질이다.',points:2,accepted:'O'},
    {id:'b',type:'short',prompt:'효소가 결합하는 물질은?',points:3,accepted:'기질, substrate'},
    {id:'c',type:'essay',prompt:'효소 특이성을 설명하세요.',points:5,rubric:'활성 부위와 기질의 구조를 설명'}
  ]});
  assert.equal((await call('quiz.list',{},pupil)).quizzes.length,0);
  await call('quiz.status',{id:created.id,status:'open'});
  const view=await call('quiz.attempt',{quizId:created.id},pupil);
  assert.equal(view.quiz.questions[0].accepted,undefined);
  assert.equal(view.quiz.questions[2].rubric,undefined);
  const answers={a:'O',b:' substrate ',c:'활성 부위에 맞는 기질이 결합한다.'};
  const draft=await call('quiz.save',{quizId:created.id,answers},pupil);
  assert.equal(draft.status,'draft');
  const submitted=await call('quiz.submit',{quizId:created.id,answers,version:draft.version},pupil);
  assert.equal(submitted.status,'submitted');
  const pending=await call('quiz.attempt',{quizId:created.id},pupil);
  assert.equal(pending.attempt.grading,undefined);
  const result=await call('quiz.results',{id:created.id});
  assert.equal(result.attempts[0].grading.a.score,2);
  assert.equal(result.attempts[0].grading.b.score,3);
  assert.equal(result.attempts[0].grading.c.score,null);
  await call('quiz.grade',{id:submitted.id,version:submitted.version,scores:{a:2,b:3,c:4},feedback:{c:'활성 부위 설명이 좋습니다.'}});
  const graded=await call('quiz.attempt',{quizId:created.id},pupil);
  assert.equal(graded.attempt.grading.c.score,4);
  await assert.rejects(call('quiz.results',{id:created.id},pupil),{status:403});
  await assert.rejects(call('quiz.attempt',{quizId:created.id},{...pupil,groupId:'other'}),{status:401});
});
