/** 공개 뷰에서만 만드는 일시적인 게임 연출. 숨은 덫·히든 스팟 위치를 추측해 싣지 않는다. */
import type { PublicView } from '../../game/views.ts';

export type MomentKind = 'trap' | 'clear' | 'danger' | 'hidden' | 'oasis' | 'zone' | 'bonus';
export interface Moment {
  key: string;
  kind: MomentKind;
  cell: number;
  team: number;
  icon: string;
  title: string;
  detail: string;
  points?: number;
  targetTeam?: number;
  targetCell?: number;
}
export interface BoardEffect extends Moment { startedAt: number; durationMs: number }

const name = (v: PublicView, team: number) => v.teams[team]?.teamName ?? `${team + 1}팀`;
const pos = (v: PublicView, team: number) => v.teams[team]?.pos;
const bonusName = (effect: string) => ({ swap: '점수 교환', drain: '상대 감점', gain: '추가 점수', teleport: '순간이동', stride: '3칸 이동', trap: '추가 덫 설치' } as Record<string, string>)[effect] ?? '히든 보상';

export function momentsForView(v: PublicView): Moment[] {
  if (v.phase !== 'RUNNING') return [];
  if (v.step === 'QUESTION_OPEN') return (v.pendingHighlights ?? []).map((landing) => ({
    key: `${v.round}:landing:${landing.team}:${landing.kind}`, kind: landing.kind,
    cell: landing.cell, team: landing.team,
    icon: landing.kind === 'trap' ? '🪤' : landing.kind === 'oasis' ? '🌴' : '🏁',
    title: landing.kind === 'trap' ? '덫 발견!' : landing.kind === 'oasis' ? '오아시스 진입!' : '상대 출발 구역 진입!',
    detail: `${name(v, landing.team)} · ${landing.kind === 'trap' ? '문제 도전' : '점수 판정 대기'}`
  }));
  if (v.step !== 'ROUND_SUMMARY') return [];
  const landed = new Map(v.events.filter((event) => event.type === 'move').map((event) => [event.team, event.to]));
  return v.events.flatMap((event, index): Moment[] => {
    const key = `${v.round}:event:${index}`;
    const team = 'team' in event ? event.team : -1;
    const cell = event.type === 'hidden' ? event.cell : event.type === 'quiz' || event.type === 'effect' ? landed.get(team) ?? pos(v, team) : pos(v, team);
    if (cell === null || cell === undefined) return [];
    const base = { key, cell, team };
    switch (event.type) {
      case 'hidden': return [{ ...base, kind: 'hidden' as const, icon: '✨', title: '히든 스팟 발견!', detail: `${name(v, team)} · ${bonusName(event.effect)}`, points: event.points || undefined }];
      case 'quiz': return [{ ...base, kind: event.correct ? 'clear' as const : 'danger' as const, icon: event.correct ? '💥' : '⚠️', title: event.correct ? '덫 해제!' : '덫 발동!', detail: `${name(v, team)} · ${event.correct ? '정답' : event.timeout ? '시간 초과' : '오답'}`, points: event.points }];
      case 'oasis': return [{ ...base, kind: 'oasis' as const, icon: '🌴', title: '오아시스 도착!', detail: `${name(v, team)} · ${event.rank}등`, points: event.points }];
      case 'zone': return [{ ...base, kind: 'zone' as const, icon: '🏁', title: '상대 출발 구역 침입!', detail: `${name(v, team)} · 구역 점령`, points: event.points }];
      case 'bonusUsed': return [{ ...base, kind: 'bonus' as const, icon: event.effect === 'trap' ? '🪤' : '⚡', title: `${bonusName(event.effect)} 사용!`, detail: event.target === undefined ? name(v, team) : `${name(v, team)} → ${name(v, event.target)}`, points: event.points,
        targetTeam: event.target, targetCell: event.target === undefined ? undefined : pos(v, event.target) ?? undefined }];
      case 'effect': return [{ ...base, kind: 'danger' as const, icon: '⚠️', title: '특수 덫 발동!', detail: `${name(v, team)} · ${{ return: '귀환', bind: '속박', confuse: '혼란' }[event.effect]}` }];
      default: return [];
    }
  });
}

/** 같은 푸시·재연결에서 효과를 반복하지 않고, 다음 상태의 새 사건만 재생한다. */
export class MomentPlayer {
  private seen = new Set<string>();
  private active: BoardEffect[] = [];
  update(v: PublicView, now: number): Moment[] {
    const fresh = momentsForView(v).filter((moment) => !this.seen.has(moment.key));
    for (const moment of fresh) this.seen.add(moment.key);
    this.active = this.active.filter((effect) => now - effect.startedAt < effect.durationMs);
    this.active.push(...fresh.map((moment) => ({ ...moment, startedAt: now, durationMs: 3200 })));
    return fresh;
  }
  effects(now: number): BoardEffect[] {
    this.active = this.active.filter((effect) => now - effect.startedAt < effect.durationMs);
    return this.active;
  }
}
