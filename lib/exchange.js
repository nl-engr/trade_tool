// ccxtライブラリ
var ccxt = require('ccxt');
var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
var configModule = require(path.join(__dirname, 'config.js'));

class Exchange {
  constructor(obj) {
    // 環境セット
    let config = new configModule(obj.env);
    // exchangeオブジェクト
    this.exchange = new ccxt[obj.exchange]({
      'apiKey': config[obj.exchange].ApiKey,
      'secret': config[obj.exchange].ApiSecret,
      'nonce': Date.now, // ← milliseconds nonce
    });

    if (CONST.EXCHANGE.BITMEX === obj.exchange) {
      if (config.env === CONST.ENV.TEST) {
        this.exchange.urls['api'] = this.exchange.urls['test']; //テスト用 本番口座の場合は不要
      }
    }
  }
}

module.exports = Exchange;
