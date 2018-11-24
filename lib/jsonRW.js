const fs = require('fs');

function readJson(file) {
  // stateファイル読み込み
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(jsonData, file) {
  // stateファイル書き込み
  fs.writeFileSync(file, JSON.stringify(jsonData, null, '    '));
}

function updateJson_state(exchange, symbol, key, value, file) {
  // stateファイル読み込み
  let jsonData = readJson(file);
  if (exchange) {
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

module.exports.readJson = readJson;
module.exports.writeJson = writeJson;
module.exports.updateJson_state = updateJson_state;