import { LogUtil } from '../log/log.util';

export class ThrottlingUtil {
  static async throttleAsyncFunctions(
    functions: (() => Promise<any>)[],
    callsPerSecond: number = 18,
  ): Promise<{ result?: any; error?: Error }[]> {
    LogUtil.debug(
      `throttleAsyncFunctions(): functions length: ${functions.length}`,
    );

    if (
      !Array.isArray(functions) ||
      functions.length === 0 ||
      callsPerSecond <= 0
    ) {
      throw new Error(
        'Invalid input: functions must be a non-empty array and callsPerSecond must be positive',
      );
    }

    const batchSize = callsPerSecond;
    const delayMs = 1000;
    const results: { result?: any; error?: Error }[] = [];

    for (let i = 0; i < functions.length; i += batchSize) {
      LogUtil.debug(`throttleAsyncFunctions(): execute batch ${i}`);
      const batch = functions.slice(
        i,
        Math.min(i + batchSize, functions.length),
      );

      const batchPromises = batch.map(async (func, index) => {
        if (typeof func !== 'function') {
          return {
            error: new Error(`Element at index ${i + index} is not a function`),
          };
        }
        try {
          const result = await func();
          return { result };
        } catch (error) {
          return { error: error as Error };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + batchSize < functions.length) {
        const now = Date.now();
        const nextSecond = Math.ceil(now / delayMs) * delayMs;
        const waitTime = nextSecond - now;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    return results;
  }
}
