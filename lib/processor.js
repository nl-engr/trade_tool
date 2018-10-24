var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));

function getSymbolPair(symbolStr) {
  // 売買指示用通貨ペアセット
  return (CONST.SYMBOL_BASE_ARRAY.indexOf(symbolStr) !== -1) ? symbolStr+CONST.PAIR_SYMBOL_USD : symbolStr+CONST.PAIR_SYMBOL_Z18;
}

function getSymbolPairPosition(symbolStr) {
  // 売買指示用通貨ペアセット
  let symbol = (CONST.SYMBOL_BASE_ARRAY.indexOf(symbolStr) !== -1) ? symbolStr+CONST.PAIR_SYMBOL_USD : symbolStr+CONST.PAIR_SYMBOL_Z18;
  return symbol.replace(CONST.SYMBOL_BTC, CONST.SYMBOL_XBT).replace('/','');
}

module.exports.getSymbolPair = getSymbolPair;
module.exports.getSymbolPairPosition = getSymbolPairPosition;