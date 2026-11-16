const SAVE_DELAY = 4000, MAX_WAIT = 20000;
const retryDelay = (n) => Math.round(5000 * 2 ** (n - 1) * (0.7 + Math.random() * 0.6));
export class ReportSaver {
  constructor(report, send, onState, backup) {
    this.report = structuredClone(report); this.send = send; this.onState = onState; this.backup = backup;
    this.revision = 0; this.savedRevision = 0; this.pending = null; this.conflict = false; this.timer = null; this.retries = 0;
    this.firstChangeAt = 0;
  }
  get dirty() { return this.savedRevision !== this.revision; }
  change(content) {
    this.report.content = structuredClone(content); this.revision++; this.retries = 0;
    this.backup(this.report,{synced:false}); this.onState('waiting', '기기에 저장됨 · 서버 저장 대기');
    // Save after a 4s pause, but never wait more than 20s while typing continuously.
    // (Was 1.5s: a class of 30 typing at once flooded the single storage queue.)
    const now = Date.now(); if (!this.firstChangeAt) this.firstChangeAt = now;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), Math.max(0, Math.min(SAVE_DELAY, this.firstChangeAt + MAX_WAIT - now)));
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.conflict) return false;
    if (this.pending) { await this.pending; return this.dirty && !this.conflict ? this.flush() : !this.dirty; }
    if (!this.dirty) return true;
    const revision = this.revision, snapshot = structuredClone(this.report);
    this.firstChangeAt = 0;
    this.onState('saving', '기기에 저장됨 · 서버 저장 중…');
    this.pending = (async () => {
      try {
        const result = await this.send(snapshot);
        this.report.version = result.version; this.report.updatedAt = result.updatedAt;
        this.savedRevision = revision; this.retries = 0;
        this.backup(this.report,{synced:!this.dirty});
        this.onState(this.dirty ? 'waiting' : 'saved', this.dirty ? '기기에 저장됨 · 추가 변경 서버 저장 대기' : '서버와 기기에 저장 완료');
        return true;
      } catch (e) {
        this.conflict = e.status === 409;
        this.onState('error', this.conflict ? '서버본과 충돌 · 기기 복구본은 보존됨' : '인터넷 연결 오류 · 글은 이 기기에 보관됨');
        // Retry only transient failures, with growing, randomized delays so a class
        // doesn't retry in lockstep. Validation/auth errors are not retried.
        const retryable = !e.status || [408, 425, 429, 500, 502, 503, 504].includes(e.status);
        if (!this.conflict && retryable && ++this.retries <= 4) this.timer = setTimeout(() => this.flush(), retryDelay(this.retries));
        return false;
      } finally { this.pending = null; }
    })();
    const ok = await this.pending;
    return ok && this.dirty ? this.flush() : ok;
  }
  stop() { clearTimeout(this.timer); }
}
