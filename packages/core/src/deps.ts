export interface Deps {
  newId(): string;
  now(): string;
}

// Production: random ids + wall clock.
export function realDeps(): Deps {
  return {
    newId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  };
}

// Tests: deterministic incrementing ids + fixed clock.
export function testDeps(): Deps {
  let n = 0;
  return {
    newId: () => `id${++n}`,
    now: () => "2026-01-01T00:00:00.000Z",
  };
}
