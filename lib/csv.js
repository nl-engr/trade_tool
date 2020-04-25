const csv = require('csv');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
require('date-utils');

const dt = new Date();
const formatted = dt.toFormat("YYYY-MM-DD");

var FILE = path.join(__dirname, '../data/'+formatted+'_ohlc.csv');

function readCsvSync(filename, options) {
  const fs = require('fs');
  const parse = require('csv-parse/lib/sync');
  const content = fs.readFileSync(filename).toString();
  return parse(content, options);
}

function isEntryConditionOK(side) {
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
  let ohlc1 = ohlcList.slice(0,4);
  let ohlc1mean = (Number(ohlc1[0]['o']) + Number(ohlc1[1]['o']) + Number(ohlc1[2]['o']) + Number(ohlc1[3]['o'])
    + Number(ohlc1[0]['h']) + Number(ohlc1[1]['h']) + Number(ohlc1[2]['h']) + Number(ohlc1[3]['h'])
    + Number(ohlc1[0]['l']) + Number(ohlc1[1]['l']) + Number(ohlc1[2]['l']) + Number(ohlc1[3]['l'])
    + Number(ohlc1[0]['c']) + Number(ohlc1[1]['c']) + Number(ohlc1[2]['c']) + Number(ohlc1[3]['c'])
  ) / 16;
  let ohlc2 = ohlcList.slice(4,8);
  let ohlc2mean = (Number(ohlc2[0]['o']) + Number(ohlc2[1]['o']) + Number(ohlc2[2]['o']) + Number(ohlc2[3]['o'])
    + Number(ohlc2[0]['h']) + Number(ohlc2[1]['h']) + Number(ohlc2[2]['h']) + Number(ohlc2[3]['h'])
    + Number(ohlc2[0]['l']) + Number(ohlc2[1]['l']) + Number(ohlc2[2]['l']) + Number(ohlc2[3]['l'])
    + Number(ohlc2[0]['c']) + Number(ohlc2[1]['c']) + Number(ohlc2[2]['c']) + Number(ohlc2[3]['c'])
  ) / 16;
  console.log('ohlc1mean='+ohlc1mean);
  console.log('ohlc2mean='+ohlc2mean);
  if ('LONG' === side) {
    return ((ohlc1mean > ohlc2mean) && (ohlc1mean - ohlc2mean > 300));
  } else if ('SHORT' === side) {
    return ((ohlc1mean < ohlc2mean) && (ohlc2mean - ohlc1mean > 300));
  }
}

function readLatestOhlc() {
  console.log('method readLatestOhlc');
  const options = { columns: ['time','o','h','l','c','v']};
  const ohlcList = readCsvSync(path.join(__dirname, '../data/'+formatted+'_ohlc.csv'), options).reverse();
  let ohlcTime = ohlcList[0]['time'];
  // 取得したOHLCデータが1分以上過去の場合、足データがなく判定不能なため、例外的にlast価格を返却する
  if (moment() > moment(ohlcTime,'YYYY/MM/DD hh:mm:ss').add(1,'minutes')) {
    console.log('method readLatestOhlc OHLCデータが1分以上過去');
    return [this.last,this.last,this.last,this.last];
  }
  let ohlc = ohlcList.slice(0,1)[0];
  console.log('ohlc='+ohlc);
  return [Number(ohlc['o']),Number(ohlc['h']),Number(ohlc['l']),Number(ohlc['c'])];
}
