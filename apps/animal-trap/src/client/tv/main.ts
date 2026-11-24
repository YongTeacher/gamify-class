/**
 * tv/main.ts — 교실 TV 공용 화면 (DESIGN §8). 읽기 전용: 서버는 TV 열쇠로 어떤 쓰기 명령도 받지 않는다.
 *
 * TV 열쇠는 주소의 #해시(/tv#CODE.KEY)로만 받는다 — 해시는 서버로 전송되지 않는다(암호화는 아님).
 * 읽는 즉시 history.replaceState 로 주소창에서 지우고, 새로고침에 대비해 이 탭(sessionStorage)에만 둔다.
 * 게임 중에는 덫 위치가 없다(tvView 에 아예 실리지 않는다). 종료 후 교사가 공개하면 덫 지도가 온다.
 */
import type { PublicEvent, TvView } from '../../game/views.ts';
import { draw, TEAM_COLORS, type BoardModel } from '../shared/board.ts';
import { MomentPlayer, type Moment } from '../shared/moments.ts';
import { command, Countdown, errText, live, mmss } from '../shared/net.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const app = $('#app');
const SS = 'animal-trap-tv';

function readKey(): { code: string; key: string } | null {
  const m = location.hash.slice(1).match(/^([A-HJ-NP-Z2-9]{6})\.([A-Z2-9]{20,40})$/);
  if (m) {
    history.replaceState(null, '', location.pathname); // 주소창·방문 기록에서 열쇠 제거
    try { sessionStorage.setItem(SS, JSON.stringify({ code: m[1], key: m[2] })); } catch { /* */ }
    return { code: m[1], key: m[2] };
  }
  try { const v = JSON.parse(sessionStorage.getItem(SS) ?? 'null'); if (v && /^[A-HJ-NP-Z2-9]{6}$/.test(v.code) && /^[A-Z2-9]{20,40}$/.test(v.key)) return v; } catch { /* */ }
  return null;
}

let view: TvView | null = null;
let clock: Countdown | null = null;
let lastEventsKey = '';
let idleText = '';
let stopAll: () => void = () => {};
let controlBusy = false;
let noticeTimer: number | undefined;
let momentTimer: number | undefined;
const moments = new MomentPlayer();

// 교사 화면에서 만든 판을 같은 브라우저의 TV 탭으로 열었을 때만 조작한다.
// TV 열쇠만으로는 서버의 교사 명령을 실행할 수 없다.
function hostKey(code: string): string | null {
  try {
    const games: unknown = JSON.parse(localStorage.getItem('animal-trap-teacher') ?? '[]');
    if (!Array.isArray(games)) return null;
    const game = games.find((item) => item && item.code === code);
    return game && typeof game.hostKey === 'string' && /^[A-Z2-9]{20,40}$/.test(game.hostKey) ? game.hostKey : null;
  } catch { return null; }
}

function notice(message: string) {
  const box = document.getElementById('controlNotice'); if (!box) return;
  box.textContent = message; box.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { box.hidden = true; }, 4500);
}

async function teacherCommand(cmd: Record<string, unknown>) {
  if (controlBusy || !view) return;
  const key = hostKey(view.code);
  if (!key) return notice('교사 화면에서 이 판을 다시 열어 주세요.');
  controlBusy = true; renderControls(view);
  const result = await command(`/api/game/${view.code}/teacher`, { 'X-Host-Key': key }, { cmd });
  controlBusy = false;
  if (view) renderControls(view);
  if (!result.ok) notice(errText(result.error));
}

