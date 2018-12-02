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

new CronJob('0 */30 * * * *', () => {
  console.log('Hello');
  // stateファイル読み込み
  state = jsonRW.readJson(STATE);
  Object.keys(CONST.EXCHANGE).forEach(async(key, idx) => {
    let exchange = CONST.EXCHANGE[key];
    if (CONST.EXCHANGE.BITMEX === exchange) {
      CONST.SYMBOL_TRADE_ARRAY.forEach(async(symbol, idx2) => {
        // 再ドテン
        await reDoten(exchange, symbol);
      });
    } else {
      // 再ドテン
      await reDoten(exchange, CONST.SYMBOL_BTC);
    }
  });
}, null, true);

async function reDoten(exchange, symbol) {
  let executor = new executorModule(env, rtm, channel, exchange, symbol);
  // ポジション取得
  let pos = await executor.getPositions();
  // ノーポジかつMODEがONの場合、直近のSIDEを再オーダー
  if(!pos.side) {
    if (state[exchange][symbol]) {
      if (CONST.MODE.ON === state[exchange][symbol].MODE) {
        let side = state[exchange][symbol].SIDE;
        rtm.sendMessage(CONST.MSG_REDOTEN, channel);
        executor.doten(symbol, side);
      }
    }
  } else {
    log.log(exchange + " " + symbol + " 正常運転中");
  }
}

// Slack RTMスタート
rtm.start();

// Slack message監視
rtm.on('message', async(event) => {
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
    rtm.sendMessage(processor.decorateWithBrackets(CONST.MSG_CHANGE_STATE.replace(CONST.MSG_REPLACE_STATE, 'ENV')) + ' ' + processor.decorateWithInlineQuote(env), event.channel);
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
  // コマンド(ON)を判定
  CONST.STR_MODE_ON_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      if (!state[obj.exchange][obj.symbol]) state[obj.exchange][obj.symbol] = {};
      jsonRW.updateJson_state(obj.exchange, obj.symbol, 'MODE', CONST.STR_MODE_ON_ARRAY[0], STATE); // ON
      let msg = obj.symbol + ' '+ processor.decorateWithInlineQuote(CONST.STR_MODE_ON_ARRAY[0]);
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
}