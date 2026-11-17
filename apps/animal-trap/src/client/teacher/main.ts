/**
 * teacher/main.ts — 교사 진행 화면 (DESIGN §8). 받은 teacherView 를 그리고 진행 명령을 보낸다.
 *
 * 판 만들기: 관리자 비밀번호(X-Admin-Password)로 POST /api/game → 교사 열쇠는 이 브라우저(localStorage)에만 저장.
 * 진행: 추첨 → 덫 설치(진행률·지금 마감) → 시작 → [이동·문제 '지금 마감' / 다음 라운드] → 종료 → 복습.
 * 명령은 '지금 보고 있는 라운드·단계'를 함께 보낸다 — 그사이 마감됐으면 서버가 STALE 로 거절(새 단계를 닫지 않음).
 * ⚠️ 서버·교사 입력 글은 esc() 로. TV 열쇠는 #해시로만 TV 창에 넘긴다(서버 로그에 남지 않게).
 */
import type { TeacherView } from '../../game/views.ts';
import { draw, TEAM_COLORS, type BoardModel } from '../shared/board.ts';
import { call, command, Countdown, errText, live, mmss } from '../shared/net.ts';
import { qrSvg } from '../shared/qr.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const app = $('#app');
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const KEY_RE = /^[A-Z2-9]{20,40}$/;

let toastTimer: number | undefined;
function toast(msg: string) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (t.hidden = true), 4000); }

// ── 저장된 판 (이 브라우저에만) ─────────────────────────────────
interface Saved { code: string; hostKey: string; title: string; createdAt: number }
const STORE = 'animal-trap-teacher';
function savedGames(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(v) ? v.filter((g) => g && CODE_RE.test(g.code) && KEY_RE.test(g.hostKey)).map((g) => ({ code: g.code, hostKey: g.hostKey, title: String(g.title ?? ''), createdAt: Number(g.createdAt) || 0 })) : [];
  } catch { return []; }
}
function remember(g: Saved) { try { localStorage.setItem(STORE, JSON.stringify([g, ...savedGames().filter((x) => x.code !== g.code)].slice(0, 20))); } catch { /* */ } }
function forget(code: string) { try { localStorage.setItem(STORE, JSON.stringify(savedGames().filter((x) => x.code !== code))); } catch { /* */ } }

// ── 시작 화면: 판 만들기 / 이어하기 ─────────────────────────────
let session: { close(): void } | null = null;
let sessionNo = 0;
type SetInfo = { name: string; total: number; counts: { 쉬움: number; 보통: number; 어려움: number } };
let setList: SetInfo[] = [];
let chosenSet: string | null = null;
let setLoadNo = 0;
function endSession() { session?.close(); session = null; view = null; sessionNo++; busy = false; pendingFocus = null; $('#banners').innerHTML = ''; }

