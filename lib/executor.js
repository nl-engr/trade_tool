// require('dotenv').config();
const path = require('path');
const CONST = require(path.join(__dirname, 'const.js'));
const processor = require(path.join(__dirname, 'processor.js'));
const exchangeModule = require(path.join(__dirname, 'exchange.js'));
const orderModule = require(path.join(__dirname, 'order.js'));
const logModule = require(path.join(__dirname, 'log.js'));
const jsonRW = require(path.join(__dirname, 'jsonRW.js'));
const STATE = path.join(__dirname, '../config/state.json');
var log = new logModule();

var LEVERAGE = {};
var maxRetryCnt = CONST.MAX_RETRY_CNT;

class Executor {
  constructor(env, rtm, event, exchange) {
    log.log('Executor New');
    this.WHOLE_LOT_RATE = CONST.WHOLE_LOT_RATE; // ロット_割合(全体)
    this.LOT_RATE = this.WHOLE_LOT_RATE/2; // ロット_割合
    // 取引所モジュールをNew
    this.exchange = new exchangeModule(env, exchange).exchange;

    // オーダーモジュール
    this.order = new orderModule();
    this.env = env;
    this.throughFlg = false;
    this.doten_side_message = null;
    
    this.rtm = rtm;
    this.event = event;
    this.state = jsonRW.readJson(STATE);
  }

  initLeverage() {
    log.log('initLeverage');
    if (LEVERAGE[this.exchange.id] === undefined) {
      LEVERAGE[this.exchange.id] = {};
    }
    // レバレッジ既存設定値がある場合読み込み
    if (this.state[this.exchange.id][this.symbol] && this.state[this.exchange.id][this.symbol].LV) {
      LEVERAGE[this.exchange.id][this.symbol] = this.state[this.exchange.id][this.symbol].LV;
    // 設定値がない場合は初期値をセット
    } else {
      CONST.SYMBOL_ALL_ARRAY.filter((symbol, idx) => {
        if (CONST.SYMBOL_BTC === symbol) {
          if (LEVERAGE[this.exchange.id][symbol] === undefined) {
            LEVERAGE[this.exchange.id][symbol] = CONST.LEVERAGE_10;
          }
        } else {
          if (LEVERAGE[this.exchange.id][symbol] === undefined) {
            LEVERAGE[this.exchange.id][symbol] = CONST.LEVERAGE_3;
          }
        }
      });
    }
  }
  
  async doten(symbol, side) {
    log.log('method doten');
    // 環境変数セット
    this.symbol = symbol;
    this.side = side;
    // レバレッジセット
    this.initLeverage();

    // オープンOrderがあればキャンセル
    await this.fetchAndCancelOpenOrder();
    // QTYを計算
    await this.calculateQty();
    // ドテン処理実行
    await this.dotenProcess();
  }
  
  async dotenProcess() {
    log.log('method dotenProcess');
    // 買いアラート時
    if (this.side === CONST.SIDE.LONG ) {
      // レバレッジを設定
      await this.setLeverage();
      await this.buyLogic();
    }
    // 売りアラート時
    if (this.side === CONST.SIDE.SHORT ) {
      // レバレッジを設定
      await this.setLeverage();
      await this.sellLogic();
    }
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
    // Openオーダー情報を取得
    let orders = await this.fetchOpenOrders();
    if (orders) {
      // 損切価格を取得
      this.getStopPx(orders);
    }
  }
  
