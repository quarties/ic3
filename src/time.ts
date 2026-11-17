/** "2026-11-15 09:53:00" -> "202611150953" (the format of the seat-map API). */
export const apiTime = (dateTime: string): string => dateTime.replace(/[-: ]/g, '').slice(0, 12);

/** "2026-11-15 09:53:00" -> "2026-11-15" */
export const datePart = (dateTime: string): string => dateTime.slice(0, 10);

/** "2026-11-15 09:53:00" -> "09:53" */
export const hhmm = (dateTime: string): string => dateTime.slice(11, 16);

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
