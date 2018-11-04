// const token = ENV.SLACK_TOKEN
var path = require('path');
var executorModule = require(path.join(__dirname, 'executor.js'));
const CONST = require(path.join(__dirname, 'const.js'));
const KEYS = require(path.join(__dirname, '../config/keys.json'));
const CONFIG = require(path.join(__dirname, '../config/config.json'));
const { RTMClient } = require('@slack/client');
const rtm = new RTMClient(KEYS.slack.token);
var logModule = require(path.join(__dirname, 'log.js'));
var log = new logModule();

// 環境変数セット
var env = CONST.ENV_TEST; // テスト
// var env = CONST.ENV_PROD; // 本番

var adminModeFlg = false;
var pauseFlg = false;
var executor = null;

// Slack RTMスタート
rtm.start();

// Slack message監視
rtm.on('message', async(event) => {
  var obj = {};
  obj.event = event;
  // adminコマンド判定
  if (judgeAdminCommand(event)) return;
  // 実行判定
  if (!judgeExecute(event)) return;
  // 受信メッセージ
  var text = event.text.toUpperCase();
  log.log('[受信]'+text);
  var message = '';
  // adminコマンドの場合
  if (adminModeFlg) {
    // 環境変更
    if (changeEnv(event, text)) return; 
    // 通貨判定
    if(!judgeSymbol(text, obj)) return;
    // 通貨文字列、半角・全角スペースを削除
    text = text.replace(obj.symbol, '').replace(/ /g, '').replace(/\//g, '');
    // コマンド判定
    if(!judgeCommand(text, obj)) return;
    executor = new executorModule(env);
    // adminコマンド実行
    message = await executor.adminCommand(obj.symbol, obj.command, text);
    // 結果メッセージ送信
    rtm.sendMessage(message, event.channel);
    rtm.sendMessage(CONST.MSG_ADMIN_OFF, event.channel);
    adminModeFlg = false;
    message = '';
    
  // Botアラート受信時
  } else {
    // 実行判定
    if (!judgeExecute(event)) return;
    let alertMessages = event.text.split('/');
    let symbol = alertMessages[0].toUpperCase();
    let sign = alertMessages[1].toUpperCase();
    let executor = new executorModule(env);
    // doten処理実行
    message = await executor.doten(symbol, sign);
    // 結果メッセージ送信
    rtm.sendMessage(message, event.channel);
    message = '';
  } 
});

function changeEnv(event, text) {
  let changeEnvFlg = false;
  if (text === CONST.ENV_TEST && env === CONST.ENV_PROD) {
    env = CONST.ENV_TEST;
    rtm.sendMessage('環境変更'+CONST.ENV_PROD+'⇛'+CONST.ENV_TEST, event.channel);
    changeEnvFlg = true;
  } else if (text === CONST.ENV_PROD && env === CONST.ENV_TEST) {
    env = CONST.ENV_PROD;
    rtm.sendMessage('環境変更'+CONST.ENV_TEST+'⇛'+CONST.ENV_PROD, event.channel);
    changeEnvFlg = true;
  }
  return changeEnvFlg;
}

function judgeAdminCommand(event) {
  try {
    let adminCommandFlg = false;
    // admin
    if (event.user === CONFIG.slack.admin_user) {
      let msg = CONST.MSG_DOTEN_THROUGH;
      log.log('event.text='+event.text);
      //「admin」文字列を含んでいる場合
      if (event.text.indexOf('admin') !== -1) {
        adminModeFlg = true;
        msg = CONST.MSG_ADMIN_ON;
        adminCommandFlg = true;
        rtm.sendMessage(msg, event.channel);
      // adminモードかつ「pause」文字列を含んでいる場合
      } else if (adminModeFlg && event.text.indexOf('pause') !== -1) {
        pauseFlg = pauseFlg ? false : true;
        msg = pauseFlg ? CONST.MSG_PAUSE_ON : CONST.MSG_PAUSE_OFF;
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
    // pauseモードOFF
    if (!pauseFlg) {
      // adminモードの場合
      if (adminModeFlg) {
        executeFlg =  true;
      // Botアラート受信の場合 
      } else if (event.bot_id !== undefined && event.bot_id === CONFIG.slack.bot_id) {
        log.log('eee');
        executeFlg =  true;
      }
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

function judgeCommand(text, obj) {
  let commandFlg = false;
  obj.command = {};
  // コマンド(レバレッジ)を判定
  CONST.STR_LEVERAGE_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.leverageStr = CONST.STR_LEVERAGE_ARRAY[idx];
      commandFlg = true;
    }
  });
  // コマンド(CLOSE)を判定
  CONST.STR_CLOSE_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.closeStr = CONST.STR_CLOSE_ARRAY[idx];
      commandFlg = true;
    }
  });
  // コマンド(INFO)を判定
  CONST.STR_INFO_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.infoStr = CONST.STR_INFO_ARRAY[idx];
      commandFlg = true;
    }
  });
  // コマンド(BUY)を判定
  CONST.STR_BUY_SIDE_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.buyStr = CONST.STR_BUY_SIDE_ARRAY[idx];
      commandFlg = true;
    }
  });
  // コマンド(SELL)を判定
  CONST.STR_SELL_SIDE_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      obj.command.sellStr = CONST.STR_SELL_SIDE_ARRAY[idx];
      commandFlg = true;
    }
  });
  return commandFlg;
}
