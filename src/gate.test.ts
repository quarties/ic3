import { describe, expect, mock, test } from 'bun:test';
import { CancelledError, RateLimitError, RefusedError, StoppedError } from './errors';
import { createGate, DEFAULT_RETRY_AFTER_MS } from './gate';
import { fakeClock } from './test-helpers';

function setup() {
  const clock = fakeClock();
  const sleep = mock(async (ms: number) => {
    clock.t += ms;
  });
  return { clock, sleep, gate: createGate({ now: clock.now, sleep }) };
}

/** A task that fails with the given errors, then returns "ok". */
const failing = (...errors: Error[]) =>
  mock(async () => {
    const e = errors.shift();
    if (e) throw e;
    return 'ok';
  });

test('a task without errors runs at once', async () => {
  const { gate, sleep } = setup();
  expect(await gate.run(async () => 'ok')).toBe('ok');
  expect(sleep).not.toHaveBeenCalled();
});

describe('429', () => {
  test('waits for Retry-After, then tries again once', async () => {
    const { gate, sleep } = setup();
    const task = failing(new RateLimitError(5_000));
    expect(await gate.run(task)).toBe('ok');
    expect(task).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[5_000]]);
  });

  test('without Retry-After: waits the default time', async () => {
    const { gate, sleep } = setup();
    await gate.run(failing(new RateLimitError(null)));
    expect(sleep.mock.calls).toEqual([[DEFAULT_RETRY_AFTER_MS]]);
  });

  test('the pause applies to the next tasks too', async () => {
    const { gate, sleep } = setup();
    await gate.run(failing(new RateLimitError(5_000)));
    sleep.mockClear();
    await gate.run(async () => 'next');
    expect(sleep).not.toHaveBeenCalled(); // the pause is over: the clock moved 5 s
  });

  test('a second 429 for the same task: stop', async () => {
    const { gate } = setup();
    const task = failing(new RateLimitError(1_000), new RateLimitError(1_000));
    await expect(gate.run(task)).rejects.toBeInstanceOf(StoppedError);
    expect(gate.isStopped()).toBe(true);
  });

  test('a 429 for another task after an earlier 429: stop', async () => {
    const { gate } = setup();
    expect(await gate.run(failing(new RateLimitError(1_000)))).toBe('ok');
    const other = failing(new RateLimitError(1_000));
    await expect(gate.run(other)).rejects.toBeInstanceOf(StoppedError);
    expect(other).toHaveBeenCalledTimes(1);
    expect(gate.isStopped()).toBe(true);
  });

  test('onWait: true during the pause, false after it', async () => {
    const clock = fakeClock();
    const events: string[] = [];
    const sleep = async () => void events.push('sleep');
    const gate = createGate({ now: clock.now, sleep, onWait: (w) => events.push(`wait ${w}`) });
    await gate.run(failing(new RateLimitError(5_000)));
    expect(events).toEqual(['wait true', 'sleep', 'wait false']);
  });

  test('Retry-After longer than 60 s: stop, do not wait', async () => {
    const { gate, sleep } = setup();
    await expect(gate.run(failing(new RateLimitError(120_000)))).rejects.toBeInstanceOf(StoppedError);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('401 and 403', () => {
  test.each([401, 403])('%i: stop at once, no retry', async (status) => {
    const { gate } = setup();
    const task = failing(new RefusedError(status));
    await expect(gate.run(task)).rejects.toThrow(`serwer odmówił (HTTP ${status})`);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test('after a stop, no task runs any more', async () => {
    const { gate } = setup();
    await expect(gate.run(failing(new RefusedError(403)))).rejects.toBeInstanceOf(StoppedError);
    const next = mock(async () => 'ok');
    await expect(gate.run(next)).rejects.toBeInstanceOf(StoppedError);
    expect(next).not.toHaveBeenCalled();
  });
});

test('other errors pass through and do not stop the gate', async () => {
  const { gate } = setup();
  await expect(gate.run(failing(new Error('HTTP 500')))).rejects.toThrow('HTTP 500');
  expect(gate.isStopped()).toBe(false);
});

test('after a pause, a task that nobody needs any more does not run', async () => {
  const { gate } = setup();
  let wanted = true;
  const task = mock(async () => {
    if (task.mock.calls.length === 1) {
      wanted = false; // the user scrolls away during the pause
      throw new RateLimitError(5_000);
    }
    return 'ok';
  });
  await expect(gate.run(task, () => wanted)).rejects.toBeInstanceOf(CancelledError);
  expect(task).toHaveBeenCalledTimes(1);
  expect(gate.isStopped()).toBe(false);
});

describe('limit: at most N requests in a time window', () => {
  function limited() {
    const clock = fakeClock();
    const sleep = mock(async (ms: number) => {
      clock.t += ms;
    });
    return { clock, sleep, gate: createGate({ now: clock.now, sleep, rate: { max: 2, windowMs: 60_000 } }) };
  }
  const ok = async () => 'ok';

  test('the third request waits until the window of the first one ends', async () => {
    const { clock, sleep, gate } = limited();
    await gate.run(ok);
    clock.t += 10_000;
    await gate.run(ok);
    expect(sleep).not.toHaveBeenCalled();
    await gate.run(ok);
    expect(sleep.mock.calls).toEqual([[50_000]]);
  });

  test('the card left the screen during the wait: no request, and no place in the limit used', async () => {
    const { sleep, gate } = limited();
    await gate.run(ok);
    await gate.run(ok);
    const task = mock(ok);
    await expect(gate.run(task, () => false)).rejects.toBeInstanceOf(CancelledError);
    expect(task).not.toHaveBeenCalled();
    sleep.mockClear();
    await gate.run(ok); // the window of the first two ended during the wait
    expect(sleep).not.toHaveBeenCalled();
  });

  test('onWait: true while a request waits for the limit, false after the wait', async () => {
    const clock = fakeClock();
    const events: string[] = [];
    const sleep = async (ms: number) => {
      events.push(`sleep ${ms}`);
      clock.t += ms;
    };
    const onWait = (w: boolean) => events.push(`wait ${w}`);
    const gate = createGate({ now: clock.now, sleep, onWait, rate: { max: 1, windowMs: 60_000 } });
    await gate.run(ok);
    expect(events).toEqual([]);
    await gate.run(ok);
    expect(events).toEqual(['wait true', 'sleep 60000', 'wait false']);
  });

  test('the clock goes back: wait at most one window', async () => {
    const { clock, sleep, gate } = limited();
    await gate.run(ok);
    await gate.run(ok);
    clock.t -= 3_600_000;
    await gate.run(ok);
    expect(Math.max(0, ...sleep.mock.calls.map(([ms]) => ms))).toBeLessThanOrEqual(60_000);
  });
});
