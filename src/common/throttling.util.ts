import { LogUtil } from '../log/log.util';

export class ThrottlingUtil {
  static async throttleAsyncFunctions(
    functions: (() => Promise<any>)[],
    callsPerSecond: number = 18,
    isImmediateReturn: boolean | undefined = false,
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
      const startTime = performance.now();
      LogUtil.debug(`throttleAsyncFunctions(): execute batch from index ${i}`);
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

      const waitTime = performance.now() - (startTime + delayMs);
      if (!isImmediateReturn && waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    return results;
  }
}
