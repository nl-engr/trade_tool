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
    // ロット_割合
    this.LOT_RATE = CONST.EXCHANGE.BITMEX === exchange ? CONST.WHOLE_LOT_RATE/2 : CONST.WHOLE_LOT_RATE;
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
    if (CONST.EXCHANGE.BITMEX === this.exchange.id) {
      // BTCトータルバランスを取得
      this.total_collateral = await this.fetchTotalBalance_bitmex();
    } else {
      // BTCトータルバランスを取得
      this.total_collateral = await this.fetchTotalBalance_bitflyer();
    }
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
    if (CONST.EXCHANGE.BITFLYER === this.exchange.id) {
      return;
    }
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
    let result = await this.order.fetchOpenOrders(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id));
    return log.commonLogProcess(result, CONST.MSG_GET_OPEN_ODERS).value;
  }
  
  async cancelOrder(id) {
    log.log('method cancelOrder');
    let symbol = (CONST.EXCHANGE.BITFLYER === this.exchange.id) ? CONST.BF_FX_BTC_JPY : undefined;
    let result = await this.order.cancelOrder(this.exchange, id, symbol);
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
    let symbolPair = processor.getSymbolPair(this.symbol, this.exchange.id);
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
  async fetchTotalBalance_bitmex() {
    log.log('method fetchTotalBalance_bitmex');
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
      result.value = result.value[CONST.SYMBOL_BTC].total;
      return log.commonLogProcess(result, CONST.MSG_GET_BALANCE).value;
    }
  }
  
  // 現在の保有BTC総量を取得
  async fetchTotalBalance_bitflyer() {
    log.log('method fetchTotalBalance_bitflyer');
    let result = await this.order.getCollateral(this.exchange);
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
      result.value = (result.value.collateral + result.value.open_position_pnl) * 1/this.last;
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
  
  initPosition() {
    let pos = {};
    pos.side = null;
    pos.currentQty = 0;
    pos.avgEntryPrice = null;
    pos.liquidationPrice = null;
    return pos;
  }
  
  setRetPosition(pos) {
    let retPosition = {
      'side': pos.side,
      'currentQty': pos.currentQty,
      'avgEntryPrice': pos.avgEntryPrice,
      'liquidationPrice': pos.liquidationPrice
    };
    return retPosition;
  }
  
  calculateAvg(sizeList, priceList) {
    let totalPrice = 0;
    priceList.forEach((price, idx) => {
      totalPrice += price * sizeList[idx];
    });
    let totalSize = sizeList.reduce((a,x) => a+=x);
    let avgEntryPrice = totalPrice / totalSize;
    return avgEntryPrice;
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
    let pos = this.initPosition();
    if (result.value && result.value.length !== 0) {
      result.value.filter((position, idx) => {
        if (position.symbol === processor.getSymbolPairPosition(this.symbol)) {
          pos.side = (position.currentQty === 0) ? null : (position.currentQty > 0) ? CONST.SIDE.LONG : CONST.SIDE.SHORT;
          pos.currentQty = (position.currentQty > 0) ? Math.round(position.currentQty) : -Math.round(position.currentQty);
          pos.avgEntryPrice = position.avgEntryPrice;
          pos.liquidationPrice = position.liquidationPrice;
        }
      });
    }
    result.value = this.setRetPosition(pos);
    return log.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
  }
  
  setPosition_bitflyer(result) {
    log.log('method setPosition_bitflyer');
    let pos = this.initPosition();
    if (result.value && result.value.length !== 0) {
      let sizeList = [];
      let priceList = [];
      result.value.filter((position, idx) => {
        if (CONST.BF_FX_BTC_JPY === position.product_code) {
          pos.side = position["side"] === CONST.STR_BUY_SIDE_ARRAY[0] ? CONST.SIDE.LONG : CONST.SIDE.SHORT;
          sizeList.push(position["size"]);
          priceList.push(position["price"]);
        }
      });
			// 平均建値を計算する
			pos.avgEntryPrice = this.calculateAvg(sizeList, priceList);
			pos.currentQty = sizeList.reduce((a,x) => a+=x);
    }
    result.value = this.setRetPosition(pos);
    return log.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
  }

  // 指値買い
  async limitBuy(amount, price) {
    log.log('method limitBuy');
    let result = await this.order.limitBuy(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id), amount, price);
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
    }
    return log.commonLogProcess(result, CONST.MSG_LIMIT_BUY);
  }
  
  // 指値売り
  async limitSell(amount, price) {
    log.log('method limitSell');
    let result = await this.order.limitSell(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id), amount, price);
    if (result.value) { // 加工
      let value = result.value;
      result.value = this.symbol+'-'+value.price+'-'+value.filled+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
    }
    return log.commonLogProcess(result, CONST.MSG_LIMIT_SELL);
  }
  
  // 成行指示
  async createMarketOrder(side, amount) {
    log.log('method createMarketOrder '+side);
    log.log('bbb-'+this.env+' '+this.exchange.id+' '+amount);
    let retMsg = (CONST.SIDE.LONG === side) ? CONST.MSG_MARKET_BUY : CONST.MSG_MARKET_SELL;
    let result = await this.order.createMarketOrder(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id), side, amount);
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.createMarketOrder(side, amount);
      } else {
        // リトライ回数リセット
        maxRetryCnt = CONST.MAX_RETRY_CNT;
        return log.commonLogProcess(result, retMsg);
      }
    }
    if (result.value) { // 加工
      let value = result.value;
      let retPrice = value.price ? value.price : this.last;
      let retAmount = value.filled ? value.filled : amount;
      result.value = this.symbol+'-'+retPrice+'-'+retAmount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      return log.commonLogProcess(result, retMsg);
    }
  }

  
  async createStopOrder(side) {
    log.log('method stoplossBuy');
    let result = await this.order.createStopOrder(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id), side, this.new_position_qty, this.makeStopLossParams(side));
    let retMsg = CONST.SIDE.LONG === side ? CONST.MSG_STOPLOSS_BUY : CONST.MSG_STOPLOSS_SELL;
    if (result.e) {
      if (maxRetryCnt > 0) { 
        maxRetryCnt--;
        log.log('result.e='+JSON.stringify(result.e));
        this.createStopOrder(side);
      } else {
        return log.commonLogProcess(result, retMsg);
      }
    }
    if (result.value) { // 加工
      let value = result.value;
      log.log('createStopOrder value='+JSON.stringify(value));
      result.value = this.symbol+'-'+value.info.stopPx+'-'+value.amount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      return log.commonLogProcess(result, retMsg);
    }
  }
  
  getStopLossPercentage() {
    log.log('method getStopLossPercentage');
    log.log('percentage=' + CONST.BASIC_STOP_LOSS_PERCENTAGE/LEVERAGE[this.exchange.id][this.symbol]);
    return CONST.BASIC_STOP_LOSS_PERCENTAGE/LEVERAGE[this.exchange.id][this.symbol];
  }
  
  makeStopLossParams(side) {
    log.log('method makeStopLossParams '+side);
    let stopPx = 0;
    let percent = (CONST.SIDE.LONG === side) ? 1+(this.getStopLossPercentage()/100) : 1-(this.getStopLossPercentage()/100);
    log.log('percent='+percent);
    if (CONST.EXCHANGE.BITMEX === this.exchange.id) {
      if (CONST.SYMBOL_BTC === this.symbol) {
        stopPx = Number.parseInt((Number.parseInt(this.pos.avgEntryPrice, 10)*percent),10);
      } else {
        stopPx = (this.pos.avgEntryPrice * percent).toFixed(8);
      }
    } else {
      stopPx = Math.floor(this.pos.avgEntryPrice*percent, 10);
    }
    log.log('stopPx='+stopPx);
    return {'stopPx':stopPx, 'ordType':'Stop', 'execInst': 'LastPrice'};
  }
  
  setQty() {
    log.log('method setQty');
    this.current_position_qty = (this.pos['side']) ? this.pos['currentQty'] : 0;
    if (CONST.EXCHANGE.BITMEX === this.exchange.id) {
      // 最大ポジション数量（レバレッジ設定×保有BTC総量×Price最終値）
      if (this.symbol === CONST.SYMBOL_BTC) {
        this.max_position_qty = LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral * this.last;
      // 最大ポジション数量（レバレッジ設定×保有BTC総量×(1/Price最終値)）！！実際は成行注文をするので、この値より多少前後します！！
      } else {
        this.max_position_qty = Number.parseInt(LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral * 1/this.last, 10);
      }
      // 新ポジションの数量(USD)の作成（最大ポジション数量×ロット割合）
      this.new_position_qty = Math.floor(this.max_position_qty * this.LOT_RATE);
    } else {
      this.max_position_qty = LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral;
      // 新ポジションの数量(USD)の作成（最大ポジション数量×ロット割合）
      this.new_position_qty = (this.max_position_qty * this.LOT_RATE).toFixed(2);
    }
    let add_qty = this.new_position_qty - this.current_position_qty;
    log.log('this.current_position_qty='+this.current_position_qty);
    log.log('this.max_position_qty='+this.max_position_qty);
    log.log('this.new_position_qty='+this.new_position_qty);
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
      if (order.symbol === processor.getSymbolPair(this.symbol, this.exchange.id)) {
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
      message += processor.decorateWithBrackets(CONST.MSG_LAST_PRICE) + this.last + processor.decorateWithBrackets(CONST.MSG_TOTAL_COLLATERAL) + this.total_collateral.toFixed(6) + CONST.CRLF;
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
          result = await this.createMarketOrder(CONST.SIDE.SHORT, this.current_position_qty);
        } else if(this.pos['side'] === CONST.SIDE.SHORT) {
          result = await this.createMarketOrder(CONST.SIDE.LONG, this.current_position_qty);
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
      condition = CONST.MSG_ENTRY;
      result = await this.createMarketOrder(CONST.SIDE.LONG, this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else if (this.pos['side'] === CONST.SIDE.LONG) {
      // まだ購入できる証拠金がある場合
      if (this.add_qty > 0) {
        condition = CONST.MSG_ADD;
        result = await this.createMarketOrder(CONST.SIDE.LONG, this.add_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos['side'] === CONST.SIDE.SHORT) {
      if (this.current_position_qty > 0 ) {
        condition= CONST.MSG_CLEARANCE;
        result = await this.createMarketOrder(CONST.SIDE.LONG, this.current_position_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      }
      condition = CONST.MSG_ENTRY;
      result = await this.createMarketOrder(CONST.SIDE.LONG, this.new_position_qty);
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
    result = await this.createStopOrder(CONST.SIDE.SHORT);
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
      result = await this.createMarketOrder(CONST.SIDE.SHORT, this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else if (this.pos['side'] === CONST.SIDE.SHORT) {
      // まだ売買できる証拠金がある場合
      if (this.add_qty > 0) {
        condition = CONST.MSG_ADD;
        result = await this.createMarketOrder(CONST.SIDE.SHORT, this.add_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos['side'] === CONST.SIDE.LONG) {
      if (this.current_position_qty > 0 ) {
        condition = CONST.MSG_CLEARANCE;
        result = await this.createMarketOrder(CONST.SIDE.SHORT, this.current_position_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      }
      condition = CONST.MSG_ENTRY;
      result = await this.createMarketOrder(CONST.SIDE.SHORT, this.new_position_qty);
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
    result = await this.createStopOrder(CONST.SIDE.LONG);
    // メッセージ送信
    this.sendMessage(condition, result);
  }
}

module.exports = Executor;