function renderControls(v: TvView) {
  const root = document.getElementById('teacherControls');
  if (!root) return;
  if (!hostKey(v.code)) { root.hidden = true; return; }
  root.hidden = false;
  const button = (label: string, cmd: Record<string, unknown>, danger = false) => ({ label, cmd, danger });
  const actions: ReturnType<typeof button>[] = [];
  if (v.phase === 'LOBBY') actions.push(button(`🎲 출발 자리 추첨 (${v.teams.filter((team) => team.animalId !== null).length}/${v.teams.length})`, { type: 'draw' }));
  if (v.phase === 'DRAWN') actions.push(button('🪤 덫 설치 시작', { type: 'startSetup' }));
  if (v.phase === 'TRAP_SETUP') actions.push(button('⏭ 덫 설치 마감', { type: 'closePhase', target: { phase: 'TRAP_SETUP' } }));
  if (v.phase === 'READY') actions.push(button('🚀 게임 시작', { type: 'startGame' }));
  if (v.phase === 'RUNNING' && v.step === 'MOVE_OPEN') actions.push(button('⏭ 이동 마감', { type: 'closePhase', target: { phase: 'RUNNING', step: 'MOVE_OPEN', round: v.round } }));
  if (v.phase === 'RUNNING' && v.step === 'QUESTION_OPEN') actions.push(button('⏭ 문제 마감', { type: 'closePhase', target: { phase: 'RUNNING', step: 'QUESTION_OPEN', round: v.round } }));
  if (v.phase === 'RUNNING' && v.step === 'ROUND_SUMMARY') actions.push(button('▶ 다음 라운드', { type: 'next', round: v.round }));
  if (v.phase === 'TRAP_SETUP' || v.phase === 'RUNNING') actions.push(v.paused ? button('▶ 재개', { type: 'resume' }) : button('⏸ 일시정지', { type: 'pause' }));
  if (['DRAWN', 'TRAP_SETUP', 'READY', 'RUNNING'].includes(v.phase)) actions.push(button('■ 게임 종료', { type: 'finish' }, true));
  if (v.phase === 'FINISHED') actions.push(button('📖 문제 복습', { type: 'review' }));
  if (v.phase === 'FINISHED' || v.phase === 'REVIEW') {
    actions.push(button(v.trapMap ? '🗺 덫 지도' : '🗺 덫 지도 공개', { type: 'revealTraps' }));
    actions.push(button('🏆 순위 보기', { type: 'showRanking' }));
  }
  root.innerHTML = `<div class="control-title"><b>교사 진행</b><span>${v.phase === 'TRAP_SETUP' ? `설치 확정 ${v.teams.filter((team) => team.status.setupConfirmed).length}/${v.teams.length}` : '이 브라우저에서만 조작'}</span></div><div class="control-actions"></div><p id="controlNotice" class="control-notice" role="status" hidden></p>`;
  const list = root.querySelector('.control-actions')!;
  for (const action of actions) {
    const el = document.createElement('button');
    el.textContent = action.label;
    el.className = action.danger ? 'danger' : '';
    el.disabled = controlBusy || (action.cmd.type === 'draw' && v.teams.some((team) => team.animalId === null)) || (v.paused && !['resume', 'finish'].includes(String(action.cmd.type)));
    el.onclick = () => {
      if (action.danger && !confirm('게임을 지금 끝낼까요? 진행 중인 라운드는 취소됩니다.')) return;
      void teacherCommand(action.cmd);
    };
    list.append(el);
  }
}

function waitScreen(msg: string) {
  app.style.display = 'block';
  app.innerHTML = `<div class="wait"><div><div style="font-size:4rem">📺</div><h1>애니멀 트랩 TV</h1><p class="muted">${esc(msg)}</p></div></div>`;
}

// ── 배경 음악: 브라우저 자동재생 제한 때문에 버튼을 눌러야 시작 ────────────
const bgm = new Audio('/audio/bgm.mp3'); bgm.loop = true; bgm.volume = 0.35;
function toggleBgm() { if (bgm.paused) void bgm.play().catch(() => {}); else bgm.pause(); renderTools(); }

function renderTools() {
  const t = document.getElementById('tools'); if (!t) return;
  t.innerHTML = `<button id="music" aria-pressed="${!bgm.paused}">${bgm.paused ? '🔈 음악 켜기' : '🔊 음악 끄기'}</button>
    <input id="vol" type="range" min="0" max="1" step="0.05" value="${bgm.volume}" aria-label="음악 크기">
    <button id="fs">${document.fullscreenElement ? '↙ 전체화면 끝' : '⛶ 전체화면'}</button>`;
  (document.getElementById('music') as HTMLButtonElement).onclick = toggleBgm;
  (document.getElementById('vol') as HTMLInputElement).oninput = (e) => { bgm.volume = Number((e.target as HTMLInputElement).value); };
  (document.getElementById('fs') as HTMLButtonElement).onclick = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); };
}
document.addEventListener('fullscreenchange', renderTools);

