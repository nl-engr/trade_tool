// require('dotenv').config();
const fs = require('fs');
const path = require('path');
const moment = require('moment')
const csv = require('csv');
require('date-utils');

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
const readTextModule = require(path.join(__dirname, 'readText.js'));
const readText = new readTextModule();


const dt = new Date();
const formatted = dt.toFormat("YYYY-MM-DD");

var FILE = path.join(__dirname, '../data/'+formatted+'_ohlc.csv');

function readCsvSync(filename, options) {
  const fs = require('fs');
  const parse = require('csv-parse/lib/sync');
  const content = fs.readFileSync(filename).toString();
  return parse(content, options);
}
// var log = new logModule();

var LEVERAGE = {};
var maxRetryCnt = CONST.MAX_RETRY_CNT;

class Executor extends Base {
  constructor(rtm, obj) {
    super();
    this.log('Executor New');
    // ロット_割合
    this.LOT_RATE = CONST.WHOLE_LOT_RATE;
    // this.LOT_RATE = CONST.EXCHANGE.BITMEX === exchange ? CONST.WHOLE_LOT_RATE/2 : CONST.WHOLE_LOT_RATE;
    // 取引所モジュールをNew
    this.exchange = new exchangeModule(obj).exchange;

    // オーダーモジュール
    this.order = new orderModule();
    this.env = obj.env;
    this.throughFlg = false;
    this.doten_side_message = null;

    this.rtm = rtm;
    this.channel = obj.channel;
    this.state = jsonRW.readJson(STATE);
    this.symbol = obj.symbol;

    this.stopLossFlg = true;
    this.amount = 0;
    this.client_msg_id = obj.client_msg_id;
  }

  isExchangeBitmex() {
    return CONST.EXCHANGE.BITMEX === this.exchange.id;
  }

