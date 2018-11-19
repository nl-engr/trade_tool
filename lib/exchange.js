// ccxtライブラリ
var ccxt = require('ccxt');
var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
var configModule = require(path.join(__dirname, 'config.js'));

class Exchange {
  constructor(env, exchange) {
    // exchange文字列保持
    this.strExchange = exchange;
    // 環境セット
    let config = new configModule(env);
    
    // exchangeオブジェクト
    this.exchange = new ccxt[exchange]({
      'apiKey': config[exchange].ApiKey,
      'secret': config[exchange].ApiSecret,
      'nonce': Date.now, // ← milliseconds nonce
    });
      
    if (CONST.EXCHANGE.BITMEX === exchange) {
      if (config.env === CONST.ENV.TEST) {
        this.exchange.urls['api'] = this.exchange.urls['test']; //テスト用 本番口座の場合は不要
      }
    }
  }
}

module.exports = Exchange;
