// const token = ENV.SLACK_TOKEN
const path = require('path');
const executorModule = require(path.join(__dirname, 'executor.js'));
const CONST = require(path.join(__dirname, 'const.js'));
const CONFIG = require(path.join(__dirname, '../config/config.json'));
const STATE = path.join(__dirname, '../config/state.json');
const BaseModule = require(path.join(__dirname, 'base.js'));
const { RTMClient } = require('@slack/client');
const rtm = new RTMClient(CONFIG.slack.token);
const processor = require(path.join(__dirname, 'processor.js'));
const jsonRW = require(path.join(__dirname, 'jsonRW.js'));
const logModule = require(path.join(__dirname, 'log.js'));
const log = new logModule();

var state = null;
var env = null;
var adminModeFlg = false;
var channel = null;
let Base = new BaseModule();

// グローバルキュー
global.q = new Array();

const {CronJob} = require('cron');

async function stopProcess() {
  let obj = {};
  obj.command = {};
  obj.exchange = CONST.EXCHANGE.BITMEX;
  obj.symbol = CONST.SYMBOL_BTC;
  // stateファイル読み込み
  state = jsonRW.readJson(STATE);
  // チャンネル情報があればセット
  let cnl = (channel) ? channel : CONFIG.slack.channel;
  obj.command.closeStr = CONST.STR_CLOSE_ARRAY[0];
  let executor = new executorModule(state[obj.exchange].ENV, rtm, channel, obj.exchange, obj.symbol);
  // adminコマンド実行
  await executor.adminCommand(obj.command, '');
}

new CronJob('*/20 * * * * *', () => {
  log.log('*** 20s cron RUNNING ***');
  // stateファイル読み込み
  state = jsonRW.readJson(STATE);
  log.log('*** queue件数 '+q.length);
  if (q.length === 0) return;
  let obj = q[0]; // 先頭の要素を取得する
  main(obj);
}, null, true);

new CronJob('0 */8 * * * *', () => {
  log.log('*** 8m cron RUNNING ***');
  // stateファイル読み込み
  state = jsonRW.readJson(STATE);
  // チャンネル情報があればセット
  let cnl = (channel) ? channel : CONFIG.slack.channel;
  Object.keys(CONST.EXCHANGE).forEach(async(key, idx) => {
    let exchange = CONST.EXCHANGE[key];
    if (CONST.EXCHANGE.BITMEX === exchange) {
      CONST.SYMBOL_TRADE_ARRAY.some(async(symbol, idx2) => {
        // MODE:OFFの場合リターン
        if (CONST.MODE.OFF === state[exchange][symbol].MODE) {
          return true;
        }
        if (state[exchange][symbol].REDOTEN) {
          log.log('Hello redoten '+exchange + ' ' + symbol);
          // 再ドテン
          await reDoten(exchange, symbol, cnl);
        }
        if (state[exchange][symbol].STOPLOSS) {
          // 損切オーダー再評価
          await revaluateStopPx(exchange, symbol, cnl);
        }
      });
    } else {
      // MODE:OFFの場合リターン
      if (CONST.MODE.OFF === state[exchange][CONST.SYMBOL_BTC].MODE) {
        return true;
      }
      if (state[exchange][CONST.SYMBOL_BTC].REDOTEN) {
        log.log('Hello redoten'+exchange + ' ' + CONST.SYMBOL_BTC);
        // 再ドテン
        await reDoten(exchange, CONST.SYMBOL_BTC, cnl);
      }
      if (state[exchange][CONST.SYMBOL_BTC].STOPLOSS) {
        // 損切オーダー再評価
        await revaluateStopPx(exchange, CONST.SYMBOL_BTC, cnl);
      }
    }
  });
}, null, true);

async function reDoten(exchange, symbol, channel) {
  log.log('method reDoten');
  let executor = new executorModule(state[exchange].ENV, rtm, channel, exchange, symbol);
  // ポジション取得
  await executor.calculateQty();
  // かつMODEがONの場合、直近のSIDEを再オーダー
  if (state[exchange][symbol]) {
    if (CONST.MODE.ON === state[exchange][symbol].MODE) {
      let side = state[exchange][symbol].SIDE;
      rtm.sendMessage(CONST.MSG_REDOTEN, channel);
      executor.doten(symbol, side);
    }
  }
}