function renderHome() {
  endSession();
  setList = [];
  chosenSet = null;
  setLoadNo++;
  const games = savedGames();
  app.innerHTML = `
    <div class="top"><h1>🌴 애니멀 트랩 · 교사</h1><div class="row"><a class="small" href="/guide" style="text-decoration:none">사용 안내</a><a class="small" href="/admin" style="text-decoration:none">📚 문제은행</a><a class="small" href="/" target="_blank" rel="noopener">학생 화면 열기 ↗</a></div></div>
    <div class="layout">
      <section class="card form" aria-labelledby="mk">
        <h2 id="mk">새 판 만들기</h2>
        <label>판 제목<input id="title" maxlength="60" placeholder="예: 2학년 3반 효소 단원"></label>
        <label>팀 수<select id="teamCount">${[4, 5, 6, 7, 8].map((n) => `<option value="${n}"${n === 8 ? ' selected' : ''}>${n}팀</option>`).join('')}</select></label>
        <fieldset class="team-name-box"><legend>팀명</legend><div id="teamNames" class="team-name-grid"></div></fieldset>
        <details class="advanced" id="advanced">
          <summary><span>⚙️ 세부 설정</span><small>문제 세트와 진행 시간을 설정해요</small></summary>
          <div class="advanced-body">
            <div class="set-picker">
              <strong>① 관리자 비밀번호 입력</strong>
              <div class="set-load"><input id="admin" type="password" autocomplete="current-password" aria-label="관리자 비밀번호" placeholder="문제 세트를 보려면 입력"><button class="small" id="loadSets" type="button">세트 목록 불러오기</button></div>
              <strong>② 사용할 문제 세트 선택</strong>
              <select id="setChoice" aria-label="사용할 문제 세트" disabled><option value="">먼저 세트 목록을 불러오세요</option></select>
              <p id="setInfo" class="set-info" role="status">세트 이름과 문항 수를 확인한 뒤 선택할 수 있어요.</p>
              <a href="/admin" target="_blank" rel="noopener">문제은행에서 세트 관리 ↗</a>
            </div>
            <div class="grid2">
              <label>게임 시간(분)<input id="durationMin" type="number" min="1" max="60" value="15"></label>
              <label>이동 시간(초)<input id="moveSec" type="number" min="10" max="60" value="20"></label>
              <label>문제 시간(초)<input id="quizSec" type="number" min="20" max="120" value="45"></label>
              <label>덫 설치 시간(초)<input id="setupSec" type="number" min="60" max="300" value="120"></label>
            </div>
            <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input id="autoNext" type="checkbox" style="width:auto"> 라운드 결과 5초 뒤 자동으로 다음 라운드</label>
          </div>
        </details>
        <button class="btn" id="create">판 만들기</button>
      </section>
      <section class="card">
        <h2>이어하기</h2>
        ${games.length ? `<div class="games">${games.map((g) => `<div class="row" style="flex-wrap:nowrap"><button data-code="${g.code}" style="flex:1"><span>${esc(g.title || '제목 없음')}</span><span class="muted">${g.code}</span></button><button class="small" data-forget="${g.code}" aria-label="${g.code} 목록에서 지우기">지우기</button></div>`).join('')}</div>
        <p class="muted" style="font-size:.85rem">공용 컴퓨터라면 수업 뒤 기록을 지우세요(교사 열쇠가 이 브라우저에 저장돼 있어요).</p><button class="small warn" id="forgetAll">이 브라우저의 판 기록 모두 지우기</button>` : '<p class="muted" style="margin:0">이 브라우저에서 만든 판이 여기에 남습니다.</p>'}
      </section>
    </div>`;
  $('#create').onclick = createGame;
  const renderTeamNames = () => {
    const count = Number($<HTMLSelectElement>('#teamCount').value);
    const old = [...document.querySelectorAll<HTMLInputElement>('#teamNames input')].map((input) => input.value);
    $('#teamNames').innerHTML = Array.from({ length: count }, (_, i) => `<label><span>${i + 1}팀</span><input data-team-name="${i}" maxlength="20" value="${esc(old[i] || `${i + 1}팀`)}" aria-label="${i + 1}팀 팀명"></label>`).join('');
  };
  $<HTMLSelectElement>('#teamCount').onchange = renderTeamNames;
  renderTeamNames();
  $('#loadSets').onclick = fillSetNames;
  $<HTMLInputElement>('#admin').onchange = () => { if ($<HTMLInputElement>('#admin').value) void fillSetNames(); };
  $<HTMLInputElement>('#admin').oninput = () => {
    setList = []; chosenSet = null;
    setLoadNo++;
    const select = $<HTMLSelectElement>('#setChoice'); select.disabled = true;
    select.innerHTML = '<option value="">세트 목록을 다시 불러오세요</option>';
    $('#setInfo').textContent = '비밀번호를 입력하고 세트 목록을 불러오세요.';
  };
  $<HTMLSelectElement>('#setChoice').onchange = showSetInfo;
  app.querySelectorAll<HTMLButtonElement>('[data-code]').forEach((b) => (b.onclick = () => { const g = savedGames().find((x) => x.code === b.dataset.code); if (g) openGame(g); }));
  app.querySelectorAll<HTMLButtonElement>('[data-forget]').forEach((b) => (b.onclick = () => { forget(b.dataset.forget as string); renderHome(); }));
  const all = document.getElementById('forgetAll'); if (all) all.onclick = () => { if (confirm('이 브라우저에 저장된 판 기록을 모두 지울까요? (판 자체는 지워지지 않아요)')) { try { localStorage.removeItem(STORE); } catch { /* */ } renderHome(); } };
}

