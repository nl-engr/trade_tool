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

// stateファイル読み込み
var state = jsonRW.readJson(STATE);
var env = state.ENV;
var adminModeFlg = state.ADMIN;

// Slack RTMスタート
rtm.start();

// Slack message監視
rtm.on('message', async(event) => {
  log.log('test-'+JSON.stringify(event));
  var obj = {};
  obj.event = event;
  // channel判定
  if(CONFIG.slack.channel !== event.channel) return;
  // adminコマンド判定
  if (judgeAdminCommand(event)) return;
  // 実行判定
  if (!judgeExecute(event)) return;
  // 受信メッセージ
  var text = event.text.toUpperCase();
  log.log('[受信]'+text);
  // adminコマンドの場合
  if (adminModeFlg) {
    // 環境変更
    if (judgeChangeEnv(event, text)) return;
    // 通貨判定
    if(!judgeSymbol(text, obj)) return;
    // 通貨文字列、半角・全角スペースを削除
    text = text.replace(obj.symbol, '').replace(/ /g, '').replace(/\//g, '');
    // コマンド判定
    if(!judgeCommand(text, obj, event)) return;
    // 取引所判定
    let exchange = judgeExchange(text, obj);
    log.log('exchange='+exchange);
    let executor = new executorModule(env, rtm, event, exchange);
    // adminコマンド実行
    await executor.adminCommand(obj.symbol, obj.command, text);

  // Botアラート受信時
  } else {
    // 実行判定
    if (!judgeExecute(event)) return;
    let alertMessages = event.text.split('/');
    let symbol = alertMessages[0].toUpperCase();
    let side = alertMessages[1].toUpperCase();
        // 取引所判定
    let exchange = judgeExchange(text, obj);
    let executor = new executorModule(env, rtm, event, exchange);
    // doten処理実行
    await executor.doten(symbol, side);
    // stateファイル最新化
    jsonRW.updateJson(symbol, 'SIDE', side, STATE);
  } 
});

function changeEnv(event, text) {
  // stateファイル読み込み
  let jsonData = jsonRW.readJson(STATE);
  env = text;
  jsonData.ENV = env;
  rtm.sendMessage(processor.decorateWithBrackets(CONST.MSG_ENV_CHANGE) + ' ' + processor.decorateWithInlineQuote(env), event.channel);
  // stateファイル書き込み
  jsonRW.writeJson(jsonData, STATE);
  return true;
}

function judgeChangeEnv(event, text) {
  let changeEnvFlg = false;
  if (CONST.ENV.TEST === text || CONST.ENV.PROD === text) {
    changeEnvFlg = true;
    changeEnv(event, text);
  }
  return changeEnvFlg;
}

function judgeAdminCommand(event) {
  try {
    let adminCommandFlg = false;
    // admin
    if (event.user === CONFIG.slack.admin_user) {
      //「admin」文字列を含んでいる場合
      if (event.text.indexOf('admin') !== -1) {
        adminModeFlg = adminModeFlg ? false : true;
        let msg = adminModeFlg ? processor.decorateWithInlineQuote(CONST.MSG_ADMIN_ON) : processor.decorateWithInlineQuote(CONST.MSG_ADMIN_OFF);
        adminCommandFlg = true;
        rtm.sendMessage(msg, event.channel);
      }
    }
    return adminCommandFlg; 
  } catch (e) {
    log.error(e);
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
    log.error(e);
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
  let exchange = CONST.EXCHANGE.BITMEX;
  // 通貨を判定
  CONST.EXCHANGE_BITFLYER.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      exchange = CONST.EXCHANGE.BITFLYER;
    }
  });
  return exchange;
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
      jsonRW.updateJson(obj.symbol, 'SIDE', 'LONG', STATE);
      commandFlg = true;
    }
  });
  // コマンド(SELL)を判定
  CONST.STR_SELL_SIDE_ARRAY.some((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.sellStr = CONST.STR_SELL_SIDE_ARRAY[idx];
      // stateファイル最新化
      jsonRW.updateJson(obj.symbol, 'SIDE', 'SHORT', STATE);
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
      if (!STATE[obj.symbol]) STATE[obj.symbol] = {};
      updateStateMode(obj.symbol, CONST.STR_MODE_ON_ARRAY[0]); // ON
      let msg = obj.symbol + ' '+ processor.decorateWithInlineQuote(CONST.STR_MODE_ON_ARRAY[0]);
      rtm.sendMessage(msg, event.channel);
    }
  });
  // コマンド(OFF)を判定
  CONST.STR_MODE_OFF_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      if (!STATE[obj.symbol]) STATE[obj.symbol] = {};
      updateStateMode(obj.symbol, CONST.STR_MODE_OFF_ARRAY[0]); // OFF
      let msg = obj.symbol + ' '+ processor.decorateWithInlineQuote(CONST.STR_MODE_OFF_ARRAY[0]);
      rtm.sendMessage(msg, event.channel);
    }
  });
}

function updateStateMode(symbol, mode_type) {
  // stateファイル読み込み
  let state = jsonRW.readJson(STATE);
  if (!state[symbol]) state[symbol] = {};
  state[symbol].MODE = mode_type;
  // stateファイル書き込み
  jsonRW.writeJson(state, STATE);
}