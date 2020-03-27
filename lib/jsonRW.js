const fs = require('fs');
const path = require('path');
const logModule = require(path.join(__dirname, 'log.js'));
const log = new logModule();

function readJson(file) {
  log.log('method readJson');
  // jsonファイル読み込み
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(jsonData, file) {
  log.log('method writeJson');
  // log.log('jsonData='+JSON.stringify(jsonData));
  // stateファイル書き込み
  fs.writeFileSync(file, JSON.stringify(jsonData, null, '    '));
}

function updateJson_state(exchange, symbol, key, value, file) {
  log.log('method updateJson_state');
  // stateファイル読み込み
  let jsonData = readJson(file);
  if (exchange) {
    if (!jsonData[exchange]) jsonData[exchange] = {};
    if (symbol) {
      if (!jsonData[exchange][symbol]) jsonData[exchange][symbol] = {};
      jsonData[exchange][symbol][key] = value;
    } else {
      jsonData[exchange][key] = value;
    }
  } else {
    jsonData[key] = value;
  }

  // stateファイル書き込み
  writeJson(jsonData, file);
}

function updateJsonOhlc(exchange, symbol, ohlc, file) {
  log.log('method updateJson_ohlc');
  // stateファイル読み込み
  let jsonData = readJson(file);
  if (exchange) {
    if (!jsonData[exchange]) jsonData[exchange] = {};
    if (symbol) {
      if (!jsonData[exchange][symbol]) jsonData[exchange][symbol] = {};
      jsonData[exchange][symbol].lastTime = ohlc[0];
      jsonData[exchange][symbol].open = ohlc[1];
      jsonData[exchange][symbol].high = ohlc[2];
      jsonData[exchange][symbol].low = ohlc[3];
      jsonData[exchange][symbol].close = ohlc[4];
      jsonData[exchange][symbol].qty = ohlc[5];
    }
  }
  // stateファイル書き込み
  writeJson(jsonData, file);
}

module.exports.readJson = readJson;
module.exports.writeJson = writeJson;
module.exports.updateJson_state = updateJson_state;
module.exports.updateJsonOhlc = updateJsonOhlc