async function revaluateStopPx(exchange, symbol, channel) {
  log.log('method revaluateStopPx '+ exchange + ' ' + symbol);
  let executor = new executorModule(state[exchange].ENV, rtm, channel, exchange, symbol);
  // ポジション取得
  await executor.calculateQty();
  // ノーポジの場合
  if (!executor.pos.side) return;
  // 少量のポジが残っている場合
  if (executor.current_position_qty < 0.1) {
    return await executor.command_close();
  }
  log.log('side-'+executor.pos.side);
  log.log('last-'+executor.last);
  log.log('avgEntryPrice-'+executor.pos.avgEntryPrice);
  log.log('stopPx-'+executor.stopPx);
  // 損切ポジションがない場合
  if (!executor.stopPx) {
    log.log('損切ポジションがない場合');
    executor.stopOrderProcess('SONGIRI');
  // 損切ポジションがある場合
  } else {
    let profit = null;
    let stopLossFlg = true;
    let stopLossRatio = executor.getStopLossPercentage();
    // SIDE:LONGの場合
    if (CONST.SIDE.BUY === executor.pos.side) {
      profit = executor.last - executor.pos.avgEntryPrice;
      stopLossFlg = (executor.pos.avgEntryPrice > executor.stopPx) ? true : false;
    // SIDE:SHORTの場合
    } else {
      profit = executor.pos.avgEntryPrice - executor.last;
      stopLossFlg = (executor.pos.avgEntryPrice < executor.stopPx) ? true : false;
    }
    log.log('profit='+profit);
    log.log('executor.pos.avgEntryPrice * stopLossRatio/100='+executor.pos.avgEntryPrice * stopLossRatio/100);
    // 損切設定が初期値かつ利益方向に損切価格の1倍以上の利益がある場合
    if (stopLossFlg && profit > executor.pos.avgEntryPrice * stopLossRatio/100) {
      // 損切オーダーキャンセル
      executor.fetchAndCancelOpenOrder();
      // 利確オーダー
      let result = await executor.createStopOrder(true);
      // メッセージ送信
      rtm.sendMessage('RIKAKU', result);
    }
  }
}

// Slack RTMスタート
rtm.start();

