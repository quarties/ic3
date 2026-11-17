export type Enqueue = <T>(task: () => Promise<T>) => Promise<T>;

/** Run async tasks one at a time, in the order they come. A failed task does not stop the queue. */
export function createQueue(): Enqueue {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const result = tail.then(task, task);
    tail = result.catch(() => {});
    return result;
  };
}