/** 관리자 인증 뒤 세트·문항 수를 불러온다. 전체 문제은행은 명시적으로 선택한다. */
async function fillSetNames() {
  const pw = $<HTMLInputElement>('#admin').value;
  if (!pw) { $('#setInfo').textContent = '관리자 비밀번호를 먼저 입력해 주세요.'; return; }
  const mine = sessionNo;
  const loadNo = ++setLoadNo;
  setList = []; chosenSet = null;
  $<HTMLSelectElement>('#setChoice').disabled = true;
  const button = $<HTMLButtonElement>('#loadSets'); button.disabled = true;
  $('#setInfo').textContent = '문제 세트 목록을 불러오는 중…';
  const r = await call<{ sets: SetInfo[] }>('/api/admin/sets', { 'X-Admin-Password': pw }, undefined, 'GET');
  if (mine !== sessionNo || loadNo !== setLoadNo || $<HTMLInputElement>('#admin').value !== pw) return;
  button.disabled = false;
  if (!r.ok) { $('#setInfo').textContent = r.error === 'ADMIN_DENIED' ? '비밀번호가 맞지 않아요. 확인 후 다시 불러오세요.' : errText(r.error); return; }
  setList = r.data.sets;
  chosenSet = null;
  const select = $<HTMLSelectElement>('#setChoice');
  select.disabled = !setList.length;
  select.innerHTML = `<option value="">문제 세트를 선택하세요</option><option value="all">전체 문제은행 · ${setList.reduce((n, s) => n + s.total, 0)}문항</option>${setList.map((s, i) => `<option value="set:${i}">${esc(s.name)} · ${s.total}문항</option>`).join('')}`;
  $('#setInfo').textContent = setList.length ? `${setList.length}개 세트를 불러왔어요. 사용할 세트를 골라 주세요.` : '등록된 문제 세트가 없어요. 문제은행에서 먼저 문항을 등록해 주세요.';
}

function showSetInfo() {
  const value = $<HTMLSelectElement>('#setChoice').value;
  const selected = /^set:(\d+)$/.exec(value);
  const set = selected ? setList[Number(selected[1])] : undefined;
  chosenSet = value === 'all' ? '' : set?.name ?? null;
  if (chosenSet === null) { $('#setInfo').textContent = '사용할 문제 세트를 골라 주세요.'; return; }
  const counts = set ? set.counts : setList.reduce((sum, s) => ({ 쉬움: sum.쉬움 + s.counts.쉬움, 보통: sum.보통 + s.counts.보통, 어려움: sum.어려움 + s.counts.어려움 }), { 쉬움: 0, 보통: 0, 어려움: 0 });
  const total = counts.쉬움 + counts.보통 + counts.어려움;
  $('#setInfo').textContent = `${set?.name ?? '전체 문제은행'} · 총 ${total}문항 (쉬움 ${counts.쉬움} · 보통 ${counts.보통} · 어려움 ${counts.어려움})${total > 300 ? ' · 판에는 난이도 비율에 맞춰 최대 300문항 사용' : ''}${Object.values(counts).some((n) => n === 0) ? ' · 난이도별로 최소 1문항이 필요해요' : ''}`;
}

async function createGame() {
  const num = (id: string) => Number(($('#' + id) as HTMLInputElement).value);
  const teamNames = [...document.querySelectorAll<HTMLInputElement>('[data-team-name]')].map((input) => input.value.trim());
  const body = { title: ($('#title') as HTMLInputElement).value, setName: chosenSet ?? '',
    teamCount: num('teamCount'), teamNames, durationMin: num('durationMin'), moveSec: num('moveSec'), quizSec: num('quizSec'), setupSec: num('setupSec'), autoNext: ($('#autoNext') as HTMLInputElement).checked };
  const pw = ($('#admin') as HTMLInputElement).value;
  if (teamNames.length !== body.teamCount || teamNames.some((name) => !name)) return toast('모든 팀의 이름을 입력해 주세요.');
  if (new Set(teamNames).size !== teamNames.length) return toast('팀명은 서로 다르게 입력해 주세요.');
  if (!pw || chosenSet === null) {
    $<HTMLDetailsElement>('#advanced').open = true;
    return toast(!pw ? '세부 설정에서 관리자 비밀번호를 입력해 주세요.' : '세부 설정에서 사용할 문제 세트를 선택해 주세요.');
  }
  const btn = $<HTMLButtonElement>('#create'); btn.disabled = true;
  const mine = sessionNo;
  const r = await call<{ code: string; hostKey: string; warnings: string[] }>('/api/game', { 'X-Admin-Password': pw }, body);
  if (mine !== sessionNo) return;
  btn.disabled = false;
  if (!r.ok) return toast(r.error === 'BANK_EMPTY_LEVEL' ? '문제 세트에 쉬움·보통·어려움 문제가 각각 1개 이상 있어야 해요.' : r.error === 'BAD_CONFIG' ? '팀 수 또는 시간 설정을 확인해 주세요.' : r.error === 'ADMIN_DENIED' ? '관리자 비밀번호가 맞지 않아요.' : errText(r.error));
  const g: Saved = { code: r.data.code, hostKey: r.data.hostKey, title: body.title || '애니멀 트랩', createdAt: Date.now() };
  remember(g);
  if (r.data.warnings.length) toast(r.data.warnings.join(' / '));
  openGame(g);
}

