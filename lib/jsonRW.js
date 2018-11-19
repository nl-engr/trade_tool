const fs = require('fs');

function readJson(file) {
  console.log('method readJson');
  // stateファイル読み込み
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(jsonData, file) {
  console.log('method writeJson');
  // stateファイル書き込み
  fs.writeFileSync(file, JSON.stringify(jsonData, null, '    '));
}

function updateJson(symbol, key, value, file) {
  console.log('method updateJson');
  // stateファイル読み込み
  let jsonData = readJson(file);
  if (!jsonData[symbol]) jsonData[symbol] = {};
  jsonData[symbol][key] = value;
  // stateファイル書き込み
  writeJson(jsonData, file);
}

module.exports.readJson = readJson;
module.exports.writeJson = writeJson;
module.exports.updateJson = updateJson;