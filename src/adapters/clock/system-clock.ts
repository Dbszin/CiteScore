import type { Clock } from '../../core/ports/clock.js';

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** Relogio fixo para teste de janela de tempo. */
export class FixedClock implements Clock {
  constructor(private current: number) {}

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}