// ── 진행 화면 ────────────────────────────────────────────────
let game: Saved;
let view: TeacherView | null = null;
let clock: Countdown | null = null;
let busy = false;
let pendingFocus: string | null = null;
const qrCache = new Map<string, string>();
const qr = (url: string) => { let s = qrCache.get(url); if (!s) { s = qrSvg(url, 4); qrCache.set(url, s); } return s; };
let accessOpen = false; // '팀 접속 관리' 접힘 상태를 다시 그려도 유지

async function teacher(cmd: Record<string, unknown>): Promise<unknown | null> {
  if (busy) return null;
  const mine = sessionNo;
  busy = true; render();
  const r = await command(`/api/game/${game.code}/teacher`, { 'X-Host-Key': game.hostKey }, { cmd });
  if (mine !== sessionNo) return null;
  busy = false; render();
  if (!r.ok) { toast(r.error === 'STALE' ? '그사이 단계가 바뀌었어요. 화면을 확인하고 다시 눌러 주세요.' : errText(r.error)); return null; }
  return r.data ?? true;
}

function openGame(g: Saved) {
  endSession();
  game = g;
  history.replaceState(null, '', '#' + g.code);
  app.innerHTML = `<p class="muted">판 ${g.code} 연결 중…</p>`;
  const sock = live<TeacherView>({
    code: g.code,
    hello: () => ({ role: 'teacher', key: g.hostKey }),
    onState: (v) => { view = v; clock = Countdown.of(v); render(); },
    onStatus: (up) => { $('#banners').innerHTML = up ? '' : '<div class="banner off" role="alert">연결이 끊겼어요. 다시 연결하는 중…</div>'; },
    onClosedForGood: (code) => { if (code === 4003) { $('#banners').innerHTML = '<div class="banner off" role="alert">이 판에 기기가 너무 많이 접속해 이 화면의 연결을 끊었어요. 새로 고치면 다시 연결돼요.</div>'; return; } forget(g.code); renderHome(); toast('이 판에 접속할 수 없어요(열쇠가 맞지 않음).'); }
  });
  const timer = window.setInterval(tickClock, 250);
  let raf = 0;
  const loop = (t: number) => { const c = document.getElementById('board') as HTMLCanvasElement | null; if (c && view) draw(c, boardModel(view), t); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  session = { close: () => { sock.close(); clearInterval(timer); cancelAnimationFrame(raf); } };
}

function tickClock() {
  if (!clock) return;
  const m = document.getElementById('mainClock'); if (m) m.textContent = mmss(clock.mainLeft());
  const p = document.getElementById('phaseClock'); const l = clock.phaseLeft(); if (p) p.textContent = l === null ? '' : mmss(l);
}

function boardModel(v: TeacherView): BoardModel {
  return { animals: v.teams.map((t) => ({ team: t.team, emoji: t.animal.emoji, pos: t.pos })), zones: v.teams.map((t) => t.zone),
    trapMap: v.final ? v.final.traps : null };
}

const studentUrl = (team: number) => `${location.origin}/#${game.code}-${team}`;
const tvUrl = (v: TeacherView) => `${location.origin}/tv#${game.code}.${v.tvKey}`;

const STEP: Record<string, string> = { MOVE_OPEN: '이동 고르기', QUESTION_OPEN: '문제 풀이', ROUND_SUMMARY: '라운드 결과' };
const PHASE: Record<string, string> = { LOBBY: '입장 대기', DRAWN: '출발 구역 추첨 완료', TRAP_SETUP: '덫 설치', READY: '설치 완료 · 시작 대기', RUNNING: '진행 중', FINISHED: '게임 종료', REVIEW: '문제 복습' };

function render() {
  const v = view; if (!v) return;
  // 푸시마다 다시 그려도 키보드 포커스·스크롤이 튀지 않게 복원한다
  // 포커스 복원 대상은 렌더 사이에 유지한다(버튼이 busy 로 잠깐 비활성화돼도 다시 켜지면 돌아간다)
  pendingFocus = focusKey(document.activeElement) ?? pendingFocus;
  const scrollY = window.scrollY;
  const off = busy || v.paused ? 'disabled' : '';
  const label = v.paused ? '⏸ 일시정지 중' : v.phase === 'RUNNING' ? `${v.round}라운드 · ${STEP[v.step ?? '']}` : PHASE[v.phase];
  app.innerHTML = `
    <div class="top">
      <div class="row"><h1>${esc(v.title)}</h1><span class="code" aria-label="판 코드">${v.code}</span></div>
      <div class="row noprint">
        <a class="btn ghost" href="${esc(tvUrl(v))}" target="_blank" rel="noopener noreferrer">📺 TV 화면 열기</a>
        <button class="small" id="home">← 판 목록</button>
      </div>
    </div>
    <div class="stepbar ${v.paused ? 'paused' : ''}"><span>${esc(label)}</span><span class="t" id="phaseClock"></span></div>
    <div class="layout">
      <div style="display:grid;gap:14px">
        ${controls(v, off)}
        ${v.phase === 'LOBBY' || v.phase === 'DRAWN' ? qrSection(v) : `<canvas class="board" id="board" role="img" aria-label="게임판(덫 위치는 종료 후에만)"></canvas>`}
        ${v.phase === 'REVIEW' || v.phase === 'FINISHED' ? reviewSection(v, off) : ''}
      </div>
      <div style="display:grid;gap:14px">
        <section class="card"><div class="clockbox"><span class="muted">남은 게임 시간</span><b id="mainClock">${mmss(v.mainRemainingMs)}</b></div></section>
        ${teamTable(v)}
        ${accessSection(v)}
      </div>
    </div>`;
  bind(v);
  tickClock();
  if (pendingFocus) {
    const el = app.querySelector(pendingFocus) as HTMLButtonElement | null;
    if (!el) pendingFocus = null;                                  // 그 버튼이 이 단계에 없으면 포기
    else if (!el.disabled) { el.focus({ preventScroll: true }); pendingFocus = null; }
  }
  window.scrollTo(0, scrollY);
}

function focusKey(el: Element | null): string | null {
  if (!el || !(el instanceof HTMLElement) || !app.contains(el)) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  for (const a of ['data-release', 'data-unlock', 'data-reissue', 'data-reset-animal', 'data-reveal', 'data-show']) { const v = el.getAttribute(a); if (v !== null) return `[${a}="${CSS.escape(v)}"]`; }
  return null;
}

function controls(v: TeacherView, off: string): string {
  const b = (id: string, text: string, cls = 'btn', extra = '') => `<button class="${cls}" id="${id}" ${extra}>${text}</button>`;
  const pause = v.phase === 'RUNNING' || v.phase === 'TRAP_SETUP' ? (v.paused ? b('resume', '▶ 재개', 'btn', busy ? 'disabled' : '') : b('pause', '⏸ 일시정지', 'btn ghost', busy ? 'disabled' : '')) : '';
  const finish = ['DRAWN', 'TRAP_SETUP', 'READY', 'RUNNING'].includes(v.phase) ? b('finish', '■ 게임 종료', 'btn warn', busy ? 'disabled' : '') : '';
  let main = '';
  if (v.phase === 'LOBBY') {
    const picked = v.teams.filter((team) => team.animalId !== null).length;
    main = b('draw', `🎲 출발 자리 추첨 (${picked}/${v.teams.length})`, 'btn', off || picked < v.teams.length ? 'disabled' : '');
  }
  if (v.phase === 'DRAWN') main = b('startSetup', '🪤 덫 설치 시작', 'btn', off);
  if (v.phase === 'TRAP_SETUP') main = b('closeSetup', '⏭ 설치 지금 마감', 'btn', off);
  if (v.phase === 'READY') main = b('startGame', '🚀 게임 시작', 'btn', off);
  if (v.phase === 'RUNNING' && v.step === 'MOVE_OPEN') main = b('closeMove', '⏭ 이동 지금 마감', 'btn', off);
  if (v.phase === 'RUNNING' && v.step === 'QUESTION_OPEN') main = b('closeQuiz', '⏭ 문제 지금 마감', 'btn', off);
  if (v.phase === 'RUNNING' && v.step === 'ROUND_SUMMARY') main = b('next', '▶ 다음 라운드', 'btn', off) + (v.config.autoNext ? '<span class="muted">5초 뒤 자동으로 넘어가요</span>' : '');
  if (v.phase === 'FINISHED') main = b('review', '📖 문제 복습 시작', 'btn', busy ? 'disabled' : '');
  const fin = v.phase === 'FINISHED' || v.phase === 'REVIEW';
  const traps = fin ? (v.trapMap ? b('showMap', `🗺 TV에 덫 지도${v.reviewDisplay.mode === 'map' ? ' (표시 중)' : ''}`, 'btn ghost', busy ? 'disabled' : '') : b('revealTraps', '🗺 전체 덫 지도 공개(TV·학생)', 'btn ghost', busy ? 'disabled' : '')) + b('showRanking', `🏆 TV에 순위${v.reviewDisplay.mode === 'ranking' ? ' (표시 중)' : ''}`, 'btn ghost', busy ? 'disabled' : '') : '';
  const setup = v.phase === 'TRAP_SETUP' ? `<p class="muted" style="margin:0">설치 확정 ${v.teams.filter((t) => t.status.setupConfirmed).length}/${v.teams.length}팀 · 시간이 끝나면 나머지는 자동 확정돼요.</p>` : '';
  const events = v.phase === 'RUNNING' && v.step === 'ROUND_SUMMARY' && v.events.length ? `<p class="muted" style="margin:0">${roundSummary(v)}</p>` : '';
  return `<section class="card noprint" style="display:grid;gap:10px"><div class="row">${main}${pause}${finish}${traps}</div>${setup}${events}</section>`;
}

function roundSummary(v: TeacherView): string {
  const name = (t: number) => v.teams[t].animal.emoji;
  const parts = v.events.flatMap((e) => {
    if (e.type === 'quiz') return [`${name(e.team)} ${e.correct ? '정답' : e.timeout ? '시간초과' : '오답'}(${e.points > 0 ? '+' : ''}${e.points})`];
    if (e.type === 'oasis') return [`${name(e.team)} 오아시스 ${e.rank}등`];
    if (e.type === 'effect') return [`${name(e.team)} ${{ return: '귀환', bind: '속박', confuse: '혼란' }[e.effect]}`];
    return [];
  });
  return parts.length ? '이번 라운드: ' + parts.join(' · ') : '이번 라운드는 문제·특수 사건이 없었어요.';
}

function qrSection(v: TeacherView): string {
  return `<section class="card"><div class="row noprint" style="justify-content:space-between"><h2 style="margin:0">학생 입장 QR·PIN</h2><button class="small" id="print">🖨 인쇄</button></div>
    <p class="muted noprint">팀마다 QR을 찍고 PIN으로 입장한 뒤 원하는 동물을 선착순으로 선택해요. 모두 선택하면 출발 자리를 추첨할 수 있어요.</p>
    <div class="qrs">${v.teams.map((t) => `<div class="qr" style="--c:${TEAM_COLORS[t.team]}"><div class="who">${esc(t.teamName)}</div>${qr(studentUrl(t.team))}<div class="muted" style="font-size:.8rem">판 ${v.code}</div><div class="pin">${esc(v.pins[t.team])}</div><div style="font-size:.85rem">${t.animalId !== null ? `<span class="ok">${t.animal.emoji} ${esc(t.animal.name)} 선택</span>` : v.access[t.team].hasController ? '<span class="ok">✔ 입장 · 동물 선택 전</span>' : '<span class="muted">입장 대기</span>'}</div></div>`).join('')}</div></section>`;
}

function teamTable(v: TeacherView): string {
  const status = (t: TeacherView['teams'][number]) => {
    if (v.phase === 'TRAP_SETUP') return t.status.setupConfirmed ? '<span class="ok">확정</span>' : '설치 중';
    if (v.phase === 'LOBBY') return t.animalId !== null ? `<span class="ok">${t.animal.emoji} ${esc(t.animal.name)} 선택</span>` : t.status.joined ? '<span class="ok">입장 · 선택 중</span>' : '<span class="muted">대기</span>';
    if (v.phase === 'DRAWN') return '<span class="ok">자리 추첨 완료</span>';
    if (v.phase !== 'RUNNING') return '';
    const s: string[] = [];
    if (v.step === 'MOVE_OPEN') s.push(t.status.boundLeft ? '⛓️ 속박' : t.status.moved ? '<span class="ok">이동함</span>' : '고르는 중');
    if (v.step === 'QUESTION_OPEN') s.push(t.status.quiz === 'pending' ? '<span class="no">문제 풀이 중</span>' : t.status.quiz === 'done' ? '<span class="ok">답함</span>' : '–');
    if (t.status.confusedLeft) s.push('🌫️');
    return s.join(' ');
  };
  const order = [...v.teams].sort((a, b) => a.rank - b.rank || a.team - b.team);
  const fin = order.some((t) => t.summary);
  return `<section class="card"><h2>${fin ? '최종 결과' : '팀 현황'}</h2><table class="teams"><thead><tr><th>순위</th><th>팀</th><th>${fin ? '정·오 · 구역 · 🌴' : '상태'}</th><th style="text-align:right">점수</th></tr></thead><tbody>
    ${order.map((t) => `<tr><td>${t.rank}</td><td><span class="swatch" style="--c:${TEAM_COLORS[t.team]}" aria-hidden="true">${t.animal.emoji}</span> ${esc(t.teamName)}${t.animalId !== null ? ` · ${esc(t.animal.name)}` : ''}${!fin && t.oasisRank ? ' 🌴' + t.oasisRank : ''}</td><td>${t.summary ? `${t.summary.correct}/${t.summary.wrong} · ${t.summary.zones} · ${t.summary.oasisRank ?? '–'}` : status(t)}${v.phase === 'LOBBY' && t.animalId !== null ? ` <button class="small" data-reset-animal="${t.team}">선택 초기화</button>` : ''}</td><td class="num">${t.score}</td></tr>`).join('')}
    </tbody></table></section>`;
}

function accessSection(v: TeacherView): string {
  return `<details class="card noprint" id="access" ${accessOpen ? 'open' : ''}><summary style="font-weight:800;cursor:pointer">🔧 팀 접속 관리 · TV 열쇠</summary>
    <table class="teams" style="margin-top:10px"><tbody>${v.teams.map((t) => `<tr><td>${esc(t.teamName)} · PIN <b>${esc(v.pins[t.team])}</b></td>
      <td>${v.access[t.team].hasController ? '조작 기기 있음' : '<span class="muted">조작 기기 없음</span>'}${v.access[t.team].pinLocked ? ' · <span class="no">PIN 잠김</span>' : ''}</td>
      <td class="row" style="justify-content:flex-end">
        ${v.access[t.team].hasController ? `<button class="small" data-release="${t.team}">조작권 해제</button>` : ''}
        ${v.access[t.team].pinLocked ? `<button class="small" data-unlock="${t.team}">잠금 해제</button>` : ''}
        <button class="small warn" data-reissue="${t.team}">PIN 재발급</button></td></tr>`).join('')}</tbody></table>
    <p class="muted" style="font-size:.9rem">조작권 해제: 조작 기기를 바꿀 때(다음에 들어오는 기기가 조작). PIN 재발급: 그 팀의 모든 기기가 끊기고 새 PIN으로 다시 입장.</p>
    <button class="small warn" id="reissueTv">TV 열쇠 재발급 (TV 링크가 새어 나갔을 때)</button></details>`;
}

function reviewSection(v: TeacherView, off: string): string {
  if (!v.final) return '';
  const revealed = new Set(v.reviewQuestions.map((q) => q.id));
  const stat = (id: string) => { const log = v.final!.quizLog.filter((q) => q.questionId === id); return log.length ? `${log.length}팀 풀이 · 정답 ${log.filter((q) => q.correct).length}` : '취소된 문제'; };
  return `<section class="card"><h2>📖 이번 판에 나온 문제 ${v.final.questions.length}개</h2>
    ${v.phase !== 'REVIEW' ? '<p class="muted">‘문제 복습 시작’을 누르면 TV에 한 문제씩 정답을 공개할 수 있어요.</p>' : ''}
    <div class="qlist">${v.final.questions.map((q, i) => `<div class="qitem"><div class="row" style="justify-content:space-between"><b>${i + 1}. ${esc(q.text)}</b><span class="lv-tag lv-${esc(q.level)}">${esc(q.level)}</span></div>
      <div class="meta muted">${stat(q.id)} · 정답 ${q.answer}번 (${esc(q.choices[q.answer - 1])})</div>
      ${v.phase === 'REVIEW' ? (v.reviewDisplay.mode === 'question' && v.reviewDisplay.questionId === q.id ? '<span class="ok">▶ TV에 표시 중</span>' : `<button class="small" data-reveal="${esc(q.id)}" ${off}>${revealed.has(q.id) ? 'TV에 다시 띄우기' : 'TV에 정답 공개'}</button>`) : ''}</div>`).join('') || '<p class="muted">나온 문제가 없어요.</p>'}</div></section>`;
}

function bind(v: TeacherView) {
  const on = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('home', renderHome);
  const acc = document.getElementById('access') as HTMLDetailsElement | null; if (acc) acc.ontoggle = () => (accessOpen = acc.open);
  on('print', () => window.print());
  on('draw', () => void teacher({ type: 'draw' }));
  on('startSetup', () => void teacher({ type: 'startSetup' }));
  on('closeSetup', () => void teacher({ type: 'closePhase', target: { phase: 'TRAP_SETUP' } }));
  on('startGame', () => void teacher({ type: 'startGame' }));
  on('closeMove', () => void teacher({ type: 'closePhase', target: { phase: 'RUNNING', step: 'MOVE_OPEN', round: v.round } }));
  on('closeQuiz', () => void teacher({ type: 'closePhase', target: { phase: 'RUNNING', step: 'QUESTION_OPEN', round: v.round } }));
  on('next', () => void teacher({ type: 'next', round: v.round }));
  on('pause', () => void teacher({ type: 'pause' }));
  on('resume', () => void teacher({ type: 'resume' }));
  on('finish', () => { if (confirm('게임을 지금 끝낼까요?\n진행 중인 라운드(이동·문제)는 취소되고, 지금까지 확정된 점수로 끝나요.')) void teacher({ type: 'finish' }); });
  on('review', () => void teacher({ type: 'review' }));
  on('revealTraps', () => void teacher({ type: 'revealTraps' }));
  on('showMap', () => void teacher({ type: 'revealTraps' }));
  on('showRanking', () => void teacher({ type: 'showRanking' }));
  on('reissueTv', async () => { if (!confirm('TV 열쇠를 바꿀까요? 지금 켜진 TV 화면은 끊기고, ‘TV 화면 열기’로 다시 열어야 해요.')) return; if (await teacher({ type: 'reissueTv' })) toast('새 TV 열쇠를 만들었어요. ‘TV 화면 열기’를 다시 눌러 주세요.'); });
  app.querySelectorAll<HTMLButtonElement>('[data-release]').forEach((b) => (b.onclick = async () => { if (await teacher({ type: 'releaseControl', team: Number(b.dataset.release) })) toast('조작권을 해제했어요. 다음에 입장하는 기기가 조작을 맡아요.'); }));
  app.querySelectorAll<HTMLButtonElement>('[data-unlock]').forEach((b) => (b.onclick = () => void teacher({ type: 'unlockPin', team: Number(b.dataset.unlock) })));
  app.querySelectorAll<HTMLButtonElement>('[data-reissue]').forEach((b) => (b.onclick = async () => {
    const t = Number(b.dataset.reissue);
    if (!confirm(`${v.teams[t].teamName} PIN을 새로 만들까요? 그 팀 기기는 모두 끊기고 새 PIN으로 다시 들어와야 해요.`)) return;
    const r = await teacher({ type: 'reissuePin', team: t }) as { pin?: string } | null;
    if (r?.pin) toast(`${v.teams[t].teamName} 새 PIN: ${r.pin}`);
  }));
  app.querySelectorAll<HTMLButtonElement>('[data-reset-animal]').forEach((b) => (b.onclick = async () => {
    const team = Number(b.dataset.resetAnimal);
    if (!confirm(`${v.teams[team].teamName}의 동물 선택을 초기화할까요?`)) return;
    if (await teacher({ type: 'resetAnimal', team })) toast('동물 선택을 초기화했어요. 해당 팀에서 다시 고를 수 있어요.');
  }));
  app.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((b) => (b.onclick = () => void teacher({ type: 'revealQuestion', questionId: b.dataset.reveal })));
}

// ── 시작 ────────────────────────────────────────────────────
const fromHash = location.hash.slice(1).toUpperCase();
const savedMatch = savedGames().find((g) => g.code === fromHash);
if (savedMatch) openGame(savedMatch); else renderHome();
