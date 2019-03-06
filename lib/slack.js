// const token = ENV.SLACK_TOKEN
const path = require('path');
const executorModule = require(path.join(__dirname, 'executor.js'));
const CONST = require(path.join(__dirname, 'const.js'));
const CONFIG = require(path.join(__dirname, '../config/config.json'));
const STATE = path.join(__dirname, '../config/state.json');
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

const {CronJob} = require('cron');

// new CronJob('0 34 21 * * *', async() => {
//   await stopProcess();
// }, null, true);
//
// new CronJob('0 59 12 * * *', async() => {
//   await stopProcess();
// }, null, true);
//
// new CronJob('0 59 4 * * *', async() => {
//   await stopProcess();
// }, null, true);

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

new CronJob('0 */3 * * * *', () => {
  log.log('*** cron RUNNING ***');
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
          console.log('Hello redoten '+exchange + ' ' + symbol);
          // 再ドテン
          await reDoten(exchange, symbol, cnl);
        }
        // 損切オーダー再評価
        await revaluateStopPx(exchange, symbol, cnl);
      });
    } else {
      // MODE:OFFの場合リターン
      if (CONST.MODE.OFF === state[exchange][CONST.SYMBOL_BTC].MODE) {
        return true;
      }
      if (state[exchange][CONST.SYMBOL_BTC].REDOTEN) {
        console.log('Hello redoten'+exchange + ' ' + CONST.SYMBOL_BTC);
        // 再ドテン
        await reDoten(exchange, CONST.SYMBOL_BTC, cnl);
      }
      // 損切オーダー再評価
      await revaluateStopPx(exchange, CONST.SYMBOL_BTC, cnl);
    }
  });
}, null, true);

async function reDoten(exchange, symbol, channel) {
  log.log('method reDoten');
  let executor = new executorModule(state[exchange].ENV, rtm, channel, exchange, symbol);
  // ポジション取得
  await executor.calculateQty();
  // 指示サイドと現行サイドが一致していない場合
  if (state[exchange][symbol].SIDE !== executor.pos.side) {
    // かつMODEがONの場合、直近のSIDEを再オーダー
    if (state[exchange][symbol]) {
      if (CONST.MODE.ON === state[exchange][symbol].MODE) {
        let side = state[exchange][symbol].SIDE;
        rtm.sendMessage(CONST.MSG_REDOTEN, channel);
        executor.doten(symbol, side);
      }
    }
  // ポジションを持っている場合
  } else {
    log.log(exchange + " " + symbol + " 正常運転中");
  }
}

async function revaluateStopPx(exchange, symbol, channel) {
  log.log('method revaluateStopPx '+ exchange + ' ' + symbol);
  let executor = new executorModule(state[exchange].ENV, rtm, channel, exchange, symbol);
  // ポジション取得
  await executor.calculateQty();
  // ノーポジの場合
  if (!executor.pos.side) {
    return;
  }
  console.log('side-'+executor.pos.side);
  console.log('last-'+executor.last);
  console.log('avgEntryPrice-'+executor.pos.avgEntryPrice);
  console.log('stopPx-'+executor.stopPx);
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
  const pattern = new RegExp('(TradingView).*([: 5m]|[: 5mTF])(\/)');
  // 5mアラートの場合
  if (event.files && event.files[0].title.match(pattern)) {
    event.text = event.files[0].title.replace(pattern, '');
  }
  console.log('event.text='+event.text);
  var obj = {};
  obj.event = event;
  // stateファイル読み込み
  state = jsonRW.readJson(STATE);
  adminModeFlg = state.ADMIN;
  // channel判定
  if(CONFIG.slack.channel !== event.channel) return;
  channel = event.channel;
  // 受信メッセージ
  var text = event.text.toUpperCase(); // 一律大文字に変換
  log.log('[受信]'+text);
  // adminコマンド判定
  if (judgeAdminCommand(event, text)) return;
  // 実行判定
  if (!judgeExecute(event)) return;
  // 取引所判定
  judgeExchange(text, obj);
  env = state[obj.exchange].ENV;

  // adminコマンドの場合
  if (adminModeFlg) {
    // 環境変更
    if (judgeChangeEnv(event, text, obj)) return;
    // 通貨判定
    if(!judgeSymbol(text, obj)) return;
    // 通貨文字列、半角・全角スペース、取引所文字列を削除
    text = text.replace(obj.symbol, '').replace(/ /g, '').replace(/\//g, '').replace(CONST.EXCHANGE_BITFLYER[0], '');
    // コマンド判定
    if(!judgeCommand(text, obj, event)) return;
    let executor = new executorModule(env, rtm, channel, obj.exchange, obj.symbol);
    // adminコマンド実行
    await executor.adminCommand(obj.command, text);

  // Botアラート受信時
  } else {
    // 実行判定
    if (!judgeExecute(event)) return;
    let alertMessages = event.text.split('/');
    let symbol = alertMessages[0].toUpperCase();
    let alert = alertMessages[1].toUpperCase();
    let side = (CONST.ALERT.LONG === alert) ? CONST.SIDE.BUY : CONST.SIDE.SHORT;
    let exchange = CONST.EXCHANGE.BITMEX;
    if (alertMessages.length === 3) {
      exchange = CONST.EXCHANGE.BITFLYER;
    }
    let executor = new executorModule(env, rtm, channel, exchange);
    // doten処理実行
    await executor.doten(symbol, side);
    // stateファイル最新化
    jsonRW.updateJson_state(exchange, symbol, 'SIDE', side, STATE);
  }
});

