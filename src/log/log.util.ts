import { ConfigUtil } from '../config/config.util';

export class LogUtil {
  static debug(...args) {
    if (ConfigUtil.getConfig().DEBUG) {
      console.log(...args);
    }
  }

  static info(...args) {
    console.log(...args);
  }
}