  async setLeverage(leverage) {
    log.log('method setLeverage');
    let lv = leverage ? leverage : LEVERAGE[this.exchange.id][this.symbol];
    log.log('lv='+lv);
    let result = await this.order.setLeverage(this.exchange, processor.getSymbolPairPosition(this.symbol), lv);
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+' x'+value.leverage;
      LEVERAGE[this.exchange.id][this.symbol] = value.leverage;
      jsonRW.updateJson_state(this.exchange.id, this.symbol, 'LV', value.leverage, STATE);
    }
    return log.commonLogProcess(result, CONST.MSG_CHANGE_LEVERAGE);
  }
  
  async fetchOpenOrders() {
    log.log('method fetchOpenOrders');
    let result = await this.order.fetchOpenOrders(this.exchange, processor.getSymbolPair(this.symbol));
    return log.commonLogProcess(result, CONST.MSG_GET_OPEN_ODERS).value;
  }
  
  async cancelOrder(id) {
    log.log('method cancelOrder');
    let result = await this.order.cancelOrder(this.exchange, id);
    return log.commonLogProcess(result, CONST.MSG_CANCEL_ORDER).value;
  }
  
  async fetchAndCancelOpenOrder() {
    log.log('method fetchAndCancelOpenOrder');
    // オープンOrderを取得
    let orders = await this.fetchOpenOrders();
    if (orders) {
      orders.filter(async(order, idx) => {
        // exchange ReNew
        this.exchange = new exchangeModule(this.env, this.exchange.id).exchange;
        // wait処理
        await new Promise(r => setTimeout(r, 100));
        // オープンOrderをキャンセル
        this.cancelOrder(order.id);
      });
    }
  }
  
  // 最終価格を取得する
  async fetchTickerLast() {
    log.log('method fetchTickerLast');
    let symbolPair = processor.getSymbolPair(this.symbol);
    if (CONST.EXCHANGE.BITFLYER === this.exchange.id) {
      symbolPair = CONST.BF_FX_BTC_JPY;
    }
    let result = await this.order.fetchTicker(this.exchange, symbolPair, 'last');
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.fetchTickerLast();
      } else {
        // リトライ回数リセット
        maxRetryCnt = CONST.MAX_RETRY_CNT;
        return log.commonLogProcess(result, CONST.MSG_GET_LAST_PRICE);
      }
    }
    if (result.value) { // 加工
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      return log.commonLogProcess(result, CONST.MSG_GET_LAST_PRICE).value;
    }
  }

  // 現在の保有BTC総量を取得
  async fetchTotalBalance() {
    log.log('method fetchTotalBalance');
    let result = await this.order.fetchBalance(this.exchange);
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.fetchTotalBalance();
      } else {
        // リトライ回数リセット
        maxRetryCnt = CONST.MAX_RETRY_CNT;
        return log.commonLogProcess(result, CONST.MSG_GET_BALANCE);
      }
    }
    if (result.value) { // 加工
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      return log.commonLogProcess(result, CONST.MSG_GET_BALANCE).value;
    }
  }
  
  // 全ポジションの数量(USD)取得
  async getPositions() {
    log.log('method getPositions');
    let result = await this.order.getPositions(this.exchange);
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.getPositions();
      } else {
        // リトライ回数リセット
        maxRetryCnt = CONST.MAX_RETRY_CNT;
        return log.commonLogProcess(result, CONST.MSG_GET_POS_INFO);
      }
    }
    if (result.value) { // 加工
      return this.setPosition(result);
    }
  }
  
  setPosition(result) {
    log.log('method setPosition');
    // リトライ回数リセット
    maxRetryCnt = CONST.MAX_RETRY_CNT;
    log.log('this.exchange.id='+this.exchange.id);
    if (CONST.EXCHANGE.BITMEX === this.exchange.id) {
      return this.setPosition_bitmex(result);
    }
    if (CONST.EXCHANGE.BITFLYER === this.exchange.id) {
      return this.setPosition_bitflyer(result);
    }
  }
  
  setPosition_bitmex(result) {
    log.log('method setPosition_bitmex');
    let pos = null;
    let value = result.value;
    if (!value || value.length === 0) {
      result.value = {'side': null, 'currentQty': 0, 'avgEntryPrice': null, 'liquidationPrice': null};
    }
    value.filter((position, idx) => {
      if (position.symbol === processor.getSymbolPairPosition(this.symbol)) {
        pos = position;
      }
    });
    if (pos) {
      let side = null;
      side = (pos.currentQty === 0) ? null : (pos.currentQty > 0) ? CONST.SIDE.LONG : CONST.SIDE.SHORT;
      result.value = {'side': side, 'currentQty': Math.round(pos.currentQty), 'avgEntryPrice': pos.avgEntryPrice, 'liquidationPrice': pos.liquidationPrice};
    } else {
      result.value = {'side': null, 'currentQty': 0, 'avgEntryPrice': null, 'liquidationPrice': null};
    }
    return log.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
  }
  
  setPosition_bitflyer(result) {
    log.log('method setPosition_bitflyer');
    let pos = null;
    let value = result.value;
    if (!value || value.length === 0) {
      result.value = {'side': null, 'currentQty': 0, 'avgEntryPrice': null, 'liquidationPrice': null};
    }
    value.filter((position, idx) => {
      if (position.symbol === processor.getSymbolPairPosition(this.symbol)) {
        pos = position;
      }
    });
    if (pos) {
      let side = null;
      side = (pos.currentQty === 0) ? null : (pos.currentQty > 0) ? CONST.SIDE.LONG : CONST.SIDE.SHORT;
      result.value = {'side': side, 'currentQty': Math.round(pos.currentQty), 'avgEntryPrice': pos.avgEntryPrice, 'liquidationPrice': pos.liquidationPrice};
    } else {
      result.value = {'side': null, 'currentQty': 0, 'avgEntryPrice': null, 'liquidationPrice': null};
    }
    return log.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
  }

  // 指値買い
  async limitBuy(amount, price) {
    log.log('method limitBuy');
    let result = await this.order.limitBuy(this.exchange, processor.getSymbolPair(this.symbol), amount, price);
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
    }
    return log.commonLogProcess(result, CONST.MSG_LIMIT_BUY);
  }
  
  // 指値売り
  async limitSell(amount, price) {
    log.log('method limitSell');
    let result = await this.order.limitSell(this.exchange, processor.getSymbolPair(this.symbol), amount, price);
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
    }
    return log.commonLogProcess(result, CONST.MSG_LIMIT_SELL);
  }
  
  // 成行買い
  async marketBuy(amount) {
    log.log('method marketBuy');
    log.log('bbb-'+this.env+' '+this.exchange+' '+amount);
    let result = await this.order.marketBuy(this.exchange, processor.getSymbolPair(this.symbol), amount);
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.marketBuy(amount);
      } else {
        // リトライ回数リセット
        maxRetryCnt = CONST.MAX_RETRY_CNT;
        return log.commonLogProcess(result, CONST.MSG_MARKET_BUY);
      }
    }
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      return log.commonLogProcess(result, CONST.MSG_MARKET_BUY);
    }
  }
  
  // 成行売り
  async marketSell(amount) {
    log.log('method marketSell');
    let result = await this.order.marketSell(this.exchange, processor.getSymbolPair(this.symbol), amount);
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.marketSell(amount);
      } else {
        return log.commonLogProcess(result, CONST.MSG_MARKET_SELL);
      }
    }
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      return log.commonLogProcess(result, CONST.MSG_MARKET_SELL);
    }
  }
  
  async stoplossBuy() {
    log.log('method stoplossBuy');
    let result = await this.order.stoplossBuy(this.exchange, processor.getSymbolPair(this.symbol), this.new_position_qty, this.makeStopLossBuyParams());
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.stoplossBuy();
      } else {
        return log.commonLogProcess(result, CONST.MSG_STOPLOSS_BUY);
      }
    }
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.info.stopPx+'-'+value.amount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      return log.commonLogProcess(result, CONST.MSG_STOPLOSS_BUY);
    }
  }
  
  async stoplossSell() {
    log.log('method stoplossSell');
    let result = await this.order.stoplossSell(this.exchange, processor.getSymbolPair(this.symbol), this.new_position_qty, this.makeStopLossSellParams());
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.stoplossSell();
      } else {
        return log.commonLogProcess(result, CONST.MSG_STOPLOSS_SELL);
      }
    }
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.info.stopPx+'-'+value.amount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      return log.commonLogProcess(result, CONST.MSG_STOPLOSS_SELL);
    }
  }
  
  getStopLossPercentage() {
    log.log('method getStopLossPercentage');
    log.log('percentage=' + CONST.BASIC_STOP_LOSS_PERCENTAGE/LEVERAGE[this.exchange.id][this.symbol]);
    return CONST.BASIC_STOP_LOSS_PERCENTAGE/LEVERAGE[this.exchange.id][this.symbol];
  }
  makeStopLossBuyParams() {
    log.log('method makeStopLossBuyParams');
    let stopPx = 0;
    if (CONST.SYMBOL_BTC === this.symbol) {
      let entryPrice = Number.parseInt(this.pos.avgEntryPrice, 10);
      stopPx = Number.parseInt(entryPrice*(1+(this.getStopLossPercentage()/100)),10);
      log.log('percent='+(1+(this.getStopLossPercentage()/100)));
    } else {
      let entryPrice = this.pos.avgEntryPrice;
      stopPx = (entryPrice*(1+(this.getStopLossPercentage()/100))).toFixed(8);
    }
    log.log('stopPx='+stopPx);
    return {'stopPx':stopPx, 'ordType':'Stop', 'execInst': 'LastPrice'};
  }
  makeStopLossSellParams() {
    log.log('method makeStopLossSellParams');
    let stopPx = 0;
    if (CONST.SYMBOL_BTC === this.symbol) {
      let entryPrice = Number.parseInt(this.pos.avgEntryPrice, 10);
      stopPx = Number.parseInt(entryPrice*(1-(this.getStopLossPercentage()/100)),10);
      log.log('percent='+(1-(this.getStopLossPercentage()/100)));
    } else {
      let entryPrice = this.pos.avgEntryPrice;
      stopPx = (entryPrice*(1-(this.getStopLossPercentage()/100))).toFixed(8);
      log.log('percent='+(1-(this.getStopLossPercentage()/100)));
    }
    log.log('stopPx='+stopPx);
    return {'stopPx':stopPx, 'ordType':'Stop', 'execInst': 'LastPrice'};
  }
  
  setQty() {
    log.log('method setQty');
    this.current_position_qty = (this.pos['side'] === CONST.SIDE.LONG) ? this.pos['currentQty'] : (this.pos['side'] == CONST.SIDE.SHORT) ? - this.pos['currentQty'] : 0;
    // 最大ポジション数量（レバレッジ設定×保有BTC総量×Price最終値）
    if (this.symbol === CONST.SYMBOL_BTC) {
      this.max_position_qty = LEVERAGE[this.exchange.id][this.symbol] * this.total_btc * this.last;
    // 最大ポジション数量（レバレッジ設定×保有BTC総量×(1/Price最終値)）！！実際は成行注文をするので、この値より多少前後します！！
    } else {
      this.max_position_qty = Number.parseInt(LEVERAGE[this.exchange.id][this.symbol] * this.total_btc * 1/this.last, 10);
    }
    // 新ポジションの数量(USD)の作成（最大ポジション数量×ロット割合）
    this.new_position_qty = Math.floor(this.max_position_qty * this.LOT_RATE);
    log.log('this.new_position_qty='+this.new_position_qty);
    log.log('this.current_position_qty='+this.current_position_qty);
    let add_qty = this.new_position_qty - this.current_position_qty;
    log.log('add_qty='+add_qty);
    this.add_qty = (add_qty > 0) ? add_qty : 0;
  }
  
  async adminCommand(symbol, command, text) {
    log.log('method adminCommand');
    // 売買指示用通貨ペアセット
    this.symbolPair = (CONST.SYMBOL_BASE_ARRAY.indexOf(symbol) !== -1) ? symbol+CONST.PAIR_SYMBOL_USD : symbol+CONST.PAIR_SYMBOL_Z18;
    // 環境変数セット
    this.symbol = symbol;
    this.command = command;
    // レバレッジセット
    this.initLeverage();
    // QTYを計算
    await this.calculateQty();
    // adminコマンド実行
    await this.adminCommandProcess(text);
  }
  
  getStopPx(orders) {
    orders.filter((order, idx) => {
      if (order.symbol === processor.getSymbolPair(this.symbol)) {
        this.stopPx = order.info.stopPx;
      }
    });
  }
  
  async adminCommandProcess(text) {
    log.log('method adminCommandProcess');
    let message = '';
    // コマンド：INFO
    if (this.command.infoStr) {
      message = processor.decorateWithBrackets(CONST.MSG_ENV) + ' ' + processor.decorateWithInlineQuote(this.env) 
      + processor.decorateWithBrackets(CONST.MSG_EXCHANGE) + ' ' + processor.decorateWithInlineQuote(this.exchange.id) + CONST.CRLF;
      message += processor.decorateWithBrackets(CONST.MSG_SYMBOL) + this.symbol + ' ' + processor.decorateWithBrackets(CONST.MSG_MODE) + ' ' + processor.decorateWithInlineQuote(this.state[this.exchange.id][this.symbol].MODE) + CONST.CRLF;
      message += processor.decorateWithBrackets(CONST.MSG_LAST_PRICE) + this.last + processor.decorateWithBrackets(CONST.MSG_TOTAL_BTC) + this.total_btc.toFixed(6) + CONST.CRLF;
      message += processor.decorateWithBrackets(CONST.MSG_POSITION) + CONST.CRLF;
      message += '>' + processor.decorateWithBrackets(CONST.MSG_POS_SIDE) + ' ' + processor.decorateWithInlineQuote(this.pos.side)
        + processor.decorateWithBrackets(CONST.MSG_POS_QTY) + this.pos.currentQty + processor.decorateWithBrackets(CONST.MSG_LV) + (LEVERAGE[this.exchange.id][this.symbol]) + CONST.CRLF;
      let entryPrice = (CONST.SYMBOL_BTC === this.symbol) ? Number.parseInt(this.pos.avgEntryPrice, 10) : this.pos.avgEntryPrice;
      message += '>' + processor.decorateWithBrackets(CONST.MSG_POS_ENTRY_PRICE) + entryPrice + CONST.CRLF;
      message += '>' + processor.decorateWithBrackets(CONST.MSG_POS_STOPLOSS_PRICE) + this.stopPx + CONST.CRLF;
      message += '>' + processor.decorateWithBrackets(CONST.MSG_POS_LIQUIDATION_PRICE) + this.pos.liquidationPrice + CONST.CRLF;
      // 結果メッセージ送信
      this.rtm.sendMessage(message, this.event.channel);
      return;

    // コマンド：レバレッジ変更
    } else if (this.command.leverageStr) {
      text = text.replace(this.command.leverageStr, '');
      let result = await this.setLeverage(Number(text));
      this.sendMessage(null, result);
      return;
    }
    
    // MODE判定
    log.log('MODE='+this.state[this.exchange.id][this.symbol].MODE);
    if (CONST.STR_MODE_OFF_ARRAY[0] === this.state[this.exchange.id][this.symbol].MODE) return;

    // オープンOrderキャンセル
    await this.fetchAndCancelOpenOrder();
    // QTYを計算
    await this.calculateQty();
    
    // コマンド：CLOSE
    if (this.command.closeStr) {
      if (this.current_position_qty > 0 ) {
        let condition = CONST.MSG_CLEARANCE;
        let result = null;
        if (this.pos['side'] === CONST.SIDE.LONG) {
          result = await this.marketSell(this.current_position_qty);
        } else if(this.pos['side'] === CONST.SIDE.SHORT) {
          result = await this.marketBuy(this.current_position_qty);
        }
        this.sendMessage(condition, result);
      }
    // コマンド：BUY
    } else if (this.command.buyStr) {
      // 購入文字列削除
      text = text.replace(this.command.buyStr, '');
      // レバレッジを設定
      await this.setLeverage();
      // 数量指定オーダーの場合
      if (text) {
        // 指値/買い
        await this.limitBuy(this.exchange, this.symbol, 1000, Number(text));
      } else {
        await this.buyLogic();
      }
    // コマンド：SELL
    } else if (this.command.sellStr) {
      // 半角/全角スペース/レバレッジ文字列削除
      text = text.replace(this.command.sellStr, '');
      // レバレッジを設定
      await this.setLeverage();
      // 数量指定オーダーの場合
      if (text) {
        // 指値/買い
        await this.limitSell(this.exchange, this.symbol, 1000, Number(text));
      } else {
        await this.sellLogic();
      }
    }
  }
  
  sendMessage(condition, result) {
    let message = '';
    if (this.doten_side_message) {
      message = processor.decorateWithBold(this.symbol + this.doten_side_message + ' ' +processor.decorateWithInlineQuote(this.env)) + CONST.CRLF;
      this.doten_side_message = null; // ドテン毎に1回のみ通るように
    }
    if (this.throughFlg) {
      // 結果メッセージ送信
      this.rtm.sendMessage(message, this.event.channel);
      return;
    }
    if (condition) {
      message += processor.decorateWithBrackets(condition);
    }
    message += processor.decorateWithBrackets(result.order) + ' ' + processor.decorateWithInlineQuote(result.status) + CONST.CRLF;
    if (result.value) {
      message += processor.decorateWithMultiLineIndent(result.value);
    } else if (result.e) {
      message += processor.decorateWithBorderQuote(result.e);
    }
    // 結果メッセージ送信
    this.rtm.sendMessage(message, this.event.channel);
  }
  
  async buyLogic() {
    log.log('method buyLogic');
    let result = {};
    this.doten_side_message = CONST.MSG_DOTEN.replace(CONST.REPLACE_STR, 'ロング');
    let condition = null;
    if (this.pos['side'] === null) {
      log.log('aaaa'+this.new_position_qty);
      condition = CONST.MSG_ENTRY;
      result = await this.marketBuy(this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else if (this.pos['side'] === CONST.SIDE.LONG) {
      // まだ購入できる証拠金がある場合
      if (this.add_qty > 0) {
        condition = CONST.MSG_ADD;
        result = await this.marketBuy(this.add_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos['side'] === CONST.SIDE.SHORT) {
      if (this.current_position_qty > 0 ) {
        condition= CONST.MSG_CLEARANCE;
        result = await this.marketBuy(this.current_position_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      }
      condition = CONST.MSG_ENTRY;
      result = await this.marketBuy(this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else {
      this.throughFlg = true;
    }
    // wait処理
    await new Promise(r => setTimeout(r, 1000));
    // ポジション再取得
    this.pos = await this.getPositions();
    // 損切りOrder
    result = await this.stoplossSell();
    // メッセージ送信
    this.sendMessage(condition, result);
  }
  
  async sellLogic() {
    log.log('method sellLogic');
    let result = {};
    this.doten_side_message = CONST.MSG_DOTEN.replace(CONST.REPLACE_STR, 'ショート');
    let condition = null;
    if (this.pos['side'] === null) {
      condition = CONST.MSG_ENTRY;
      result = await this.marketSell(this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else if (this.pos['side'] === CONST.SIDE.SHORT) {
      // まだ売買できる証拠金がある場合
      if (this.add_qty > 0) {
        condition = CONST.MSG_ADD;
        result = await this.marketSell(this.add_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos['side'] === CONST.SIDE.LONG) {
      if (this.current_position_qty > 0 ) {
        condition = CONST.MSG_CLEARANCE;
        result = await this.marketSell(this.current_position_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      }
      condition = CONST.MSG_ENTRY;
      result = await this.marketSell(this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else {
      this.throughFlg = true;
    }
    // wait処理
    await new Promise(r => setTimeout(r, 1000));
    // ポジション再取得
    this.pos = await this.getPositions();
    // 損切りOrder
    result = await this.stoplossBuy();
    // メッセージ送信
    this.sendMessage(condition, result);
  }
}

module.exports = Executor;