// Slack message監視
rtm.on('message', async(event) => {
  log.log('event=%o'+JSON.stringify(event));
  // stateファイル読み込み
  state = jsonRW.readJson(STATE);
  adminModeFlg = state.ADMIN;
  // channel判定
  if(CONFIG.slack.channel !== event.channel) return;
  var text = event.text.toUpperCase(); // 一律大文字に変換
  text = text.replace(/ /g, '').replace(/\//g, ''); // 通貨文字列、半角・全角スペースを削除
  log.log('[受信]'+text);
  var obj = {};
  obj.user = event.user;
  obj.channel = event.channel;
  obj.bot_id = event.bot_id;
  obj.id = event.client_msg_id;
  obj.text = text;

  if (!judgeExecute(obj)) return; // 実行判定
  log.log('HAITTTTTTTTTA')
  setObj(obj); // 各種値セット
  obj.env = state[obj.exchange].ENV;
  if (obj.queueTask) {
    // queueに入れる
    q.push(obj);
    log.log('q.push q.length='+q.length);
  }
  main(obj);
});

async function main(obj) {
  log.log('method main');
  if (stateChange(obj)) return; // STATEの変更の場合終了
  let executor = new executorModule(rtm, obj);
  // orderIDが存在(注文済)の場合
  if (obj.orderId) {
    if (await executor.isOrderClosed(obj.orderId, obj.symbol)) {
      log.log('削除はいった！！');
      Base.dequeueById(obj.id);
      await executor.calculateQty();
      executor.command_info(obj);
    }
  }
  // BOT投稿
  if (obj.bot_id !== undefined) {
    // doten処理実行
    await executor.doten(obj);
  } else {
    if (judgeAdminCommand(obj)) return; // adminコマンド判定
    await executor.adminCommand(obj); // adminコマンド実行
  }
}

function judgeAdminCommand(obj) {
  try {
    let adminCommandFlg = false;
    // admin
    if (obj.user === CONFIG.slack.admin_user) {
      //「admin」文字列を含んでいる場合
      if (obj.text.indexOf(CONST.STR_ADMIN) !== -1) {
        adminModeFlg = adminModeFlg ? false : true;
        let msg = adminModeFlg ? processor.decorateWithInlineQuote(CONST.MSG_ADMIN_ON) : processor.decorateWithInlineQuote(CONST.MSG_ADMIN_OFF);
        jsonRW.updateJson_state(null, null, CONST.STR_ADMIN, adminModeFlg, STATE);
        rtm.sendMessage(msg, obj.channel);
        adminCommandFlg = true;
      }
    }
    return adminCommandFlg;
  } catch (e) {
    log.errorLog(e);
    rtm.sendMessage(e, obj.channel);
  }
}

function judgeExecute(obj) {
  try {
    let executeFlg = false;
    if (obj.bot_id !== undefined) {
      if (obj.bot_id === CONFIG.slack.bot_id) {
        executeFlg =  true;
      }
    } else if (adminModeFlg) { // adminモードの場合
      executeFlg =  true;
    // Botアラート受信の場合
    }
    return executeFlg;
  } catch (e) {
    log.errorLog(e);
    rtm.sendMessage(e, obj.channel);
  }
}


function setObj(obj) {
  log.log('setObj');
  setExchange(obj); // 取引所設定
  setSymbol(obj); // 通貨設定
  setCommand(obj); // コマンド判定
  setNumber(obj); // 数値設定
}

function setNumber(obj) {
  log.log('setNumber');
  let val = Number.parseInt(obj.text, 10);
  obj.num = !isNaN(val) ? val : null;
}

function setSymbol(obj) {
  log.log('setSymbol');
  // 通貨を判定
  CONST.SYMBOL_ALL_ARRAY.forEach((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      obj.symbol = CONST.SYMBOL_ALL_ARRAY[idx];
      obj.text = obj.text.replace(str,''); // 文字列削除
    }
  });
}

function setExchange(obj) {
  log.log('setExchange');
  obj.exchange = CONST.EXCHANGE.BITMEX;
  // 通貨を判定
  CONST.EXCHANGE_BITFLYER.forEach((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      obj.exchange = CONST.EXCHANGE.BITFLYER;
      obj.text = obj.text.replace(str,''); // 文字列削除
    }
  });
}

function setCommand(obj) {
  log.log('setCommand');
  // コマンド(レバレッジ)を判定
  CONST.STR_LEVERAGE_ARRAY.some((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      obj.command = CONST.STR_LEVERAGE_ARRAY[0];
      obj.text = obj.text.replace(str,''); // 文字列削除
      return true;
    }
  });
  if (obj.command) return;
  // コマンド(INFO)を判定
  CONST.STR_INFO_ARRAY.some((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      obj.command = CONST.STR_INFO_ARRAY[0];
      obj.text = obj.text.replace(str,''); // 文字列削除
      return true;
    }
  });
  if (obj.command) return;
  // コマンド(CLOSE)を判定
  CONST.STR_CLOSE_ARRAY.some((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      obj.command = CONST.STR_CLOSE_ARRAY[0];
      obj.queueTask = true;
      return true;
    }
  });
  if (obj.command) return;
  // コマンド(BUY)を判定
  CONST.STR_BUY_SIDE_ARRAY.some((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      obj.command = CONST.STR_BUY_SIDE_ARRAY[0];
      obj.text = obj.text.replace(str,''); // 文字列削除
      obj.queueTask = true;
      return true;
      // stateファイル最新化
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'SIDE', 'buy', STATE);
    }
  });
  if (obj.command) return;
  // コマンド(SELL)を判定
  CONST.STR_SELL_SIDE_ARRAY.some((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      obj.command = CONST.STR_SELL_SIDE_ARRAY[0];
      obj.text = obj.text.replace(str,''); // 文字列削除
      obj.queueTask = true;
      return true;
      // stateファイル最新化
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'SIDE', 'sell', STATE);
    }
  });
}

