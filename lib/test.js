// require('dotenv').config();
var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
var processor = require(path.join(__dirname, 'processor.js'));
var orderModule = require(path.join(__dirname, 'order.js'));
var executorModule = require(path.join(__dirname, 'executor.js'));
var logModule = require(path.join(__dirname, 'log.js'));
var Log = new logModule('default');

const LOT_RATE = 0.4 // ロット(割合)
const LEVERAGE = 10    // レバレッジ設定

var sign = null;
// var sign = CONST.SIGN_LONG;
// var sign = CONST.SIGN_SHORT;

// 環境変数セット
var env = CONST.ENV_TEST; // テスト
// var env = CONST.ENV_PROD; // 本番

var symbol = CONST.SYMBOL_BTC;

main();

async function main() {
  
  // // 取引所モジュールをNew
  // var exchangeModule = require(path.join(__dirname, 'exchange.js'));
  // var exchange = new exchangeModule(env);
  // // オーダーモジュール
  // var order = new orderModule();

  // last = await fetchTickerLast();
  // pos = await getPositions();
  // total_btc = await fetchTotalBalance();
  // let qty = await getQty(pos);
  // await doDoten(qty);
  // let order = await fetchOpenOrders();
  // console.log('order='+JSON.stringify(order));
  let executor = new executorModule(env);
  executor.symbol = symbol;
  // await executor.fetchTickerLast();
  // await executor.fetchOpenOrders();
  // await executor.fetchTotalBalance();
  // console.log('executor.exchange='+JSON.stringify(executor.exchange));
  
  // オープンOrderを取得
  let orders = await executor.fetchOpenOrders();
  orders.filter((order, idx) => {
    // オープンOrderをキャンセル
    executor.cancelOpenOrder(order.id);
  });


}