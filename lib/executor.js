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
  constructor(env, rtm, channel, exchange, symbol) {
    log.log('Executor New');
    // ロット_割合
    this.LOT_RATE = CONST.WHOLE_LOT_RATE;
    // this.LOT_RATE = CONST.EXCHANGE.BITMEX === exchange ? CONST.WHOLE_LOT_RATE/2 : CONST.WHOLE_LOT_RATE;
    // 取引所モジュールをNew
    this.exchange = new exchangeModule(env, exchange).exchange;

    // オーダーモジュール
    this.order = new orderModule();
    this.env = env;
    this.throughFlg = false;
    this.doten_side_message = null;

    this.rtm = rtm;
    this.channel = channel;
    this.state = jsonRW.readJson(STATE);
    this.symbol = symbol;

    this.stopLossFlg = true;
    this.amount = 0;
  }

  isExchangeBitmex() {
    return CONST.EXCHANGE.BITMEX === this.exchange.id;
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
    if (this.side === CONST.SIDE.BUY ) {
      // レバレッジを設定
      await this.setLeverage();
      await this.buyLogic();
    }
    // 売りアラート時
    if (this.side === CONST.SIDE.SELL ) {
      // レバレッジを設定
      await this.setLeverage();
      await this.sellLogic();
    }
  }

  async calculateQty() {
    log.log('method calculateQty');
    // レバレッジセット
    this.initLeverage();
    // 最終価格を取得
    this.last = await this.fetchTickerLast();
    // ポジションを取得
    await this.getPositions();
    // BTCトータルバランスを取得
    if (this.isExchangeBitmex()) {
      await this.fetchTotalBalance_bitmex();
    } else {
      await this.fetchTotalBalance_bitflyer();
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
    log.log('method setLeverage');
    let result = {};
    let lv = leverage ? leverage : LEVERAGE[this.exchange.id][this.symbol];
    log.log('lv='+lv);
    log.log('this.isExchangeBitmex()='+this.isExchangeBitmex());
    if (this.isExchangeBitmex()) {
      while (maxRetryCnt > 0) {
        result = await this.order.setLeverage(this.exchange, processor.getSymbolPairPosition(this.symbol), lv);
        if (result.e) await this.retryProcess(result.e);
        if (result.value) break;
      }
      if (result.value) { //加工
        let value = result.value;
        result.value = this.symbol+' x'+value.leverage + ' ' + processor.decorateWithInlineQuote(this.exchange.id);
        LEVERAGE[this.exchange.id][this.symbol] = value.leverage;
        jsonRW.updateJson_state(this.exchange.id, this.symbol, 'LV', value.leverage, STATE);
      } else {
        return log.commonLogProcess(result, CONST.MSG_CHANGE_LEVERAGE);
      }
    } else {
      result.value = this.symbol+' x'+ lv + ' ' + processor.decorateWithInlineQuote(this.exchange.id);
      LEVERAGE[this.exchange.id][this.symbol] = lv;
      jsonRW.updateJson_state(this.exchange.id, this.symbol, 'LV', lv, STATE);
    }
    return log.commonLogProcess(result, CONST.MSG_CHANGE_LEVERAGE);
  }

  async fetchOpenOrders() {
    log.log('method fetchOpenOrders');
    let result = {};
    if (this.isExchangeBitmex()) {
      result = await this.order.fetchOpenOrders(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id));
    } else {
      result = await this.order.getParentOrders(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id));
    }
    return log.commonLogProcess(result, CONST.MSG_GET_OPEN_ODERS).value;
  }

  async cancelOrder(order) {
    log.log('method cancelOrder');
    let result = {};
    if (this.isExchangeBitmex()) {
      result = await this.order.cancelOrder(this.exchange, order.id);
    } else {
      result = await this.order.cancelParentOrder(this.exchange, order.parent_order_id, CONST.BF_FX_BTC_JPY);
    }
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
        this.cancelOrder(order);
      });
    }
  }

  // 最終価格を取得する
  async fetchTickerLast(symbol) {
    log.log('method fetchTickerLast');
    let result = {};
    let symbolPair = null;
    if (!symbol) {
      symbolPair = processor.getSymbolPair(this.symbol, this.exchange.id);
    } else {
      symbolPair = processor.getSymbolPair(symbol, this.exchange.id);
    }
    while (maxRetryCnt > 0) {
      result = await this.order.fetchTicker(this.exchange, symbolPair, 'last');
      if (result.e) await this.retryProcess(result.e);
      if (result.value) break;
    }
    if (result.value) { //加工
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      return log.commonLogProcess(result, CONST.MSG_GET_LAST_PRICE).value;
    } else {
      return log.commonLogProcess(result, CONST.MSG_CHANGE_LEVERAGE);
    }
  }

  // 現在の保有BTC総量を取得
  async fetchTotalBalance_bitmex() {
    log.log('method fetchTotalBalance_bitmex');
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
      return log.commonLogProcess(result, CONST.MSG_GET_BALANCE).value;
    } else {
      return log.commonLogProcess(result, CONST.MSG_GET_BALANCE);
    }
  }

  // 現在の保有BTC総量を取得
  async fetchTotalBalance_bitflyer() {
    log.log('method fetchTotalBalance_bitflyer');
    let result = {};
    while (maxRetryCnt > 0) {
      result = await this.order.getCollateral(this.exchange);
      if (result.e) await this.retryProcess(result.e);
      if (result.value) break;
    }
    maxRetryCnt = CONST.MAX_RETRY_CNT; // リトライ回数リセット
    if (result.value) { // 加工
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      this.open_position_pnl = result.value.open_position_pnl;
      this.total_collateral = (result.value.collateral + result.value.open_position_pnl);
      log.commonLogProcess(result, CONST.MSG_GET_BALANCE).value;
    } else {
      return log.commonLogProcess(result, CONST.MSG_GET_BALANCE);
    }
  }

  // 全ポジションの数量(USD)取得
  async getPositions() {
    log.log('method getPositions');
    let result = {};
    while (maxRetryCnt > 0) {
      result = await this.order.getPositions(this.exchange);
      if (result.e) await this.retryProcess(result.e);
      if (result.value) break;
    }
    maxRetryCnt = CONST.MAX_RETRY_CNT; // リトライ回数リセット
    if (result.value) { // 加工
      this.setPosition(result);
    } else {
      return log.commonLogProcess(result, CONST.MSG_GET_POS_INFO);
    }
  }

  initPosition() {
    this.pos = {};
    this.pos.side = null;
    this.pos.currentQty = 0;
    this.pos.avgEntryPrice = null;
    this.pos.liquidationPrice = null;
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
    // ポジション情報リセット
    this.initPosition();
    if (this.isExchangeBitmex()) {
      this.setPosition_bitmex(result);
    } else {
      this.setPosition_bitflyer(result);
    }
  }

  setPosition_bitmex(result) {
    log.log('method setPosition_bitmex');
    if (result.value && result.value.length !== 0) {
      result.value.filter((position, idx) => {
        if (position.symbol === processor.getSymbolPairPosition(this.symbol)) {
          this.pos.side = (position.currentQty === 0) ? null : (position.currentQty > 0) ? CONST.SIDE.BUY : CONST.SIDE.SELL;
          this.pos.currentQty = (position.currentQty > 0) ? Math.round(position.currentQty).toFixed(2) : -Math.round(position.currentQty).toFixed(2);
          this.pos.avgEntryPrice = position.avgEntryPrice;
          this.pos.liquidationPrice = position.liquidationPrice;
        }
      });
    }
    result.value = this.pos;
    log.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
  }

  setPosition_bitflyer(result) {
    log.log('method setPosition_bitflyer');
    if (result.value && result.value.length !== 0) {
      let sizeList = [];
      let priceList = [];
      result.value.filter((position, idx) => {
        if (CONST.BF_FX_BTC_JPY === position.product_code) {
          this.pos.side = position["side"] === CONST.STR_BUY_SIDE_ARRAY[0] ? CONST.SIDE.BUY : CONST.SIDE.SELL;
          sizeList.push(position["size"]);
          priceList.push(position["price"]);
        }
      });
			// 平均建値を計算する
			this.pos.avgEntryPrice = this.calculateAvg(sizeList, priceList);
			this.pos.currentQty = sizeList.reduce((a,x) => a+=x);
			log.log('avgEntryPrice='+this.pos.avgEntryPrice);
    }
    result.value = this.pos;
    log.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
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
    this.amount = amount ? amount : this.amount;
    log.log('bbb-'+this.env+' '+this.exchange.id+' '+this.amount);
    let retMsg = (CONST.SIDE.BUY === side) ? CONST.MSG_MARKET_BUY : CONST.MSG_MARKET_SELL;
    let result = {};
    while (maxRetryCnt > 0) {
      result = await this.order.createMarketOrder(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id), side, this.amount);
      if (result.e) await this.retryProcess(result.e);
      if (result.value) break;
    }
    maxRetryCnt = CONST.MAX_RETRY_CNT; // リトライ回数リセット
    if (result.value) { // 加工
      let value = result.value;
      let retPrice = value.price ? value.price : this.last;
      log.log('value.price:last='+value.price+':'+this.last);
      let retAmount = value.filled ? value.filled : this.amount;
      result.value = this.symbol+'-'+retPrice+'-'+retAmount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      return log.commonLogProcess(result, retMsg);
    } else {
      return log.commonLogProcess(result, retMsg);
    }
  }

  makeParams_bitflyer(side, amount, stopPx) {
    let params = {
      "order_method": "SIMPLE",
      "minute_to_expire": 10000,
      "time_in_force": "GTC",
      "parameters": [{
        "product_code": CONST.BF_FX_BTC_JPY,
        "condition_type": "STOP_LIMIT",
        "side": side.toUpperCase(),
        "price": stopPx,
        "trigger_price": stopPx,
        "size": amount
      }]
    };
    return params;
  }

  async createStopOrder(takeProfitFlg) {
    let side = (this.pos.side === CONST.SIDE.BUY) ? CONST.SIDE.SELL : CONST.SIDE.BUY;
    log.log('method stoploss '+side);
    let result = {};
    // let amount = this.new_position_qty;
    let amount = this.current_position_qty;
    let params = this.makeStopParams(side, takeProfitFlg);
    while (maxRetryCnt > 0) {
      if (this.isExchangeBitmex()) {
        result = await this.order.createStopOrder_bitmex(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id), side, amount, params);
      } else {
        result = await this.order.createStopOrder_bitflyer(this.exchange, this.makeParams_bitflyer(side, amount, params.stopPx));
      }
      if (result.e) await this.retryProcess(result.e);
      if (result.value) break;
    }
    maxRetryCnt = CONST.MAX_RETRY_CNT; // リトライ回数リセット
    let retMsg = CONST.SIDE.BUY === side ? CONST.MSG_STOPLOSS_BUY : CONST.MSG_STOPLOSS_SELL;
    if (result.value) { // 加工
      let value = result.value;
      log.log('createStopOrder value='+JSON.stringify(value));
      result.value = this.symbol+'-'+params.stopPx+'-'+amount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      return log.commonLogProcess(result, retMsg);
    } else {
      return log.commonLogProcess(result, retMsg);
    }
  }

  getStopLossPercentage() {
    log.log('method getStopLossPercentage');
    return (CONST.BASIC_STOP_LOSS_PERCENTAGE/LEVERAGE[this.exchange.id][this.symbol]).toFixed(2);
  }

  makeStopParams(side, takeProfitFlg) {
    log.log('method makeStopParams '+side);
    let stopPx = 0;
    let percent = 0;
    let ratio = 0;
    // 損切オーダー時
    if (!takeProfitFlg) {
      percent = this.getStopLossPercentage()/100;
      ratio = (CONST.SIDE.BUY === side) ? 1 + percent : 1 - percent;
    // 利確オーダー時
    } else {
      percent = this.getStopLossPercentage()/100/LEVERAGE[this.exchange.id][this.symbol];
      ratio = (CONST.SIDE.BUY === side) ? 1 - percent : 1 + percent;
    }
    if (this.isExchangeBitmex()) {
      if (CONST.SYMBOL_BTC === this.symbol || CONST.SYMBOL_ETH === this.symbol) {
        stopPx = Number.parseInt((Number.parseInt(this.pos.avgEntryPrice, 10)*ratio),10);
      } else {
        let decimalDigit = processor.getDecimalDigit(this.pos.avgEntryPrice);
        stopPx = (this.pos.avgEntryPrice * ratio).toFixed(decimalDigit);
      }
    } else {
      stopPx = Number.parseInt((Number.parseInt(this.pos.avgEntryPrice, 10)*ratio),10);
    }
    log.log('avgEntryPrice:stopPx='+this.pos.avgEntryPrice +':'+stopPx);
    return {'stopPx':stopPx, 'ordType':'Stop', 'execInst': 'LastPrice'};
  }

  async setQty() {
    log.log('method setQty');
    if (this.isExchangeBitmex()) {
      this.current_position_qty = (this.pos.side) ? this.pos.currentQty : 0;
      if (this.symbol === CONST.SYMBOL_BTC) {
        // 最大ポジション数量（レバレッジ設定×保有BTC総量×BTC Price最終値）
        this.max_position_qty = LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral * this.last;
      } else if (this.symbol === CONST.SYMBOL_ETH) {
        // // 最大ポジション数量（レバレッジ設定×保有BTC総量×BTC Price最終値/ETH Price最終値）× (1/this.LOT_RATE) よくわかっていないがBTCの倍にする
        let btc_last = await this.fetchTickerLast(CONST.SYMBOL_BTC);
        this.max_position_qty = LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral * btc_last * 1/this.LOT_RATE;
      } else {
        // 最大ポジション数量（レバレッジ設定×保有BTC総量×(1/Price最終値)）実際は成行注文をするので、この値より多少前後
        this.max_position_qty = Number.parseInt(LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral * 1/this.last, 10);
      }
      // 新ポジションの数量(USD)の作成（最大ポジション数量×ロット割合）
      this.new_position_qty = Math.floor(this.max_position_qty * this.LOT_RATE);
    } else {
      this.current_position_qty = (this.pos.side) ? this.pos.currentQty.toFixed(2) : 0;
      this.max_position_qty = LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral / this.last;
      // 新ポジションの数量(BTC)の作成（最大ポジション数量×ロット割合）
      this.new_position_qty = (this.max_position_qty * this.LOT_RATE).toFixed(2);
    }
    log.log('this.current_position_qty='+this.current_position_qty);
    log.log('this.max_position_qty='+this.max_position_qty);
    log.log('this.new_position_qty='+this.new_position_qty);
    // 指示方向と現在の方向が一致している場合のみ 追加量を設定
    if (this.state[this.exchange.id][this.symbol].SIDE === this.pos.side) {
      let add_qty = (this.new_position_qty - this.current_position_qty).toFixed(2);
      this.add_qty = (add_qty > 0) ? add_qty : 0;
      log.log('add_qty='+add_qty);
    }
  }

  async adminCommand(command, text) {
    log.log('method adminCommand');
    // 売買指示用通貨ペアセット
    this.symbolPair = (CONST.SYMBOL_BASE_ARRAY.indexOf(this.symbol) !== -1) ? this.symbol+CONST.PAIR_SYMBOL_USD : this.symbol+CONST.PAIR_SYMBOL_Z18;
    // 環境変数セット
    this.command = command;
    // QTYを計算
    await this.calculateQty();
    // adminコマンド実行
    await this.adminCommandProcess(text);
  }

  getStopPx(orders) {
    if (this.isExchangeBitmex()) {
      orders.filter((order, idx) => {
        if (order.symbol === processor.getSymbolPair(this.symbol, this.exchange.id)) {
          this.stopPx = order.info.stopPx;
        }
      });
    } else {
      orders.filter((order, idx) => {
        this.stopPx = order.price;
      });
    }
  }

  makeInfoMessage() {
      let message = processor.decorateWithBrackets(CONST.MSG_ENV) + ' ' + processor.decorateWithInlineQuote(this.env)
      + processor.decorateWithBrackets(CONST.MSG_EXCHANGE) + ' ' + processor.decorateWithInlineQuote(this.exchange.id) + CONST.CRLF;
      message += processor.decorateWithBrackets(CONST.MSG_SYMBOL) + this.symbol + ' ' + processor.decorateWithBrackets(CONST.MSG_MODE) + ' ' + processor.decorateWithInlineQuote(this.state[this.exchange.id][this.symbol].MODE) + CONST.CRLF;
      message += processor.decorateWithBrackets(CONST.MSG_LAST_PRICE) + this.last + processor.decorateWithBrackets(CONST.MSG_TOTAL_COLLATERAL) + this.total_collateral.toFixed(6) + CONST.CRLF;
      message += processor.decorateWithBrackets(CONST.MSG_POSITION) + CONST.CRLF;
      message += '>' + processor.decorateWithBrackets(CONST.MSG_POS_SIDE) + ' ' + processor.decorateWithInlineQuote(this.pos.side)
        + processor.decorateWithBrackets(CONST.MSG_POS_QTY) + this.current_position_qty + processor.decorateWithBrackets(CONST.MSG_LV) + (LEVERAGE[this.exchange.id][this.symbol]) + CONST.CRLF;
      let entryPrice = (CONST.SYMBOL_BTC === this.symbol) ? Number.parseInt(this.pos.avgEntryPrice, 10) : this.pos.avgEntryPrice;
      message += '>' + processor.decorateWithBrackets(CONST.MSG_POS_ENTRY_PRICE) + entryPrice + CONST.CRLF;
      message += '>' + processor.decorateWithBrackets(CONST.MSG_POS_STOPLOSS_PRICE) + this.stopPx + CONST.CRLF;
      message += '>' + processor.decorateWithBrackets(CONST.MSG_POS_LIQUIDATION_PRICE) + this.pos.liquidationPrice + CONST.CRLF;
      return message;
  }

  async adminCommandProcess(text) {
    log.log('method adminCommandProcess');
    // コマンド：INFO
    if (this.command.infoStr) {
      // 結果メッセージ送信
      this.rtm.sendMessage(this.makeInfoMessage(), this.channel);
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
        let result = {};
        if (this.pos.side === CONST.SIDE.BUY) {
          result = await this.createMarketOrder(CONST.SIDE.SELL, this.current_position_qty);
        } else if(this.pos.side === CONST.SIDE.SELL) {
          result = await this.createMarketOrder(CONST.SIDE.BUY, this.current_position_qty);
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
      this.rtm.sendMessage(message, this.channel);
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
    this.rtm.sendMessage(message, this.channel);
  }

  async buyLogic() {
    log.log('method buyLogic');
    let result = {};
    this.doten_side_message = CONST.MSG_DOTEN.replace(CONST.REPLACE_STR, 'ロング');
    let condition = null;
    if (this.pos.side === null) {
      condition = CONST.MSG_ENTRY;
      result = await this.createMarketOrder(CONST.SIDE.BUY, this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else if (this.pos.side === CONST.SIDE.BUY) {
      // まだ購入できる証拠金がある場合
      if (this.add_qty > 0) {
        condition = CONST.MSG_ADD;
        result = await this.createMarketOrder(CONST.SIDE.BUY, this.add_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos.side === CONST.SIDE.SELL) {
      if (this.current_position_qty > 0 ) {
        condition= CONST.MSG_CLEARANCE;
        result = await this.createMarketOrder(CONST.SIDE.BUY, this.current_position_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      }
      condition = CONST.MSG_ENTRY;
      result = await this.createMarketOrder(CONST.SIDE.BUY, this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else {
      this.throughFlg = true;
    }
    // 損切りOrder処理
    this.stopOrderProcess(condition);
  }

  async sellLogic() {
    log.log('method sellLogic');
    let result = {};
    this.doten_side_message = CONST.MSG_DOTEN.replace(CONST.REPLACE_STR, 'ショート');
    let condition = null;
    if (this.pos.side === null) {
      condition = CONST.MSG_ENTRY;
      result = await this.createMarketOrder(CONST.SIDE.SELL, this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else if (this.pos.side === CONST.SIDE.SELL) {
      // まだ売買できる証拠金がある場合
      if (this.add_qty > 0) {
        condition = CONST.MSG_ADD;
        result = await this.createMarketOrder(CONST.SIDE.SELL, this.add_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos.side === CONST.SIDE.BUY) {
      if (this.current_position_qty > 0 ) {
        condition = CONST.MSG_CLEARANCE;
        result = await this.createMarketOrder(CONST.SIDE.SELL, this.current_position_qty);
        // メッセージ送信
        this.sendMessage(condition, result);
      }
      condition = CONST.MSG_ENTRY;
      result = await this.createMarketOrder(CONST.SIDE.SELL, this.new_position_qty);
      // メッセージ送信
      this.sendMessage(condition, result);
    } else {
      this.throughFlg = true;
    }
    // 損切りOrder処理
    this.stopOrderProcess(condition);
  }

  async stopOrderProcess(condition) {
    if (!this.stopLossFlg) {
      return;
    }
    let result = {};
    // wait処理
    await new Promise(r => setTimeout(r, 15000));
    // ポジション再取得
    await this.calculateQty();
    // 損切りOrder
    result = await this.createStopOrder();
    // メッセージ送信
    this.sendMessage(condition, result);
  }

  async retryProcess(e) {
    maxRetryCnt--;
    log.log('maxRetryCnt='+maxRetryCnt)
    log.log('e='+JSON.stringify(e));
    await new Promise(r => setTimeout(r, 500));
  }
}

module.exports = Executor;