function stateChange(obj) {
  let stateChangeFlg = false;
  // 環境変更判定と変更
  if (CONST.ENV.TEST === obj.text || CONST.ENV.PROD === obj.text) {
    env = obj.text;
    jsonRW.updateJson_state(obj.exchange, null, 'ENV', text, STATE);
    rtm.sendMessage(processor.decorateWithBrackets(CONST.MSG_CHANGE_STATE.replace(CONST.MSG_REPLACE_STATE, 'ENV')) + ' ' + processor.decorateWithInlineQuote(env) + ' ' + processor.decorateWithInlineQuote(obj.exchange), obj.channel);
    stateChangeFlg = true;
  }
  // コマンド(ON)を判定と変更
  CONST.STR_MODE_ON_ARRAY.forEach((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      if (!state[obj.exchange][obj.symbol]) state[obj.exchange][obj.symbol] = {};
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'MODE', CONST.STR_MODE_ON_ARRAY[0], STATE); // ON
      let msg = obj.symbol + ' ' + processor.decorateWithInlineQuote(CONST.STR_MODE_ON_ARRAY[0]) + ' ' + processor.decorateWithInlineQuote(obj.exchange);
      rtm.sendMessage(msg, obj.channel);
      stateChangeFlg = true;
    }
  });
  // コマンド(OFF)を判定と変更
  CONST.STR_MODE_OFF_ARRAY.forEach((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      if (!state[obj.exchange][obj.symbol]) state[obj.exchange][obj.symbol] = {};
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'MODE', CONST.STR_MODE_OFF_ARRAY[0], STATE); // OFF
      let msg = obj.symbol + ' '+ processor.decorateWithInlineQuote(CONST.STR_MODE_OFF_ARRAY[0]);
      rtm.sendMessage(msg, obj.channel);
      stateChangeFlg = true;
    }
  });
  // REDOTENを判定と変更
  CONST.STR_REDOTEN_ARRAY.forEach((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      if (!state[obj.exchange][obj.symbol]) state[obj.exchange][obj.symbol] = {};
      let switchedRedotenFlg = !state[obj.exchange][obj.symbol].REDOTEN;
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'REDOTEN', switchedRedotenFlg, STATE); // ON
      let retSwitchedRedoten = (switchedRedotenFlg) ? CONST.REDOTEN.ON : CONST.REDOTEN.OFF;
      let msg = CONST.STR_REDOTEN_ARRAY[0] + ' ' + obj.symbol + ' ' + processor.decorateWithInlineQuote(retSwitchedRedoten) + ' ' + processor.decorateWithInlineQuote(obj.exchange);
      rtm.sendMessage(msg, obj.channel);
      stateChangeFlg = true;
    }
  });
  // STOPLOSSを判定と変更
  CONST.STR_STOPLOSS_ARRAY.forEach((str, idx) => {
    if (obj.text.indexOf(str) !== -1) {
      if (!state[obj.exchange][obj.symbol]) state[obj.exchange][obj.symbol] = {};
      let switchedStoplossFlg = !state[obj.exchange][obj.symbol].STOPLOSS;
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'STOPLOSS', switchedStoplossFlg, STATE); // ON
      let retSwitchedStoploss = (switchedStoplossFlg) ? CONST.STOPLOSS.ON : CONST.STOPLOSS.OFF;
      let msg = CONST.STR_STOPLOSS_ARRAY[0] + ' ' + obj.symbol + ' ' + processor.decorateWithInlineQuote(retSwitchedStoploss) + ' ' + processor.decorateWithInlineQuote(obj.exchange);
      rtm.sendMessage(msg, obj.channel);
      stateChangeFlg = true;
    }
  });
  return stateChangeFlg;
}
