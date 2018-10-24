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
// var env = CONST.ENV_TEST; // テスト
var env = CONST.ENV_PROD; // 本番

var adminModeFlg = false;
var pauseFlg = false;
var executor = null;

// Slack RTMスタート
rtm.start();

// Slack message監視
rtm.on('message', async(event) => {
  // 実行判定
  if (!judgeExecute(event)) return;
  // 受信メッセージ
  var text = event.text.toUpperCase();
  log.log('[受信]'+text);
  var message = '';
  // pause状態の場合
  if(pauseFlg) return;
  // adminコマンドの場合
  if (adminModeFlg) {
    if (text === CONST.ENV_TEST && env === CONST.ENV_PROD) {
      env = CONST.ENV_TEST;
      rtm.sendMessage('環境変更'+CONST.ENV_PROD+'⇛'+CONST.ENV_TEST, event.channel);
    } else if (text === CONST.ENV_PROD && env === CONST.ENV_TEST) {
      env = CONST.ENV_PROD;
      rtm.sendMessage('環境変更'+CONST.ENV_TEST+'⇛'+CONST.ENV_PROD, event.channel);
    } else {
      // 通貨判定
      var symbol = judgeSymbol(text);
      // 通貨指定がない場合はスルー
      if (!symbol) return;
      // 通貨文字列、半角・全角スペースを削除
      text = text.replace(symbol, '').replace(/ /g, '').replace(/\//g, '');
      // コマンド判定
      let command = judgeCommand(text);
      // 指示コマンドがない場合はスルー
      if (!command) return;
      executor = new executorModule(env);
      // adminコマンド実行
      message = await executor.adminCommand(symbol, command, text);
      // 結果メッセージ送信
      rtm.sendMessage(message, event.channel);
    }
    rtm.sendMessage(CONST.MSG_ADMIN_OFF, event.channel);
    adminModeFlg = false;
    message = '';
    
  // Botアラート受信時
  } else {
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

function judgeExecute(event) {
  try {
    let executeFlg = false;
    // pauseモードOFFかつadminモード「ON」の場合
    if (!pauseFlg && adminModeFlg) {
      executeFlg =  true;
    // Botアラート受信の場合 
    } else if (!pauseFlg && event.bot_id !== undefined && event.bot_id === CONFIG.slack.bot_id) {
      executeFlg =  true;
    }
    
    // naokishiohara(admin)でかつ「admin」文字列を含んでいる場合
    if (event.user === CONFIG.slack.admin_user && event.text.indexOf('admin') !== -1) {
      adminModeFlg = true;
      rtm.sendMessage(CONST.MSG_ADMIN_ON, event.channel);
    }
    // naokishiohara(admin)でかつ「pause」文字列を含んでいる場合
    if (event.user === CONFIG.slack.admin_user && event.text.indexOf('pause') !== -1) {
      console.log('pause HAITTA');
      pauseFlg = pauseFlg ? false : true;
      let msg = pauseFlg ? CONST.MSG_PAUSE_ON : CONST.MSG_PAUSE_OFF;
      rtm.sendMessage(msg, event.channel);
    }
    return executeFlg; 
  } catch (e) {
    log.error(e);
    rtm.sendMessage(e, event.channel);
  }
}

function judgeSymbol(text) {
  let symbol = null;
  // 通貨を判定
  CONST.SYMBOL_ALL_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      symbol = CONST.SYMBOL_ALL_ARRAY[idx];
    }
  });
  return symbol;
}

function judgeCommand(text) {
  let command = {};
  // コマンド(レバレッジ)を判定
  CONST.STR_LEVERAGE_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      command.leverageStr = CONST.STR_LEVERAGE_ARRAY[idx];
      return command;
    }
  });
  // コマンド(CLOSE)を判定
  CONST.STR_CLOSE_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      command.closeStr = CONST.STR_CLOSE_ARRAY[idx];
      return command;
    }
  });
  // コマンド(INFO)を判定
  CONST.STR_INFO_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      command.infoStr = CONST.STR_INFO_ARRAY[idx];
      return command;
    }
  });
  // コマンド(BUY)を判定
  CONST.STR_BUY_SIDE_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      command.buyStr = CONST.STR_BUY_SIDE_ARRAY[idx];
      return command;
    }
  });
  // コマンド(SELL)を判定
  CONST.STR_SELL_SIDE_ARRAY.forEach((str, idx) => {
    let matchedIndex = text.indexOf(str);
    if (matchedIndex !== -1) {
      command.sellStr = CONST.STR_SELL_SIDE_ARRAY[idx];
      return command;
    }
  });
  return command;
}
