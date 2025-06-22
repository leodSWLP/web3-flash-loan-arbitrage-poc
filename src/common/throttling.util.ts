export class ThrottlingUtil {
  static async throttleAsyncFunctions(functions, callsPerSecond) {
    if (
      !Array.isArray(functions) ||
      functions.length === 0 ||
      callsPerSecond <= 0
    ) {
      throw new Error(
        'Invalid input: functions must be a non-empty array and callsPerSecond must be positive',
      );
    }

    const batchSize = 18;
    const delayMs = 1000 / callsPerSecond;
    const results: any[] = [];

    // Process functions in batches
    for (let i = 0; i < functions.length; i += batchSize) {
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
          return { error };
        }
      });

      // Execute batch concurrently
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Wait for the delay to respect the callsPerSecond limit, unless it's the last batch
      if (i + batchSize < functions.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}