  initLeverage() {
    this.log('initLeverage');
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

  isInSwapTimeMex() {
    let nowTime = moment().format('HHmmss');
    this.log('nowTime='+nowTime);
    let swapTime1Start = moment(new Date('2019-01-01 5:00:00').toISOString()).subtract(1,"m").format('HHmmss');
    let swapTime1End = moment(new Date('2019-01-01 5:00:00').toISOString()).add(1,"m").format('HHmmss');
    let swapTime2Start = moment(new Date('2019-01-01 13:00:00').toISOString()).subtract(1,"m").format('HHmmss');
    let swapTime2End = moment(new Date('2019-01-01 13:00:00').toISOString()).add(1,"m").format('HHmmss');
    let swapTime3Start = moment(new Date('2019-01-01 21:00:00').toISOString()).subtract(1,"m").format('HHmmss');
    let swapTime3End = moment(new Date('2019-01-01 21:00:00').toISOString()).add(1,"m").format('HHmmss');
    if ((nowTime >= swapTime1Start && nowTime <= swapTime1End) ||
        (nowTime >= swapTime2Start && nowTime <= swapTime2End) ||
        (nowTime >= swapTime3Start && nowTime <= swapTime3End))
    {
      this.log('isInSwapTimeMex='+nowTime);
      return true;
    } else {
      false;
    }
  }

  isMaintenanceTimeBF() {
    let nowTime = moment().format('HHmmss');
    this.log('nowTime='+nowTime);
    let swapTime1Start = moment(new Date('2019-01-01 4:00:00').toISOString()).subtract(1,"m").format('HHmmss');
    let swapTime1End = moment(new Date('2019-01-01 4:10:00').toISOString()).add(1,"m").format('HHmmss');
    if ((nowTime >= swapTime1Start && nowTime <= swapTime1End))
    {
      this.log('isMaintenanceTimeBF='+nowTime);
      return true;
    } else {
      false;
    }
  }

  async doten(obj) {
    this.log('method doten');
    this.log('doten obj='+JSON.stringify(obj));
    if (this.isExchangeBitmex()) {
      if(this.isInSwapTimeMex()) return;
    } else {
      if(this.isMaintenanceTimeBF()) return;
    }
    // 環境変数セット
    this.symbol = obj.symbol;
    this.side = obj.side;
    // 最終価格を取得
    this.last = await this.getLastPrice();
    // オープンOrderがあればキャンセル
    await this.fetchAndCancelOpenOrderAll(obj);

    // // bFの場合、直近の1分足データを見て売買エントリー判断
    // if (!this.isExchangeBitmex()) {
    //   if (!this.isEntryConditionOK(obj.side)) {
    //     this.log('SIDE:'+obj.side+'--------直近1分足売買判断：エントリー条件NG');
    //     return; // 売買エントリーしない
    //   } else {
    //     this.log('SIDE:'+obj.side+'--------直近1分足売買判断：エントリー条件OK');
    //   }
    // }
    // // 最終価格を取得
    // let latest = await this.fetchTickerLast();
    // this.last = latest;
    // this.log('last:latest='+last+':'+JSON.stringify(latest));
    // // 最終価格に変動がある場合
    // if (latest !== last) {
    //   last = latest;
    //   // オープンOrderがあればキャンセル
    //   await this.fetchAndCancelOpenOrderAll(obj);
    // }
    // QTYを計算
    let result = await this.calculateQty();
    if (result.e) return; // メンテナンス等の場合
    // ドテン処理実行
    await this.dotenProcess(obj);
  }

  async dotenProcess(obj) {
    this.log('method dotenProcess');
    this.log('obj.side='+obj.side);
    // 買いアラート時
    if (obj.side === CONST.SIDE.BUY ) {
      // レバレッジを設定
      // await this.setLeverage();
      await this.buyLogic(obj);
    }
    // 売りアラート時
    if (obj.side === CONST.SIDE.SELL ) {
      // レバレッジを設定
      // await this.setLeverage();
      await this.sellLogic(obj);
    }
  }

  async calculateQty() {
    this.log('method calculateQty');
    // レバレッジセット
    this.initLeverage();
    // ポジションを取得
    let result = await this.getPositions();
    // メンテナンス等で取得できない場合
    if (result.e) return result; // 後続処理を実施しない
    // BTCトータルバランスを取得
    // priceファイル読み込み
    let total_collateralData = jsonRW.readJson(BALANCE);
    let total_collateral = total_collateralData[this.exchange.id][this.symbol].total_collateral;
    this.log(total_collateral);
    this.total_collateral = total_collateral;

    // QTYを取得
    await this.setQty();
    return result;
    // TODO
    // // Openオーダー情報を取得
    // let orders = await this.fetchOpenOrders();
    // if (orders.length !== 0) {
    //   // 損切価格を取得
    //   this.getStopPx(orders);
    // }
  }

  async setLeverage(leverage) {
    this.log('method setLeverage');
    let result = {};
    let lv = leverage ? leverage : LEVERAGE[this.exchange.id][this.symbol];
    this.log('lv='+lv);
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
        return this.commonLogProcess(result, CONST.MSG_CHANGE_LEVERAGE);
      }
    } else {
      result.value = this.symbol+' x'+ lv + ' ' + processor.decorateWithInlineQuote(this.exchange.id);
      LEVERAGE[this.exchange.id][this.symbol] = lv;
      jsonRW.updateJson_state(this.exchange.id, this.symbol, 'LV', lv, STATE);
    }
    return this.commonLogProcess(result, CONST.MSG_CHANGE_LEVERAGE);
  }

  async fetchOpenOrders() {
    this.log('method fetchOpenOrders');
    let result = {};
    if (this.isExchangeBitmex()) {
      result = await this.order.fetchOpenOrders(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id));
    } else {
      result = await this.order.fetchOpenOrders(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id));
    }
    return this.commonLogProcess(result, CONST.MSG_GET_OPEN_ODERS).value;
  }

  async fetchClosedOrders() {
    this.log('method fetchClosedOrders');
    let result = await this.order.fetchClosedOrders(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id));
    return this.commonLogProcess(result, CONST.MSG_GET_CLOSED_ODERS).value;
  }

  async cancelOrder(order, obj) {
    this.log('method cancelOrder');
    this.log('order='+JSON.stringify(order));
    let result = {};
    this.log('cancelOrder this.isExchangeBitmex()'+this.isExchangeBitmex());
    let isExchangeBitmex = obj.exchange || this.exchange.id;
    this.log('cancelOrder isExchangeBitmex='+isExchangeBitmex);
    if (isExchangeBitmex) {
      this.log('order.id='+order.id);
      result = await this.order.cancelOrder(this.exchange, order.id, processor.getSymbolPair(CONST.SYMBOL_BTC, this.exchange.id));
    } else {
      this.log('order.info.child_order_id='+order.info.child_order_id);
      result = await this.order.cancelOrder(this.exchange, order.info.child_order_id, CONST.BF_FX_BTC_JPY);
      result = await this.order.cancelOrder(this.exchange, order.id, CONST.BF_FX_BTC_JPY);
    }
    return this.commonLogProcess(result, CONST.MSG_CANCEL_ORDER).value;
  }

  async fetchAndCancelOpenOrderAll(obj) {
    this.log('method fetchAndCancelOpenOrderAll');
    // オープンOrderを取得
    let orders = await this.fetchOpenOrders();
    if (orders) {
      orders.filter(async(order, idx) => {
        // exchange ReNew
        this.exchange = new exchangeModule(obj).exchange;
        // wait処理
        await new Promise(r => setTimeout(r, 1000));
        // オープンOrderをキャンセル
        await this.cancelOrder(order, obj);
      });
    }
  }

  async isOrderClosed(orderId, symbol) {
    this.log('method isOrderClosed');
    let isClosed = false;
    // オープンOrderを取得
    let orders = await this.fetchClosedOrders();
    // this.log('orders='+JSON.stringify(orders));
    if (orders) {
      orders.some((order, idx) => {
        let id = (this.isExchangeBitmex()) ? order.info.orderID : order.id;
        if (orderId === order.id) {
          isClosed = true;
          return true;
        }
      });
    }
    return isClosed;
  }

  // 最終価格を取得する
  async fetchTickerLast(symbol) {
    this.log('method fetchTickerLast');
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
      return this.commonLogProcess(result, CONST.MSG_GET_LAST_PRICE).value;
    } else {
      return this.commonLogProcess(result, CONST.MSG_GET_LAST_PRICE);
    }
  }

  // 最終価格を取得する
  async getLastPrice(symbol) {
    this.log('method getLastPrice');
    let useSymbol = this.symbol;
    if (symbol) {
      useSymbol = symbol;
    }
    // priceファイル読み込み
    let priceData = jsonRW.readJson(PRICE);
    let lastTime = priceData[this.exchange.id][useSymbol].lastTime;
    let lastPrice = priceData[this.exchange.id][useSymbol].price;
    // 5分以上昔の価格の場合、最新を取得
    if (moment.unix(lastTime).add(5, 'minutes') < moment().unix()) {
      lastPrice = await this.fetchTickerLast();
    }
    this.log('lastPrice='+lastPrice);
    return lastPrice;
  }

  // 全ポジションの数量(USD)取得
  async getPositions() {
    this.log('method getPositions');
    let result = {};
    while (maxRetryCnt > 0) {
      result = await this.order.getPositions(this.exchange);
      if (result.e) await this.retryProcess(result.e);
      if (result.value) break;
    }
    maxRetryCnt = CONST.MAX_RETRY_CNT; // リトライ回数リセット
    if (result.value) { // 加工
      this.setPosition(result);
      return result;
    } else {
      return this.commonLogProcess(result, CONST.MSG_GET_POS_INFO);
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
    this.log('method setPosition');
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
    this.log('method setPosition_bitmex');
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
    this.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
  }

  setPosition_bitflyer(result) {
    this.log('method setPosition_bitflyer');
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
      this.log('this.pos.currentQty='+this.pos.currentQty);
			this.log('avgEntryPrice='+this.pos.avgEntryPrice);
    }
    result.value = this.pos;
    this.commonLogProcess(result, CONST.MSG_GET_POS_INFO).value;
  }

  readLatestOhlc() {
    this.log('method readLatestOhlc');
    const options = { columns: ['time','o','h','l','c','v']};
    const ohlcList = readCsvSync(path.join(__dirname, '../data/'+formatted+'_ohlc.csv'), options).reverse();
    let ohlcTime = ohlcList[0]['time'];
    // 取得したOHLCデータが1分以上過去の場合、足データがなく判定不能なため、例外的にlast価格を返却する
    if (moment() > moment(ohlcTime,'YYYY/MM/DD hh:mm:ss').add(1,'minutes')) {
      this.log('method readLatestOhlc OHLCデータが1分以上過去');
      return [this.last,this.last,this.last,this.last];
    }
    let ohlc = ohlcList.slice(0,1)[0];
    console.log(ohlc);
    return [Number(ohlc['o']),Number(ohlc['h']),Number(ohlc['l']),Number(ohlc['c'])];
  }

  // 指値指示
  async createLimitOrder(side, amount, price) {
    this.log('method createLimitOrder '+side);
    let priceData = jsonRW.readJson(PRICE);
    amount = (this.isExchangeBitmex()) ? Math.round(amount) : amount;
    if (this.isExchangeBitmex()) {
      price = price ? price : (CONST.SIDE.BUY === side) ? (this.last-0.5) : (this.last+0.5);
    } else {

      // let ohlc = await readText.readLast('../data/ohlc.txt');
      let ohlc = this.readLatestOhlc();
      let high = Number.parseInt(ohlc[1]);
      let low = Number.parseInt(ohlc[2]);
      // let high = priceData[this.exchange.id][this.symbol].high;
      // let low = priceData[this.exchange.id][this.symbol].low;
      this.log('high='+high);
      this.log('low='+low);
      let buyPrice = Number.parseInt((high+low)/2 - (high-low)/4);
      let sellPrice = Number.parseInt((high+low)/2 + (high-low)/4);
      // let buyPrice = Number.parseInt((high+low)/2);
      // let sellPrice = Number.parseInt((high+low)/2);
      this.log('buyPrice='+buyPrice);
      this.log('sellPrice='+sellPrice);
      price = (CONST.SIDE.BUY === side) ? buyPrice : sellPrice;
    }
    // price = price ? price : this.last;
    this.log('env:'+this.env+',exchange:'+this.exchange.id+',amount:'+amount+',price:'+price);
    let retMsg = (CONST.SIDE.BUY === side) ? CONST.MSG_MARKET_BUY : CONST.MSG_MARKET_SELL;
    let result = {};
    while (maxRetryCnt > 0) {
      result = await this.order.createLimitOrder(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id), side, amount, price);
      if (result.value) break;
      if (result.e) await this.retryProcess(result.e);
    }
    maxRetryCnt = CONST.MAX_RETRY_CNT; // リトライ回数リセット
    if (result.value) { // 加工
      this.log('result='+JSON.stringify(result));
      // this.log('id='+id);
      let info = result.value.info;
      // let orderId = (this.isExchangeBitmex()) ? info.orderID : info.child_order_acceptance_id;

      // if (id !== undefined) this.addOrderId(id, orderId); // キューに注文情報追加
      let value = result.value;
      let retPrice = value.price ? value.price : price;
      let retAmount = value.filled ? value.filled : amount;
      result.value = this.symbol+'-'+retPrice+'-'+retAmount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      return this.commonLogProcess(result, retMsg);
    }
  }

  // 成行指示
  async createMarketOrder(side, amount) {
    this.log('method createMarketOrder '+side);
    amount = amount ? amount : this.amount;
    this.log('env:'+this.env+',exchange:'+this.exchange.id+',amount:'+amount);
    let retMsg = (CONST.SIDE.BUY === side) ? CONST.MSG_MARKET_BUY : CONST.MSG_MARKET_SELL;
    let result = {};
    while (maxRetryCnt > 0) {
      result = await this.order.createMarketOrder(this.exchange, processor.getSymbolPair(this.symbol, this.exchange.id), side, amount);
      if (result.e) await this.retryProcess(result.e);
      if (result.value) break;
    }
    maxRetryCnt = CONST.MAX_RETRY_CNT; // リトライ回数リセット
    if (result.value) { // 加工
      let value = result.value;
      let retPrice = value.price ? value.price : this.last;
      this.log('value.price:last='+value.price+':'+this.last);
      let retAmount = value.filled ? value.filled : amount;
      result.value = this.symbol+'-'+retPrice+'-'+retAmount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      // リトライ回数リセット
      maxRetryCnt = CONST.MAX_RETRY_CNT;
      return this.commonLogProcess(result, retMsg);
    } else {
      return this.commonLogProcess(result, retMsg);
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
    this.log('method stoploss '+side);
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
      this.log('createStopOrder value='+JSON.stringify(value));
      result.value = this.symbol+'-'+params.stopPx+'-'+amount+'-x'+ LEVERAGE[this.exchange.id][this.symbol] + CONST.CRLF;
      return this.commonLogProcess(result, retMsg);
    } else {
      return this.commonLogProcess(result, retMsg);
    }
  }

  getStopLossPercentage() {
    this.log('method getStopLossPercentage');
    return (CONST.BASIC_STOP_LOSS_PERCENTAGE/LEVERAGE[this.exchange.id][this.symbol]).toFixed(2);
  }

  makeStopParams(side, takeProfitFlg) {
    this.log('method makeStopParams '+side);
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
    this.log('avgEntryPrice:stopPx='+this.pos.avgEntryPrice +':'+stopPx);
    return {'stopPx':stopPx, 'ordType':'Stop', 'execInst': 'LastPrice'};
  }

  async setQty() {
    this.log('method setQty');
    if (this.isExchangeBitmex()) {
      this.current_position_qty = (this.pos.side) ? Number.parseInt(this.pos.currentQty) : 0;
      if (this.symbol === CONST.SYMBOL_BTC) {
        // 最大ポジション数量（レバレッジ設定×保有BTC総量×BTC Price最終値）
        this.max_position_qty = Number.parseInt(Math.floor((LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral * this.last * 100)) / 100);
      } else if (this.symbol === CONST.SYMBOL_ETH) {
        // // 最大ポジション数量（レバレッジ設定×保有BTC総量×BTC Price最終値/ETH Price最終値）× (1/this.LOT_RATE) よくわかっていないがBTCの倍にする
        let btc_last = await this.getLastPrice(CONST.SYMBOL_BTC);
        this.max_position_qty = LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral * btc_last * 1/this.LOT_RATE;
      } else {
        // 最大ポジション数量（レバレッジ設定×保有BTC総量×(1/Price最終値)）実際は成行注文をするので、この値より多少前後
        this.max_position_qty = Number.parseInt(LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral * 1/this.last, 10);
      }
      // 新ポジションの数量(USD)の作成（最大ポジション数量×ロット割合）
      this.new_position_qty = Number.parseInt(Math.floor((this.max_position_qty * this.LOT_RATE * 100)) / 100);
      // 追加量を設定
      let add_qty = (this.new_position_qty - this.current_position_qty).toFixed(2);
      this.add_qty = (add_qty > 0) ? Number.parseInt(add_qty) : 0;

    } else {
      this.current_position_qty = (this.pos.side) ? Math.floor((this.pos.currentQty * 100)) / 100 : 0;
      this.max_position_qty =  Math.floor(((LEVERAGE[this.exchange.id][this.symbol] * this.total_collateral / this.last * this.LOT_RATE).toFixed(2)) * 100) / 100;
      // 新ポジションの数量(BTC)の作成（最大ポジション数量×ロット割合）
      this.new_position_qty =  Math.floor(((this.max_position_qty * this.LOT_RATE).toFixed(2)) * 100) / 100;
      // 追加量を設定
      let add_qty = (this.new_position_qty - this.current_position_qty).toFixed(2);
      this.add_qty = (add_qty > 0) ? add_qty : 0;

    }
    this.log('this.current_position_qty='+this.current_position_qty);
    this.log('this.max_position_qty='+this.max_position_qty);
    this.log('this.new_position_qty='+this.new_position_qty);
    this.log('this.add_qty='+this.add_qty);
  }

  async adminCommand(obj) {
    this.log('method adminCommand');
    // 売買指示用通貨ペアセット
    this.symbolPair = (CONST.SYMBOL_BASE_ARRAY.indexOf(obj.symbol) !== -1) ? obj.symbol+CONST.PAIR_SYMBOL_USD : obj.symbol+CONST.PAIR_SYMBOL_Z18;
    // 環境変数セット
    this.command = obj.command;
    this.log('this.command='+this.command)
    // adminコマンド実行
    await this.adminCommandProcess(obj);
  }

  getStopPx(orders) {
    this.log('method getStopPx');
    if (this.isExchangeBitmex()) {
      orders.some((order, idx) => {
        if (order.symbol === processor.getSymbolPair(this.symbol, this.exchange.id)) {
          this.stopPx = order.info.stopPx;
          return true;
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

  async command_info(obj) {
    await new Promise(r => setTimeout(r, 10000)); // wait処理
    await this.calculateQty();
    // 結果メッセージ送信
    this.rtm.sendMessage(this.makeInfoMessage(), this.channel);
  }

  async command_change_leverage(obj) {
    let result = await this.setLeverage(obj.num);
    this.sendMessage(null, result);
  }

  async command_close(obj) {
    this.log('method command_close');
    // ポジションがある場合
    if (this.current_position_qty > 0 ) {
      let orderSide = (this.pos.side === CONST.SIDE.BUY) ? CONST.SIDE.SELL : (this.pos.side === CONST.SIDE.SELL) ? CONST.SIDE.BUY : null;
      let result = await this.createLimitOrder(orderSide, this.current_position_qty);
      // this.sendMessage(CONST.MSG_CLEARANCE, result);
    } else {
      // this.dequeueById(obj.id); // キューから削除
    }
  }

  async adminCommandProcess(obj) {
    this.log('method adminCommandProcess');
    if (!obj.queueTask) {
      // 最終価格を取得
      this.last = await this.getLastPrice();
      // last = this.last;
      // コマンド：INFO
      if (this.command === CONST.STR_INFO_ARRAY[0]) {
        this.command_info();
      // コマンド：レバレッジ変更
      } else if (this.command === CONST.STR_LEVERAGE_ARRAY[0]) {
        // QTYを計算
        await this.calculateQty();
        return await this.command_change_leverage(obj);
      }
    } else {
      // MODE判定
      this.log('MODE='+this.state[this.exchange.id][this.symbol].MODE);
      if (CONST.STR_MODE_OFF_ARRAY[0] === this.state[this.exchange.id][this.symbol].MODE) return;
      // 最終価格を取得
      this.last = await this.getLastPrice();
      // オープンOrderがあればキャンセル
      await this.fetchAndCancelOpenOrderAll(obj);
      // let latest = await this.fetchTickerLast();
      // this.last = latest;
      // this.log('last:latest='+last+':'+JSON.stringify(latest));
      // // 最終価格に変動がある場合
      // if (latest !== last) {
      //   last = latest;
      //   // オープンOrderがあればキャンセル
      //   await this.fetchAndCancelOpenOrderAll(obj);
      // }
      // QTYを計算
      let result = await this.calculateQty();
      if (result.e) return; // メンテナンス等の場合
      // コマンド：CLOSE
      if (this.command === CONST.STR_CLOSE_ARRAY[0]) {
        await this.command_close(obj);
      // コマンド：BUY
      } else if (this.command === CONST.STR_BUY_SIDE_ARRAY[0]) {
        // レバレッジを設定
        // await this.setLeverage();
        await this.buyLogic(obj);
      // コマンド：SELL
      } else if (this.command === CONST.STR_SELL_SIDE_ARRAY[0]) {
        // レバレッジを設定
        // await this.setLeverage();
        await this.sellLogic(obj);
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

  isEntryConditionOK(side) {
    const options = { columns: ['time','o','h','l','c','v']};
    const ohlcList = readCsvSync(path.join(__dirname, '../data/'+formatted+'_ohlc.csv'), options).reverse();
    let ohlcTime = ohlcList[0]['time'];
    // 取得したOHLCデータが1分以上過去の場合、足データがなく判定不能なため、例外的に実行OKとする
    if (moment() > moment(ohlcTime,'YYYY/MM/DD hh:mm:ss').add(1,'minutes')) {
      return true;
    }
    // OHLCデータは正常だが、件数が判定に満たない場合falseを返す
    if (ohlcList.length < 8) {
      return false;
    }
    let ohlc1 = ohlcList.slice(0,4); // 直近の15秒足*4
    let ohlc1mean = (Number(ohlc1[0]['o']) + Number(ohlc1[1]['o']) + Number(ohlc1[2]['o']) + Number(ohlc1[3]['o'])
      + Number(ohlc1[0]['h']) + Number(ohlc1[1]['h']) + Number(ohlc1[2]['h']) + Number(ohlc1[3]['h'])
      + Number(ohlc1[0]['l']) + Number(ohlc1[1]['l']) + Number(ohlc1[2]['l']) + Number(ohlc1[3]['l'])
      + Number(ohlc1[0]['c']) + Number(ohlc1[1]['c']) + Number(ohlc1[2]['c']) + Number(ohlc1[3]['c'])
    ) / 16;
    let ohlc2 = ohlcList.slice(4,8); // 1分以上前の直近の15秒足*4
    let ohlc2mean = (Number(ohlc2[0]['o']) + Number(ohlc2[1]['o']) + Number(ohlc2[2]['o']) + Number(ohlc2[3]['o'])
      + Number(ohlc2[0]['h']) + Number(ohlc2[1]['h']) + Number(ohlc2[2]['h']) + Number(ohlc2[3]['h'])
      + Number(ohlc2[0]['l']) + Number(ohlc2[1]['l']) + Number(ohlc2[2]['l']) + Number(ohlc2[3]['l'])
      + Number(ohlc2[0]['c']) + Number(ohlc2[1]['c']) + Number(ohlc2[2]['c']) + Number(ohlc2[3]['c'])
    ) / 16;
    this.log('ohlc1mean='+ohlc1mean);
    this.log('ohlc2mean='+ohlc2mean);
    let judgePrice = (
      Number(ohlc1[0]['h']) + Number(ohlc1[1]['h']) + Number(ohlc1[2]['h']) + Number(ohlc1[3]['h'])
      - Number(ohlc1[0]['l']) - Number(ohlc1[1]['l']) - Number(ohlc1[2]['l']) - Number(ohlc1[3]['l'])
    ) / 16
    this.log('judgePrice='+judgePrice);
    if (CONST.SIDE.BUY === side) {
      return (ohlc1mean > ohlc2mean + judgePrice);
    } else if (CONST.SIDE.SELL === side) {
      return (ohlc1mean < ohlc2mean - judgePrice);
    }
  }

  async buyLogic(obj) {
    this.log('method buyLogic');
    this.log('this.pos.side='+this.pos.side);
    let result = {};
    this.doten_side_message = CONST.MSG_DOTEN.replace(CONST.REPLACE_STR, 'ロング');
    // let condition = null;
    if (this.pos.side === null) {
      // condition = CONST.MSG_ENTRY;
      result = await this.createLimitOrder(CONST.SIDE.BUY, this.new_position_qty);
      // // メッセージ送信
      // this.sendMessage(condition, result);
    } else if (this.pos.side === CONST.SIDE.BUY) {
      // まだ購入できる証拠金がある場合
      let min_add_qty = (this.isExchangeBitmex()) ? CONST.MIN_ADD_QTY_MEX : CONST.MIN_ADD_QTY_BF;
      if (this.add_qty >= min_add_qty) {
        // condition = CONST.MSG_ADD;
        result = await this.createLimitOrder(CONST.SIDE.BUY, this.add_qty);
        // メッセージ送信
        // this.sendMessage(condition, result);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos.side === CONST.SIDE.SELL) {
      if (this.current_position_qty > 0 ) {
        // condition= CONST.MSG_CLEARANCE;
        this.log('this.current_position_qty+this.new_position_qty='+(this.current_position_qty+this.new_position_qty));
        let orderQty = (this.current_position_qty+this.new_position_qty).toFixed(2);
        orderQty = (orderQty > this.max_position_qty) ? this.max_position_qty : orderQty;
        result = await this.createLimitOrder(CONST.SIDE.BUY, orderQty);
        // // メッセージ送信
        // this.sendMessage(condition, result);
      } else {
        // condition = CONST.MSG_ENTRY;
        result = await this.createLimitOrder(CONST.SIDE.BUY, this.new_position_qty);
        // メッセージ送信
        // this.sendMessage(condition, result);
      }
      // if (this.current_position_qty > 0 ) {
      //   condition = CONST.MSG_CLEARANCE+' '+CONST.MSG_ENTRY;
      //   result = await this.createLimitOrder(CONST.SIDE.BUY, (this.current_position_qty+this.new_position_qty), obj.id);
      //   // メッセージ送信
      //   this.sendMessage(condition, result);
      // }
    } else {
      this.throughFlg = true;
    }
    if (this.throughFlg) {
      console.log('through this.pos.side:add_qty'+this.pos.side +':'+this.add_qty);
      // this.dequeueById(obj.id); // キューから削除
    }
    if (this.state[this.exchange.id][this.symbol].STOPLOSS) {
      // 損切りOrder処理
      this.stopOrderProcess(CONST.MSG_ENTRY);
    }
  }

  async sellLogic(obj) {
    this.log('method sellLogic');
    this.log('this.pos.side='+this.pos.side);
    let result = {};
    this.doten_side_message = CONST.MSG_DOTEN.replace(CONST.REPLACE_STR, 'ショート');
    // let condition = null;
    if (this.pos.side === null) {
      // condition = CONST.MSG_ENTRY;
      result = await this.createLimitOrder(CONST.SIDE.SELL, this.new_position_qty);
      // メッセージ送信
      // this.sendMessage(condition, result);
    } else if (this.pos.side === CONST.SIDE.SELL) {
      // まだ売買できる証拠金がある場合
      let min_add_qty = (this.isExchangeBitmex()) ? CONST.MIN_ADD_QTY_MEX : CONST.MIN_ADD_QTY_BF;
      if (this.add_qty >= min_add_qty) {
        // condition = CONST.MSG_ADD;
        result = await this.createLimitOrder(CONST.SIDE.SELL, this.add_qty);
        // メッセージ送信
        // this.sendMessage(condition, result);
      } else {
        this.throughFlg = true;
      }
    } else if (this.pos.side === CONST.SIDE.BUY) {
      if (this.current_position_qty > 0 ) {
        // condition = CONST.MSG_CLEARANCE;
        this.log('this.current_position_qty+this.new_position_qty='+(this.current_position_qty+this.new_position_qty));
        let orderQty = (this.current_position_qty+this.new_position_qty).toFixed(2);
        orderQty = (orderQty > this.max_position_qty) ? this.max_position_qty : orderQty;
        result = await this.createLimitOrder(CONST.SIDE.SELL, orderQty);
        // // メッセージ送信
        // this.sendMessage(condition, result);
      } else {
        // condition = CONST.MSG_ENTRY;
        result = await this.createLimitOrder(CONST.SIDE.SELL, this.new_position_qty);
        // // メッセージ送信
        // this.sendMessage(condition, result);
      }
      // if (this.current_position_qty > 0 ) {
      //   condition = CONST.MSG_CLEARANCE+' '+CONST.MSG_ENTRY;
      //   result = await this.createLimitOrder(CONST.SIDE.SELL, (this.current_position_qty+this.new_position_qty), obj.id);
      //   // メッセージ送信
      //   this.sendMessage(condition, result);
      // }
    } else {
      this.throughFlg = true;
    }
    if (this.throughFlg) {
      console.log('through this.pos.side:add_qty'+this.pos.side +':'+this.add_qty);
      // this.dequeueById(obj.id); // キューから削除
    }
    if (this.state[this.exchange.id][this.symbol].STOPLOSS) {
      // 損切りOrder処理
      this.stopOrderProcess(CONST.MSG_ENTRY);
    }
  }

  async stopOrderProcess(condition) {
    this.log('method stopOrderProcess');
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
    this.log('method retryProcess');
    maxRetryCnt--;
    this.log('maxRetryCnt='+maxRetryCnt)
    this.log('e='+JSON.stringify(e));
    if (this.isExchangeBitmex()) {
      await new Promise(r => setTimeout(r, 1000));
    } else {
      await new Promise(r => setTimeout(r, 100));
    }
  }
}

module.exports = Executor;
