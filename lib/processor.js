var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));

function getSymbolPair(symbolStr, exchange) {
  // 売買指示用通貨ペアセット
  let symbolPair = null;
  if (CONST.EXCHANGE.BITFLYER === exchange) {
    symbolPair = CONST.BF_FX_BTC_JPY;
  } else {
    symbolPair = (CONST.SYMBOL_BASE_ARRAY.indexOf(symbolStr) !== -1) ? symbolStr+CONST.PAIR_SYMBOL_USD : symbolStr+CONST.PAIR_SYMBOL_Z18;
  }
  return symbolPair;
}

function getSymbolPairPosition(symbolStr) {
  // 売買指示用通貨ペアセット
  let symbol = (CONST.SYMBOL_BASE_ARRAY.indexOf(symbolStr) !== -1) ? symbolStr+CONST.PAIR_SYMBOL_USD : symbolStr+CONST.PAIR_SYMBOL_Z18;
  return symbol.replace(CONST.SYMBOL_BTC, CONST.SYMBOL_XBT).replace('/','');
}

function decorateWithBrackets(str) {
  return '[' + str + ']';
}

function decorateWithBold(str) {
  return '*' + str + '*';
}
  
function decorateWithInlineQuote(str) {
  return '`' + str + '`';
}
  
function decorateWithBorderQuote(str) {
  return '```' + str + '```';
}

function decorateWithMultiLineIndent(str) {
  return '>>>' + str ;
}

function getDecimalDigit(number) {
  if (typeof number !== 'number') {
    return null;
  }
  var decimalDigit = 0;
  var numbers = number.toString().split('.');
  if (numbers[1]) {
    decimalDigit = numbers[1].length;
  }
  return decimalDigit;
}

module.exports.getSymbolPair = getSymbolPair;
module.exports.getSymbolPairPosition = getSymbolPairPosition;
module.exports.decorateWithBrackets = decorateWithBrackets;
module.exports.decorateWithBold = decorateWithBold;
module.exports.decorateWithInlineQuote = decorateWithInlineQuote;
module.exports.decorateWithBorderQuote = decorateWithBorderQuote;
module.exports.decorateWithMultiLineIndent = decorateWithMultiLineIndent;
module.exports.getDecimalDigit = getDecimalDigit;