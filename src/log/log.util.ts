export class LogUtil {
  static debug(...args) {
    if (process.env.DEBUG) {
      console.log(...args);
    }
  }

  static info(...args) {
    console.log(...args);
  }
}
