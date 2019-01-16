// const token = ENV.SLACK_TOKEN
const path = require('path');
const executorModule = require(path.join(__dirname, 'executor.js'));
const CONST = require(path.join(__dirname, 'const.js'));
const CONFIG = require(path.join(__dirname, '../config/config.json'));
const STATE = path.join(__dirname, '../config/state.json');
const { RTMClient } = require('@slack/client');
const rtm = new RTMClient(CONFIG.slack.token);
const jsonRW = require(path.join(__dirname, 'jsonRW.js'));
const logModule = require(path.join(__dirname, 'log.js'));
const log = new logModule();

var channel = null;

// var total_collateral_hist = [];
// var recent_total_collateral_list = [];
// var base_total_collateral_list = [];
var open_position_pnl_hist = [];
var recent_open_position_pnl_list = [];
var base_open_position_pnl_list = [];

let state = jsonRW.readJson(STATE);

const {CronJob} = require('cron');

new CronJob('*/8 * * * * *', async() => {
  log.log('*** collateral_ope RUNNING ***');
  let evaluate_span = 3;
  let executor = new executorModule(CONST.ENV.PROD, rtm, channel, CONST.EXCHANGE.BITFLYER, CONST.SYMBOL_BTC);
  await executor.calculateQty();
  
  let side = executor.pos.side;
  // ノーポジの場合
  if (!side) {
    reDoten(executor);
  }
  let new_open_position_pnl = Math.floor(executor.open_position_pnl);
  log.log('new_open_position_pnl:'+new_open_position_pnl);
  let new_total_collateral_yen = Math.floor(executor.total_collateral);
  log.log('new_total_collateral_yen:'+new_total_collateral_yen);
  // total_collateral_hist.push(new_total_collateral_yen);
  open_position_pnl_hist.push(new_open_position_pnl);

  // let length = total_collateral_hist.length;
  let length = open_position_pnl_hist.length;
  let recent_idx_start = length > evaluate_span ? length-evaluate_span : 0;
  let base_idx_start = length > evaluate_span*3 ? length-evaluate_span*3 : 0;
  let idx_end = length;

  // 直近の建玉損益リストに追加
  update_open_position_pnl_list(base_idx_start, recent_idx_start, idx_end);

  // log.log('open_position_pnl_hist:'+open_position_pnl_hist);
  log.log('base_open_position_pnl_list:'+base_open_position_pnl_list);
  log.log('recent_open_position_pnl_list:'+recent_open_position_pnl_list);
  
  // 過去統計が判定基準数以下の場合
  if (length < evaluate_span ) {
    return;
  }
  
  log.log('min:now'+Math.min.apply(null, recent_open_position_pnl_list) + ':' +new_open_position_pnl);
  
  // 最新の建玉損益が過去5つの中で最小でない場合
  if (new_open_position_pnl > Math.min.apply(null, recent_open_position_pnl_list)) {
    log.log('最新の建玉損益が過去5つの中で最小でない場合');
    return;
  }
  log.log('max='+Math.max.apply(null, base_open_position_pnl_list));
  log.log('max-min:基準'+(Math.max.apply(null, base_open_position_pnl_list) - new_open_position_pnl) + ':' +Number.parseInt(new_total_collateral_yen*0.005,10));
  // 最新の建玉損益が過去5つの中で最大値より0.005倍円以上、下でない場合
  if (Math.max.apply(null, base_open_position_pnl_list) - new_open_position_pnl < Number.parseInt(new_total_collateral_yen*0.005,10)) {
    log.log('最新の建玉損益が過去5つの中で最大値より0.005倍円以上、下でない場合');
    return;
  }
  // 判定期間の中で最小かつ、最大値より100円以上マイナスの場合
  log.log('*****HAITTA:now=' + new_open_position_pnl);
  
  let new_side = side === CONST.SIDE.BUY ? CONST.SIDE.SELL : CONST.SIDE.BUY;
  executor.stopLossFlg = false;
  // クリア
  reset_open_position_pnl_list();
  // 逆ドテン処理実行
  executor.doten(CONST.SYMBOL_BTC, new_side);

  
}, null, true);

function update_open_position_pnl_list(base_idx_start, recent_idx_start, idx_end) {
  recent_open_position_pnl_list = open_position_pnl_hist.slice(recent_idx_start, idx_end);
  base_open_position_pnl_list = open_position_pnl_hist.slice(base_idx_start, idx_end);
}

function reset_open_position_pnl_list(base_idx_start, base_idx_end, recent_idx_start, recent_idx_end) {
  open_position_pnl_hist = [];
  recent_open_position_pnl_list = [];
  base_open_position_pnl_list = [];
}

async function reDoten(executor) {
  // かつMODEがONの場合、直近のSIDEを再オーダー
  if (state[CONST.EXCHANGE.BITFLYER][CONST.SYMBOL_BTC]) {
    if (CONST.MODE.ON === state[CONST.EXCHANGE.BITFLYER][CONST.SYMBOL_BTC].MODE) {
      let side = state[CONST.EXCHANGE.BITFLYER][CONST.SYMBOL_BTC].SIDE;
      executor.doten(CONST.SYMBOL_BTC, side);
    }
  }
}