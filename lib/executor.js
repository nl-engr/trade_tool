// require('dotenv').config();
var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
var processor = require(path.join(__dirname, 'processor.js'));
var exchangeModule = require(path.join(__dirname, 'exchange.js'));
var orderModule = require(path.join(__dirname, 'order.js'));
var logModule = require(path.join(__dirname, 'log.js'));
var log = new logModule();

var LEVERAGE = 0;
var LEVERAGE_ALT = 0;
var maxRetryCnt = 4;

class Executor {
  constructor(env) {
    log.log('Executor New');
    this.WHOLE_LOT_RATE = 0.8; // ロット_割合(全体)
    this.LOT_RATE = this.WHOLE_LOT_RATE/2; // ロット_割合
    this.LEVERAGE = LEVERAGE ? LEVERAGE : 10;    // レバレッジ設定
    this.LEVERAGE_ALT = LEVERAGE_ALT ? LEVERAGE_ALT : this.LEVERAGE/4; // レバレッジ設定(アルト)
    // 取引所モジュールをNew
    this.exchange = new exchangeModule(env);
    // オーダーモジュール
    this.order = new orderModule();
    this.env = env;
    this.throughFlg = false;
  }
  
  async doten(symbol, sign) {
    log.log('method doten');
    let message = '';
    // 環境変数セット
    this.symbol = symbol;
    this.sign = sign;
    // オープンOrderがあればキャンセル
    await this.fetchAndCancelOpenOrder();
    // QTYを計算
    await this.calculateQty();
    // ドテン処理実行
    message = await this.dotenProcess();
    return message;
  }
  
  async dotenProcess() {
    log.log('method dotenProcess');
    let message = '';
    // 買いアラート時
    if (this.sign === CONST.SIGN_LONG ) {
      message = await this.buyLogic();
    }
    // 売りアラート時
    if (this.sign === CONST.SIGN_SHORT ) {
      message = await this.sellLogic();
    }
    if (this.throughFlg) {
      message = CONST.MSG_DOTEN_THROUGH;
    }
    return message;
  }
  
  async calculateQty() {
    log.log('method calculateQty');
    // 最終価格を取得
    this.last = await this.fetchTickerLast();
    // ポジションを取得
    this.pos = await this.getPositions();
    // BTCトータルバランスを取得
    this.total_btc = await this.fetchTotalBalance();
    // QTYを取得
    await this.setQty();
  }
  