function shell() {
  app.style.display = '';
  app.innerHTML = `
    <div class="stage"><canvas class="board" id="board" role="img" aria-label="공용 게임판"></canvas><div id="impact" class="impact" aria-live="polite"></div><div id="overlay"></div></div>
    <aside class="side">
      <div class="title"><h1 id="title"></h1><span class="code" id="code"></span></div>
      <div class="clocks"><div class="card"><div class="lbl">남은 게임 시간</div><b id="mainClock">--:--</b></div><div class="card step" id="stepBox"><div class="lbl" id="stepLabel"></div><b id="phaseClock"></b></div></div>
      <div style="display:grid;gap:1.2vh;min-height:0;grid-template-rows:auto 1fr"><ol class="board-list" id="scores"></ol><ul class="feed" id="feed"></ul></div>
      <section class="teacher-controls" id="teacherControls" aria-label="교사 진행 도구" hidden></section>
      <div class="tools" id="tools"></div>
    </aside>`;
  renderTools();
}

const STEP: Record<string, string> = { MOVE_OPEN: '이동 고르는 중', QUESTION_OPEN: '문제 풀이', ROUND_SUMMARY: '라운드 결과' };
const PHASE: Record<string, string> = { LOBBY: '입장 대기', DRAWN: '출발 구역 추첨', TRAP_SETUP: '덫 설치 중', READY: '곧 시작', FINISHED: '게임 끝', REVIEW: '문제 복습' };
const bonusName = (effect: string) => ({ swap: '점수 교환', drain: '상대 점수 감점', gain: '추가 점수', teleport: '순간이동', stride: '3칸 이동', trap: '추가 덫 설치' } as Record<string, string>)[effect] ?? '히든 보상';

function showMoments(fresh: Moment[]) {
  const root = document.getElementById('impact'); if (!root || !fresh.length) return;
  const visible = fresh.slice(0, 4);
  root.innerHTML = visible.map((moment, i) => `<div class="impact-card ${moment.kind}" style="--team:${TEAM_COLORS[moment.team]};--delay:${i * 80}ms">
    <span class="impact-icon" aria-hidden="true">${moment.icon}</span><span class="impact-copy"><strong>${esc(moment.title)}</strong><small>${esc(moment.detail)}</small></span>
    ${moment.points === undefined ? '' : `<b class="impact-points">${moment.points > 0 ? '+' : ''}${moment.points}</b>`}</div>`).join('')
    + (fresh.length > visible.length ? `<div class="impact-more">그 외 ${fresh.length - visible.length}건은 오른쪽 기록을 확인하세요</div>` : '');
  clearTimeout(momentTimer);
  momentTimer = window.setTimeout(() => { root.innerHTML = ''; }, 3200);
}

function eventText(v: TvView, e: PublicEvent): string | null {
  const a = (t: number) => `${v.teams[t].animal.emoji} ${esc(v.teams[t].teamName)}`;
  const p = (n: number) => `<span style="color:${n >= 0 ? 'var(--ok)' : 'var(--danger)'}">${n >= 0 ? '+' : '−'}${Math.abs(n)}</span>`;
  switch (e.type) {
    case 'quiz': return `<li><span>${a(e.team)} ${e.correct ? '🎉 정답! 덫 제거' : e.timeout ? '⏰ 시간 초과' : '😵 오답'}</span>${p(e.points)}</li>`;
    case 'oasis': return `<li><span>${a(e.team)} 🌴 오아시스 ${e.rank}등!</span>${p(e.points)}</li>`;
    case 'zone': return `<li><span>${a(e.team)} 🏁 다른 출발 구역</span>${p(e.points)}</li>`;
    case 'zonePenalty': return `<li><span>${a(e.attacker)} 🚨 ${a(e.team)} 출발 구역 침입</span>${p(e.points)}</li>`;
    case 'effect': return `<li><span>${a(e.team)} ${{ return: '🌀 귀환!', bind: '⛓️ 속박!', confuse: '🌫️ 혼란!' }[e.effect]}</span><span></span></li>`;
    case 'hidden': return `<li><span>${a(e.team)} ✨ 히든 스팟 · ${bonusName(e.effect)}</span><span>${e.points ? p(e.points) : '획득'}</span></li>`;
    case 'bonusUsed': return `<li><span>${a(e.team)} ⚡ ${bonusName(e.effect)} 사용${e.target === undefined ? '' : ' → ' + a(e.target)}</span><span>${e.points ? p(e.points) : ''}</span></li>`;
    default: return null;
  }
}

