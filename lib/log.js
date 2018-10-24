var path = require('path');
var log4js = require('log4js');
var CONST = require(path.join(__dirname, 'const.js'));

log4js.configure(require(path.join(__dirname, '../config/log4js.json')), { reloadSecs: 300 });

class Log {
  constructor(logLevel) {
    this.logLevel = logLevel ? logLevel : 'system';
    // 出力するカテゴリの指定
    this.logger = log4js.getLogger(this.logLevel);
  }
  
  commonLogProcess(result, message) {
    // 成功時
    if (result.value) {
      message += CONST.MSG_STATUS_SUCCESS + CONST.CRLF + JSON.stringify(result.value);
      this.log(message);
    }
    // 失敗時
    if (result.e !== undefined) {
      message += CONST.MSG_STATUS_FAILED + CONST.CRLF + result.e;
      this.errorLog(message);
    }
    result.message = message;
    return result;
  }
  
  log(msg) {
    this.logger.info(msg);
  }
  
  retLog(msg) {
    this.logger.info(msg);
    return msg;
  }
  
  errorLog(msg) {
    this.logger.error(msg);
  }
// logger.trace('Entering cheese testing');
// logger.debug('Got cheese.');
// logger.info('Cheese is Gouda.');
// logger.warn('Cheese is quite smelly.');
// logger.error('Cheese is too ripe!');
// logger.fatal('Cheese was breeding ground for listeria.');
}

module.exports = Log;