  async setLeverage(leverage) {
    log.log('method setLeverage');
    let result = await this.order.setLeverage(this.exchange.bitmex, processor.getSymbolPairPosition(this.symbol), leverage);
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+' x'+value.leverage;
      if (CONST.SYMBOL_BTC === this.symbol) {
        LEVERAGE = value.leverage;
      } else {
        LEVERAGE_ALT = value.leverage;
      }
    }
    return log.commonLogProcess(result, CONST.MSG_CHANGE_LEVERAGE).message;
  }
  
  async fetchOpenOrders() {
    log.log('method fetchOpenOrders');
    let result = await this.order.fetchOpenOrders(this.exchange.bitmex, processor.getSymbolPair(this.symbol));
    return log.commonLogProcess(result, CONST.MSG_GET_OPEN_ODERS).value;
  }
  
  async cancelOrder(id) {
    log.log('method cancelOrder');
    let result = await this.order.cancelOrder(new exchangeModule(this.env).bitmex, id);
    return log.commonLogProcess(result, CONST.MSG_CANCEL_ODER).value;
  }
  
  async fetchAndCancelOpenOrder() {
    log.log('method fetchAndCancelOpenOrder');
    // オープンOrderを取得
    let orders = await this.fetchOpenOrders();
    orders.filter((order, idx) => {
      // オープンOrderをキャンセル
      this.cancelOrder(order.id);
    });
  }
  
  // 最終価格を取得する
  async fetchTickerLast() {
    log.log('method fetchTickerLast');
    let result = await this.order.fetchTicker(this.exchange.bitmex, processor.getSymbolPair(this.symbol), 'last');
    return log.commonLogProcess(result, CONST.MSG_GET_LAST_PRICE).value;
  }

  // 現在の保有BTC総量を取得
  async fetchTotalBalance() {
    log.log('method fetchTotalBalance');
    let retValue = await this.order.fetchBalance(this.exchange.bitmex);
    return log.commonLogProcess(retValue, CONST.MSG_GET_BALANCE).value;
  }
  
  // 全ポジションの数量(USD)取得
  async getPositions() {
    log.log('method getPositions');
    let side = null;
    let result = await this.order.getPositions(this.exchange.bitmex);
    if (result.e && maxRetryCnt > 0) { 
      maxRetryCnt--;
      return log.commonLogProcess(result, CONST.MSG_GET_POS_INFO).e;
    }
    let value = result.value;
    if (!value || value.length === 0) {
      console.log('bbb');
      result.value = {'side': null, 'currentQty': 0, 'avgEntryPrice': null, 'liquidationPrice': null};
    } else { // 加工
      console.log('ccc');
      let pos = null;
      let value = result.value;
      value.filter((position, idx) => {
        if (position.symbol === processor.getSymbolPairPosition(this.symbol)) {
          pos = position;
        }
      });
      if (pos) {
        side = (pos.currentQty === 0) ? null : (pos.currentQty > 0) ? CONST.SIGN_LONG : CONST.SIGN_SHORT;
        result.value = {'side': side, 'currentQty': Math.round(pos.currentQty), 'avgEntryPrice': pos.avgEntryPrice, 'liquidationPrice': pos.liquidationPrice};
      } else {
        result.value = {'side': null, 'currentQty': 0, 'avgEntryPrice': null, 'liquidationPrice': null};
      }
    }
    return log.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
  }

  // 指値買い
  async limitBuy(amount, price) {
    log.log('method limitBuy');
    let result = await this.order.marketBuy(this.exchange.bitmex, processor.getSymbolPair(this.symbol), amount, price);
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-'+Math.round(value.info.simpleCumQty*100)/100 + CONST.STR_COIN + CONST.CRLF;
    }
    return log.commonLogProcess(result, CONST.MSG_LIMIT_BUY);
  }
  
  // 指値売り
  async limitSell(amount, price) {
    log.log('method limitSell');
    let result = await this.order.limitSell(this.exchange.bitmex, processor.getSymbolPair(this.symbol), amount, price);
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-'+Math.round(value.info.simpleCumQty*100)/100 + CONST.STR_COIN + CONST.CRLF;
    }
    return log.commonLogProcess(result, CONST.MSG_LIMIT_SELL).message;
  }
  
  // 成行買い
  async marketBuy(amount) {
    log.log('method marketBuy');
    let result = await this.order.marketBuy(this.exchange.bitmex, processor.getSymbolPair(this.symbol), amount);
    if (result.e && maxRetryCnt > 0) { 
      maxRetryCnt--;
      this.marketBuy(amount);
    }
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-'+Math.round(value.info.simpleCumQty*100)/100 + CONST.STR_COIN + CONST.CRLF;
      return log.commonLogProcess(result, CONST.MSG_MARKET_BUY).message;
    }
  }
  
  // 成行売り
  async marketSell(amount) {
    log.log('method marketSell');
    log.log('this.env='+this.env);
    let result = await this.order.marketSell(this.exchange.bitmex, processor.getSymbolPair(this.symbol), amount);
    if (result.e && maxRetryCnt > 0) { 
      maxRetryCnt--;
      log.log('result.e='+JSON.stringify(result.e));
      this.marketSell(amount);
    }
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-'+Math.round(value.info.simpleCumQty*100)/100 + CONST.STR_COIN + CONST.CRLF;
      return log.commonLogProcess(result, CONST.MSG_MARKET_SELL).message;
    }
  }
  
  async stoplossBuy() {
    log.log('method stoplossBuy');
    let result = await this.order.stoplossBuy(this.exchange.bitmex, processor.getSymbolPair(this.symbol), this.new_position_qty, this.makeStopLossBuyParams(Number.parseInt(this.pos.avgEntryPrice, 10)));
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-'+Math.round(value.info.simpleCumQty*100)/100 + CONST.STR_COIN;
    }
    return log.commonLogProcess(result, CONST.MSG_STOPLOSS_BUY).message;
  }
  
  async stoplossSell() {
    log.log('method stoplossSell');
    let result = await this.order.stoplossSell(this.exchange.bitmex, processor.getSymbolPair(this.symbol), this.new_position_qty, this.makeStopLossSellParams(Number.parseInt(this.pos.avgEntryPrice, 10)));
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-'+Math.round(value.info.simpleCumQty*100)/100 + CONST.STR_COIN;
    }
    return log.commonLogProcess(result, CONST.MSG_STOPLOSS_SELL).message;
  }
  
  getStopLossPercentage() {
    log.log('method getStopLossPercentage');
    log.log('percentage='+(this.symbol === CONST.SYMBOL_BTC) ? 5/this.LEVERAGE : 5/this.LEVERAGE_ALT);
    return (this.symbol === CONST.SYMBOL_BTC) ? 5/this.LEVERAGE : 5/this.LEVERAGE_ALT;
  }
  makeStopLossBuyParams(entryPrice) {
    log.log('method makeStopLossBuyParams');
    log.log('stopPx='+Number.parseInt(entryPrice*(1+this.getStopLossPercentage()/100),10));
    return {'stopPx':Number.parseInt(entryPrice*(1+this.getStopLossPercentage()/100),10), 'ordType':'Stop', 'execInst': 'LastPrice'};
  }
  
  makeStopLossSellParams(entryPrice) {
    log.log('method makeStopLossSellParams');
    log.log('stopPx='+Number.parseInt(entryPrice*(1-this.getStopLossPercentage()/100),10));
    return {'stopPx':Number.parseInt(entryPrice*(1-this.getStopLossPercentage()/100),10), 'ordType':'Stop', 'execInst': 'LastPrice'};
  }
  
  setQty() {
    log.log('method setQty');
    this.current_position_qty = (this.pos['side'] === CONST.SIGN_LONG) ? this.pos['currentQty'] : (this.pos['side'] == CONST.SIGN_SHORT) ? - this.pos['currentQty'] : 0;
    // 最大ポジション数量（レバレッジ設定×保有BTC総量×Price最終値）
    if (this.symbol === CONST.SYMBOL_BTC) {
      this.max_position_qty = this.LEVERAGE * this.total_btc * this.last;
    // 最大ポジション数量（レバレッジ設定×保有BTC総量×(1/Price最終値)）！！実際は成行注文をするので、この値より多少前後します！！
    } else {
      this.max_position_qty = Number.parseInt(this.LEVERAGE_ALT * this.total_btc * 1/this.last, 10);
    }
    // 新ポジションの数量(USD)の作成（最大ポジション数量×ロット割合）
    this.new_position_qty = this.max_position_qty * this.LOT_RATE;
    log.log('this.new_position_qty='+this.new_position_qty);
    log.log('this.current_position_qty='+this.current_position_qty);
    let add_qty = this.new_position_qty - this.current_position_qty;
    log.log('add_qty='+add_qty);
    this.add_qty = (add_qty > 0) ? add_qty : 0;
  }
  
  async adminCommand(symbol, command, text) {
    log.log('method adminCommand');
    let message = '';
    // 売買指示用通貨ペアセット
    this.symbolPair = (CONST.SYMBOL_BASE_ARRAY.indexOf(symbol) !== -1) ? symbol+CONST.PAIR_SYMBOL_USD : symbol+CONST.PAIR_SYMBOL_Z18;
    // 環境変数セット
    this.symbol = symbol;
    this.command = command;
    // QTYを計算
    await this.calculateQty();
    // adminコマンド実行
    message = await this.adminCommandProcess(text);
    return message;
  }
  
  async adminCommandProcess(text) {
    log.log('method adminCommandProcess');
    let message = '';
    // コマンド：レバレッジ変更
    if (this.command.leverageStr) {
      text = text.replace(this.command.leverageStr, '');
      message = await this.setLeverage(Number(text));
    // コマンド：CLOSE
    } else if (this.command.closeStr) {
      // オープンOrderキャンセル
      await this.fetchAndCancelOpenOrder();
      // QTYを計算
      await this.calculateQty();
      if (this.current_position_qty > 0 ) {
        message = CONST.MSG_CLEARANCE;
        if (this.pos['side'] === CONST.SIGN_LONG) {
          log.log('HAITTA:this.current_position_qty'+this.current_position_qty);
          message += await this.marketSell(this.current_position_qty) + CONST.CRLF;
        } else if(this.pos['side'] === CONST.SIGN_SHORT) {
          message += await this.marketBuy(this.current_position_qty) + CONST.CRLF;
        }
      }
    // コマンド：INFO
    } else if (this.command.infoStr) {
      message = CONST.MSG_ENV + this.env + CONST.CRLF;
      message += CONST.MSG_LAST_PRICE + this.last + CONST.CRLF;
      message += CONST.MSG_POSITION + JSON.stringify(this.pos) + CONST.CRLF;
      message += CONST.MSG_TOTAL_BTC + this.total_btc;
    // コマンド：BUY
    } else if (this.command.buyStr) {
      // 購入文字列削除
      text = text.replace(this.command.buyStr, '');
      // 数量指定オーダーの場合
      if (text) {
        // 指値/買い
        message += await this.limitBuy(this.exchange.bitmex, this.symbol, 1000, Number(text));
      } else {
        message = await this.buyLogic();
      }
      // ポジション再取得
      this.pos = await this.getPositions();
    // コマンド：SELL
    } else if (this.command.sellStr) {
      // 半角/全角スペース/レバレッジ文字列削除
      text = text.replace(this.command.sellStr, '');
      // 数量指定オーダーの場合
      if (text) {
        // 指値/買い
        message = await this.limitSell(this.exchange.bitmex, this.symbol, 1000, Number(text));
      } else {
        message = await this.sellLogic();
      }
      // ポジション再取得
      this.pos = await this.getPositions();
    }
    return message;
  }
  
  async buyLogic() {
    log.log('method buyLogic');
    let message = '';
    message = CONST.MSG_DOTEN_LONG +'('+this.env+')'+ CONST.CRLF;
    log.log('this.add_qty='+this.add_qty);
    if (this.pos['side'] === null) {
      message += CONST.MSG_ENTRY;
      message += await this.marketBuy(this.new_position_qty);
    } else if (this.pos['side'] === CONST.SIGN_LONG) {
      // まだ購入できる証拠金がある場合
      if (this.add_qty > 0) {
        message += CONST.MSG_ADD;
        message += await this.marketBuy(this.add_qty);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos['side'] === CONST.SIGN_SHORT) {
      if (this.current_position_qty > 0 ) {
        message += CONST.MSG_CLEARANCE;
        message += await this.marketBuy(this.current_position_qty) + CONST.CRLF;
      }
      message += CONST.MSG_ENTRY;
      message += await this.marketBuy(this.new_position_qty);
    } else {
      this.throughFlg = true;
    }
    // ポジション再取得
    this.pos = await this.getPositions();
    // 損切りOrder
    message += await this.stoplossSell();
    return message;
  }
  
  async sellLogic() {
    log.log('method sellLogic');
    let message = '';
    message = CONST.MSG_DOTEN_SHORT +'('+this.env+')'+ CONST.CRLF;
    if (this.pos['side'] === null) {
      message += CONST.MSG_ENTRY;
      message += await this.marketSell(this.new_position_qty);
    } else if (this.pos['side'] === CONST.SIGN_SHORT) {
      // まだ売買できる証拠金がある場合
      if (this.add_qty > 0) {
        message += CONST.MSG_ADD;
        message += await this.marketSell(this.add_qty);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos['side'] === CONST.SIGN_LONG) {
      if (this.current_position_qty > 0 ) {
        message += CONST.MSG_CLEARANCE;
        message += await this.marketSell(this.current_position_qty) + CONST.CRLF;
      }
      message += CONST.MSG_ENTRY;
      message += await this.marketSell(this.new_position_qty);
    } else {
      this.throughFlg = true;
    }
    // ポジション再取得
    this.pos = await this.getPositions();
    // 損切りOrder
    message += await this.stoplossBuy();
    return message;
  }
}

module.exports = Executor;