function render() {
  const v = view; if (!v) return;
  if (!document.getElementById('board')) shell();
  $('#title').textContent = v.title;
  $('#code').textContent = v.code;
  const box = $('#stepBox'); box.className = 'card step' + (v.paused ? ' paused' : '');
  $('#stepLabel').textContent = v.paused ? '⏸ 잠시 멈춤' : v.phase === 'RUNNING' ? `${v.round}라운드 · ${STEP[v.step ?? '']}` : PHASE[v.phase];
  // 단계 시계가 없을 때 초록 칸이 비지 않게 — 큰 글씨로 지금 상황
  const joined = v.teams.filter((t) => t.status.joined).length;
  const picked = v.teams.filter((t) => t.animalId !== null).length;
  idleText = v.paused ? '⏸' : v.phase === 'LOBBY' ? `${joined}/${v.teams.length} 입장 · ${picked}/${v.teams.length} 선택` : v.phase === 'DRAWN' ? '추첨 완료' : v.phase === 'READY' ? '곧 시작' : v.phase === 'RUNNING' && v.step === 'ROUND_SUMMARY' ? '결과 발표' : v.phase === 'FINISHED' ? '🏁' : v.phase === 'REVIEW' ? '📖' : '';
  const order = [...v.teams].sort((a, b) => a.rank - b.rank || a.team - b.team);
  const status = (t: TvView['teams'][number]) => {
    if (v.phase === 'TRAP_SETUP') return t.status.setupConfirmed ? '설치 확정' : '설치 중';
    if (v.phase === 'LOBBY') return t.animalId !== null ? `${t.animal.emoji} 선택` : t.status.joined ? '선택 중' : '대기';
    if (v.phase === 'DRAWN') return '자리 추첨 완료';
    if (v.phase !== 'RUNNING') return t.oasisRank ? `🌴 ${t.oasisRank}등` : '';
    const s: string[] = [];
    if (v.step === 'MOVE_OPEN') s.push(t.status.boundLeft ? '⛓️ 속박' : t.status.moved ? '✔ 이동' : '…');
    if (v.step === 'QUESTION_OPEN' && t.status.quiz !== 'none') s.push(t.status.quiz === 'pending' ? '❓ 문제 중' : '✔ 답함');
    if (t.status.confusedLeft) s.push('🌫️');
    if (t.oasisRank) s.push(`🌴${t.oasisRank}`);
    return s.join(' ');
  };
  const activeTeams = new Set(moments.effects(performance.now()).flatMap((moment) => moment.targetTeam === undefined ? [moment.team] : [moment.team, moment.targetTeam]));
  $('#scores').innerHTML = order.map((t) => `<li class="${activeTeams.has(t.team) ? 'score-impact' : ''}" style="--c:${TEAM_COLORS[t.team]}"><span class="rk">${t.rank}</span><span class="an" aria-hidden="true">${t.animal.emoji}</span><span>${esc(t.teamName)}</span><span class="st">${status(t)}</span><span class="sc">${t.score}</span></li>`).join('');
  // 라운드 사건(결과 단계에서만, 새 라운드일 때만 다시 그려 애니메이션)
  const key = `${v.round}:${v.step}:${v.events.length}`;
  if (key !== lastEventsKey) {
    lastEventsKey = key;
    $('#feed').innerHTML = v.phase === 'RUNNING' && v.step === 'ROUND_SUMMARY' ? v.events.map((e) => eventText(v, e)).filter(Boolean).slice(0, 6).join('') : '';
  }
  $('#overlay').innerHTML = overlay(v);
  if (v.phase !== 'RUNNING') { clearTimeout(momentTimer); const impact = document.getElementById('impact'); if (impact) impact.innerHTML = ''; }
  renderControls(v);
  tickClock();
}

