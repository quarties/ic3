import { expect, test } from 'bun:test';
import { createQueue } from './queue';

test('runs tasks one at a time, in order', async () => {
  const enqueue = createQueue();
  const log: string[] = [];
  const task = (name: string, ms: number) => () =>
    new Promise<string>((resolve) => {
      log.push(`start ${name}`);
      setTimeout(() => {
        log.push(`end ${name}`);
        resolve(name);
      }, ms);
    });

  const results = await Promise.all([enqueue(task('a', 20)), enqueue(task('b', 1))]);
  expect(results).toEqual(['a', 'b']);
  expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
});

test('a failed task does not stop the next task', async () => {
  const enqueue = createQueue();
  const failed = enqueue(async () => {
    throw new Error('x');
  });
  const next = enqueue(async () => 'ok');
  await expect(failed).rejects.toThrow('x');
  expect(await next).toBe('ok');
});
