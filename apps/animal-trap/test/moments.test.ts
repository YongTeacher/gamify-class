import test from 'node:test';
import assert from 'node:assert/strict';
import { MomentPlayer, momentsForView } from '../src/client/shared/moments.ts';
import type { PublicView } from '../src/game/views.ts';

const makeView = (step: PublicView['step'], events: PublicView['events'] = []): PublicView => ({
  phase: 'RUNNING', step, round: 3, events,
  pendingHighlights: step === 'QUESTION_OPEN' ? [{ team: 0, cell: 34, kind: 'trap' }] : [],
  teams: [
    { team: 0, teamName: '여우', pos: 34, status: { quiz: 'pending' } },
    { team: 1, teamName: '토끼', pos: 35, status: { quiz: 'none' } }
  ]
} as PublicView);

test('덫 착지 순간에는 공개된 팀 위치에서만 연출하고, 같은 상태 푸시에서는 반복하지 않는다', () => {
  const v = makeView('QUESTION_OPEN');
  const player = new MomentPlayer();
  const first = player.update(v, 1000);
  assert.deepEqual(first.map((moment) => [moment.kind, moment.cell, moment.team]), [['trap', 34, 0]]);
  assert.deepEqual(player.update(v, 1100), []);
  assert.equal(player.effects(2000).length, 1);
  assert.equal(player.effects(4300).length, 0);
});

test('다른 팀이 문제를 푸는 동안에도 오아시스와 상대 출발 구역 진입을 바로 알린다', () => {
  const v = makeView('QUESTION_OPEN');
  v.pendingHighlights.push({ team: 1, cell: 120, kind: 'oasis' }, { team: 1, cell: 16, kind: 'zone' });
  assert.deepEqual(momentsForView(v).map((moment) => [moment.kind, moment.cell]), [['trap', 34], ['oasis', 120], ['zone', 16]]);
});

test('라운드 사건은 덫·히든 스팟·오아시스·상대 구역·능력 사용을 서로 다른 위치와 이름으로 표시한다', () => {
  const v = makeView('ROUND_SUMMARY', [
    { type: 'move', team: 0, from: 18, to: 50 },
    { type: 'quiz', team: 0, correct: false, timeout: false, points: -2 },
    { type: 'hidden', team: 0, cell: 66, effect: 'swap', points: 0 },
    { type: 'oasis', team: 0, rank: 1, points: 30 },
    { type: 'zone', team: 1, zone: 0, points: 10 },
    { type: 'bonusUsed', team: 0, effect: 'swap', target: 1 }
  ]);
  const cues = momentsForView(v);
  assert.deepEqual(cues.map((moment) => moment.kind), ['danger', 'hidden', 'oasis', 'zone', 'bonus']);
  assert.equal(cues[0].cell, 50, '귀환 덫에 걸려 현재 위치가 바뀌어도 착지 칸에 표시');
  assert.equal(cues[1].cell, 66);
  assert.equal(cues[4].targetCell, 35);
  assert.equal(cues[4].targetTeam, 1);
  const player = new MomentPlayer();
  assert.equal(player.update(v, 1000).length, 5);
  assert.deepEqual(player.update(v, 1200), []);
  v.events.push({ type: 'bonusUsed', team: 1, effect: 'drain', target: 0, points: -10 });
  assert.deepEqual(player.update(v, 1300).map((moment) => moment.title), ['상대 감점 사용!']);
});
