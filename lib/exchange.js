// ccxtライブラリ
var ccxt = require('ccxt');
var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
var configModule = require(path.join(__dirname, 'config.js'));

class Exchange {
  constructor(env) {
    // 環境セット
    this.config = new configModule(env);
    
    // bitmexオブジェクト
    this.bitmex = new ccxt.bitmex({
      'apiKey': this.config.bitmex.ApiKey,
      'secret': this.config.bitmex.ApiSecret
    });

    if (this.config.env === CONST.ENV_TEST) {
      this.bitmex.urls['api'] = this.bitmex.urls['test']; //テスト用 本番口座の場合は不要
    }

    // bitflyerオブジェクト
    this.bitflyer = new ccxt.bitflyer({
      'apiKey': this.config.bitflyer.ApiKey,
      'secret': this.config.bitflyer.ApiSecret
    });
  }
}

module.exports = Exchange;
