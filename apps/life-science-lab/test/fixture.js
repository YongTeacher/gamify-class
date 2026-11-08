import '../seed.js';
import '../domain.js';
export function fixture() {
  const tables = {};
  const db = {
    all: (t) => structuredClone(tables[t] || []),
    put: (t, row) => { const rows = tables[t] ||= []; const i = rows.findIndex((r) => r.id === row.id); if (i < 0) rows.push(structuredClone(row)); else rows[i] = structuredClone(row); },
    replaceFields: (id, fields) => { tables.AssessmentFields = [...(tables.AssessmentFields || []).filter((f) => f.assessmentId !== id), ...structuredClone(fields)]; }
  };
  const teacher = { role:'teacher' }, ctx = { now:'2026-11-07T01:00:00.000Z', uuid:() => crypto.randomUUID() };
  const run = (action, payload = {}, actor = teacher) => globalThis.LabDomain.execute(db, action, payload, actor, ctx);
  run('assessment.save', structuredClone(globalThis.LAB_SEED));
  run('students.import', { students:[1,2].map((number) => ({ year:2026,grade:2,classNo:1,number,name:'가상연구자'+number,passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64) })) });
  const student = { role:'student',id:db.all('Students')[0].id,authVersion:1 };
  const other = { role:'student',id:db.all('Students')[1].id,authVersion:1 };
  return { tables,db,run,student,other,teacher,ctx };
}
export const completeContent = () => Object.fromEntries(globalThis.LAB_SEED.fields.map((f) => [f.id, f.type === 'references' ? [{title:'가상 출처',author:'테스트 기관',source:'https://example.org/research'}] : '테스트용 탐구 내용 '+f.title]));