function judgeChangeEnv(event, text, obj) {
  let changeEnvFlg = false;
  if (CONST.ENV.TEST === text || CONST.ENV.PROD === text) {
    changeEnvFlg = true;
    env = text;
    jsonRW.updateJson_state(obj.exchange, null, 'ENV', text, STATE);
    rtm.sendMessage(processor.decorateWithBrackets(CONST.MSG_CHANGE_STATE.replace(CONST.MSG_REPLACE_STATE, 'ENV')) + ' ' + processor.decorateWithInlineQuote(env) + ' ' + processor.decorateWithInlineQuote(obj.exchange), event.channel);
  }
  return changeEnvFlg;
}

function judgeAdminCommand(event, text) {
  try {
    let adminCommandFlg = false;
    // admin
    if (event.user === CONFIG.slack.admin_user) {
      //「admin」文字列を含んでいる場合
      if (text.indexOf(CONST.STR_ADMIN) !== -1) {
        adminModeFlg = adminModeFlg ? false : true;
        let msg = adminModeFlg ? processor.decorateWithInlineQuote(CONST.MSG_ADMIN_ON) : processor.decorateWithInlineQuote(CONST.MSG_ADMIN_OFF);
        jsonRW.updateJson_state(null, null, CONST.STR_ADMIN, adminModeFlg, STATE);
        rtm.sendMessage(msg, event.channel);
        adminCommandFlg = true;
      }
    }
    return adminCommandFlg;
  } catch (e) {
    log.errorLog(e);
    rtm.sendMessage(e, event.channel);
  }
}

function judgeExecute(event) {
  try {
    let executeFlg = false;
    // adminモードの場合
    if (adminModeFlg) {
      executeFlg =  true;
    // Botアラート受信の場合
    } else if (event.bot_id !== undefined && event.bot_id === CONFIG.slack.bot_id) {
      executeFlg =  true;
    }
    return executeFlg;
  } catch (e) {
    log.errorLog(e);
    rtm.sendMessage(e, event.channel);
  }
}

function judgeSymbol(text, obj) {
  let symbolFlg = false;
  // 通貨を判定
  CONST.SYMBOL_ALL_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.symbol = CONST.SYMBOL_ALL_ARRAY[idx];
      symbolFlg = true;
    }
  });
  return symbolFlg;
}

function judgeExchange(text, obj) {
  obj.exchange = CONST.EXCHANGE.BITMEX;
  // 通貨を判定
  CONST.EXCHANGE_BITFLYER.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.exchange = CONST.EXCHANGE.BITFLYER;
    }
  });
}

function judgeCommand(text, obj, event) {
  let commandFlg = false;
  obj.command = {};
  // コマンド(レバレッジ)を判定
  CONST.STR_LEVERAGE_ARRAY.some((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.leverageStr = CONST.STR_LEVERAGE_ARRAY[idx];
      commandFlg = true;
    }
  });
  // コマンド(INFO)を判定
  CONST.STR_INFO_ARRAY.some((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.infoStr = CONST.STR_INFO_ARRAY[idx];
      commandFlg = true;
    }
  });
  // コマンド(CLOSE)を判定
  CONST.STR_CLOSE_ARRAY.some((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.closeStr = CONST.STR_CLOSE_ARRAY[idx];
      commandFlg = true;
    }
  });
  // コマンド(BUY)を判定
  CONST.STR_BUY_SIDE_ARRAY.some((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.buyStr = CONST.STR_BUY_SIDE_ARRAY[idx];
      // stateファイル最新化
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'SIDE', 'buy', STATE);
      commandFlg = true;
    }
  });
  // コマンド(SELL)を判定
  CONST.STR_SELL_SIDE_ARRAY.some((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.sellStr = CONST.STR_SELL_SIDE_ARRAY[idx];
      // stateファイル最新化
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'SIDE', 'sell', STATE);
      commandFlg = true;
    }
  });
  if (commandFlg) {
    return commandFlg;
  }
  // // コマンド(MODE)を判定
  // if (text.indexOf(CONST.STR_MODE) !== -1) {

  // }
  // コマンド(ON)を判定
  CONST.STR_MODE_ON_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      if (!state[obj.exchange][obj.symbol]) state[obj.exchange][obj.symbol] = {};
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'MODE', CONST.STR_MODE_ON_ARRAY[0], STATE); // ON
      let msg = obj.symbol + ' ' + processor.decorateWithInlineQuote(CONST.STR_MODE_ON_ARRAY[0]) + ' ' + processor.decorateWithInlineQuote(obj.exchange);
      rtm.sendMessage(msg, event.channel);
    }
  });
  // コマンド(OFF)を判定
  CONST.STR_MODE_OFF_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      if (!state[obj.exchange][obj.symbol]) state[obj.exchange][obj.symbol] = {};
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'MODE', CONST.STR_MODE_OFF_ARRAY[0], STATE); // OFF
      let msg = obj.symbol + ' '+ processor.decorateWithInlineQuote(CONST.STR_MODE_OFF_ARRAY[0]);
      rtm.sendMessage(msg, event.channel);
    }
  });
  // コマンド(ON)を判定
  CONST.STR_REDOTEN_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      if (!state[obj.exchange][obj.symbol]) state[obj.exchange][obj.symbol] = {};
      let switchedRedotenFlg = !state[obj.exchange][obj.symbol].REDOTEN;
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'REDOTEN', switchedRedotenFlg, STATE); // ON
      let retSwitchedRedoten = (switchedRedotenFlg) ? CONST.REDOTEN.ON : CONST.REDOTEN.OFF;
      let msg = CONST.STR_REDOTEN_ARRAY[0] + ' ' + obj.symbol + ' ' + processor.decorateWithInlineQuote(retSwitchedRedoten) + ' ' + processor.decorateWithInlineQuote(obj.exchange);
      rtm.sendMessage(msg, event.channel);
    }
  });
}
