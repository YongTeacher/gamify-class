const aliases = {
  year:['학년도','year'], grade:['학년','grade'], classNo:['반','학급','classno'],
  number:['번호','출석번호','number'], name:['이름','성명','학생명','name'],
  password:['접속코드','비밀번호','password'], schoolNumber:['학번'], courseClass:['수업반','강의반','courseclass']
};
const normal = (v) => String(v ?? '').replace(/\s/g,'').toLowerCase();
export const studentKey = (s) => [s.year,s.grade,s.classNo,s.number].map(Number).join(':');
export const cleanStudentName = (v) => String(v ?? '').replace(/[（(]\s*공동\s*[)）]/g,'').trim();

export function parseRoster(rows, defaults = {}) {
  const headerIndex = rows.findIndex((r) => r.some((v) => aliases.name.includes(normal(v))) && r.some((v) => [...aliases.number,...aliases.schoolNumber].includes(normal(v))));
  if (headerIndex < 0) throw new Error('번호(또는 학번)와 이름(성명) 머리글을 찾을 수 없습니다.');
  const header = rows[headerIndex].map(normal);
  const cols = Object.fromEntries(Object.entries(aliases).map(([k,names]) => [k,header.findIndex((v) => names.includes(v))]));
  if (header.filter((v) => aliases.name.includes(v)).length > 1) throw new Error('한 시트에 명단이 여러 열로 나뉘어 있습니다. 번호·이름 한 쌍의 표로 정리해 주세요.');
  const data = [], seen = new Set();
  let courseClass = defaults.courseClass || '';
  const courseFrom = (r) => r.map(String).join(' ').match(/교과\s*[:：].*?\d+\s*학년\s+(\d+\s*-\s*\d+)/)?.[1]?.replace(/\s/g,'');
  for (const r of rows.slice(0,headerIndex)) courseClass = courseFrom(r) || courseClass;
  rows.slice(headerIndex+1).forEach((r, offset) => {
    courseClass = courseFrom(r) || courseClass;
    const name = cleanStudentName(r[cols.name]);
    if (!name || /^(합계|총계|계|남|여|남자|여자|비고)$/.test(name)) return;
    if (aliases.name.includes(normal(name))) return;
    const row = Object.fromEntries(Object.entries(cols).filter(([,i]) => i >= 0).map(([k,i]) => [k,String(r[i] ?? '').trim()]));
    row.name = name;
    if (courseClass && !row.courseClass) row.courseClass = courseClass;
    if (row.schoolNumber && cols.number < 0) {
      if (!/^\d{5}$/.test(row.schoolNumber)) throw new Error((headerIndex+offset+2)+'행: 학번은 5자리(학년 1자리·반 2자리·번호 2자리) 형식이어야 합니다.');
      row.grade ||= row.schoolNumber.slice(0,1); row.classNo ||= row.schoolNumber.slice(1,3); row.number = row.schoolNumber.slice(3);
    }
    for (const k of ['year','grade','classNo']) row[k] ||= defaults[k];
    for (const [k,label,min,max] of [['year','학년도',2020,2100],['grade','학년',1,12],['classNo','반',1,100],['number','번호',1,999]]) {
      if (!/^\d+(?:\.0+)?$/.test(String(row[k] ?? '')) || +row[k]<min || +row[k]>max) throw new Error((headerIndex+offset+2)+'행: '+label+'을 확인하세요. 파일에 없으면 위 입력란에서 지정하세요.');
      row[k] = Number(row[k]);
    }
    delete row.schoolNumber;
    if (seen.has(studentKey(row))) throw new Error('중복 학번이 있습니다: '+row.grade+'-'+row.classNo+'-'+row.number);
    seen.add(studentKey(row)); data.push(row);
  });
  if (!data.length || data.length>100) throw new Error('한 번에 1~100명씩 등록하세요.');
  return data;
}

export function prepareRoster(rows, existing, makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (v) => v.toString(16).padStart(2,'0')).join('')) {
  const codes = [];
  const students = rows.map((row) => {
    const old = existing.find((s) => studentKey(s)===studentKey(row));
    if (old && cleanStudentName(old.name)!==row.name) throw new Error('이미 등록된 학번의 이름이 다릅니다: '+row.grade+'-'+row.classNo+'-'+row.number);
    if (old) return {...row,password:''}; // Never reset or claim to know an existing student's code.
    const password = row.password || makeCode();
    if (password.length<8 || password.length>128) throw new Error(row.name+': 접속 코드는 8~128자여야 합니다.');
    const student = {...row,password}; codes.push(student); return student;
  });
  return {students,codes};
}

export function rosterCSV(students) {
  // Prevent spreadsheet formula execution when opening the downloaded code list.
  const cell = (v) => '"'+String(/^[=+@\-\t\r]/.test(String(v)) ? "'"+v : v).replace(/"/g,'""')+'"';
  return '\uFEFF학년도,학년,반,번호,이름,접속코드,수업반\r\n'+students.map((s) => ['year','grade','classNo','number','name','password','courseClass'].map((k) => cell(s[k] ?? '')).join(',')).join('\r\n');
}
