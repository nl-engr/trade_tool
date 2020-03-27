const path = require('path');
const moment = require('moment')
const CONST = require(path.join(__dirname, 'const.js'));
const processor = require(path.join(__dirname, 'processor.js'));
const exchangeModule = require(path.join(__dirname, 'exchange.js'));
const orderModule = require(path.join(__dirname, 'order.js'));
const Base = require(path.join(__dirname, 'base.js'));
const jsonRW = require(path.join(__dirname, 'jsonRW.js'));
const STATE = path.join(__dirname, '../config/state.json');
const PRICE = path.join(__dirname, '../data/price.json');
const POSITION = path.join(__dirname, '../data/position.json');
const BALANCE = path.join(__dirname, '../data/balance.json');

class Cron extends Base {
  constructor(rtm, obj) {
    super();
    this.log('Cron New');
  }

  // 現在の保有BTC総量を取得
  async fetchTotalBalance_bitmex() {
    this.log('method fetchTotalBalance_bitmex');
    let result = {};
    while (maxRetryCnt > 0) {
      result = await this.order.fetchBalance(this.exchange);
      if (result.e) await this.retryProcess(result.e);
      if (result.value) break;
    }
    maxRetryCnt = CONST.MAX_RETRY_CNT; // リトライ回数リセット
    if (result.value) { // 加工
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      this.total_collateral = result.value[CONST.SYMBOL_BTC].total;
      // priceファイル読み込み
      let balanceData = jsonRW.readJson(BALANCE);
      let balance = balanceData[this.exchange.id][CONST.SYMBOL_BTC].total_collateral;
      jsonRW.updateJson_state(this.exchange.id, CONST.SYMBOL_BTC, 'total_collateral', result.value[CONST.SYMBOL_BTC].total, BALANCE);
      return this.commonLogProcess(result, CONST.MSG_GET_BALANCE).value;
    } else {
      return this.commonLogProcess(result, CONST.MSG_GET_BALANCE);
    }
  }


}

module.exports = Cron;