function overlay(v: TvView): string {
  if (v.phase === 'LOBBY') return `<div class="overlay"><div class="box"><h2>🌴 동물 선착순 선택</h2><p style="font-size:3vh;margin:0 0 2.4vh">팀 QR로 입장해 원하는 동물을 먼저 선택하세요. 모두 고르면 출발 자리를 추첨합니다.</p>
    <div class="join"><div><div class="muted">학생 주소</div><b>${esc(location.host)}</b></div><div><div class="muted">판 코드</div><b class="codebig">${esc(v.code)}</b></div></div></div></div>`;
  // 종료 후에는 교사가 고른 것(순위 / 덫 지도 / 문항 하나)만 띄운다
  const d = v.reviewDisplay;
  const focusQ = d.mode === 'question' ? v.reviewQuestions.find((x) => x.id === d.questionId) : undefined;
  if (focusQ) {
    const q = focusQ;
    return `<div class="overlay"><div class="box"><div class="muted" style="font-size:2.4vh">📖 복습 · ${esc(q.level)}</div><h2 style="font-size:4vh">${esc(q.text)}</h2>
      <ol>${q.choices.map((c, i) => `<li class="${i + 1 === q.answer ? 'ans' : ''}">${esc(c)}${i + 1 === q.answer ? ' ✔' : ''}</li>`).join('')}</ol>${q.explanation ? `<p class="muted" style="font-size:2.4vh">${esc(q.explanation)}</p>` : ''}</div></div>`;
  }
  if (v.phase === 'FINISHED' || v.phase === 'REVIEW') {
    if (d.mode === 'map' && v.trapMap) return '';
    const winners = v.teams.filter((t) => t.rank === 1);
    const order = [...v.teams].sort((a, b) => a.rank - b.rank || a.team - b.team);
    return `<div class="overlay"><div class="box"><div class="big" aria-hidden="true">🏆 ${winners.map((w) => w.animal.emoji).join(' ')}</div><h2>${winners.length > 1 ? '공동 우승!' : '우승!'} ${winners.map((w) => esc(w.teamName)).join(' · ')}</h2>
      <p style="font-size:2.6vh;margin:0 0 1.6vh">${winners[0]?.score ?? 0}점 · ${v.endReason === 'manual' ? '선생님이 게임을 마쳤어요' : '시간 종료'}</p>
      <table class="summary"><thead><tr><th>순위</th><th>팀</th><th>정답</th><th>오답</th><th>다른 구역</th><th>🌴</th><th>점수</th></tr></thead><tbody>${order.map((t) => `<tr><td>${t.rank}</td><td>${t.animal.emoji} ${esc(t.teamName)} · ${esc(t.animal.name)}</td><td>${t.summary?.correct ?? 0}</td><td>${t.summary?.wrong ?? 0}</td><td>${t.summary?.zones ?? 0}</td><td>${t.summary?.oasisRank ?? '–'}</td><td><b>${t.score}</b></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  return '';
}

function tickClock() {
  if (!clock) return;
  const m = document.getElementById('mainClock'); if (m) m.textContent = mmss(clock.mainLeft());
  const p = document.getElementById('phaseClock'); const l = clock.phaseLeft();
  if (p) { p.textContent = l === null ? idleText : mmss(l); p.classList.toggle('idle', l === null); }
}

function boardModel(v: TvView): BoardModel {
  // 이번 라운드에 움직인 동물은 반짝임으로 강조
  const moved = new Set(v.phase === 'RUNNING' && v.step !== 'MOVE_OPEN' ? v.events.filter((e) => e.type === 'move').map((e) => (e as { team: number }).team) : []);
  return { animals: v.teams.map((t) => ({ team: t.team, emoji: t.animal.emoji, pos: t.pos, highlight: moved.has(t.team) })), zones: v.teams.map((t) => t.zone), trapMap: v.trapMap, revealedSpots: v.revealedSpots, effects: moments.effects(performance.now()) };
}

// ── 시작 ────────────────────────────────────────────────────
const cred = readKey();
if (!cred) waitScreen('교사 화면의 ‘TV 화면 열기’로 열어 주세요.');
else {
  waitScreen('연결 중…');
  live<TvView>({
    code: cred.code,
    hello: () => ({ role: 'tv', key: cred.key }),
    onState: (v) => { const fresh = moments.update(v, performance.now()); view = v; clock = Countdown.of(v); render(); showMoments(fresh); },
    onStatus: (up) => { $('#banners').innerHTML = up ? '' : '<div class="banner off">연결이 끊겼어요. 다시 연결하는 중…</div>'; },
    onClosedForGood: (code) => { if (code === 4003) { waitScreen('같은 판의 TV 화면이 너무 많이 열려 이 화면의 연결을 끊었어요. 새로 고치면 다시 연결돼요.'); return; } stopAll(); try { sessionStorage.removeItem(SS); } catch { /* */ } view = null; waitScreen('TV 열쇠가 바뀌었어요. 교사 화면에서 ‘TV 화면 열기’를 다시 눌러 주세요.'); }
  });
  const timer = window.setInterval(tickClock, 250);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let last = 0, raf = 0;
  const loop = (t: number) => { const c = document.getElementById('board') as HTMLCanvasElement | null; if (c && view && (!reduce.matches ? t - last > 80 : t - last > 1000)) { draw(c, boardModel(view), t); last = t; } raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  // 열쇠가 무효가 되면 음악·시계·그리기를 모두 멈춘다
  stopAll = () => { bgm.pause(); clearInterval(timer); clearTimeout(momentTimer); cancelAnimationFrame(raf); };
}
