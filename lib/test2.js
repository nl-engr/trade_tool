var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
var processor = require(path.join(__dirname, 'processor.js'));
var orderModule = require(path.join(__dirname, 'order.js'));
var logModule = require(path.join(__dirname, 'log.js'));
var executorModule = require(path.join(__dirname, 'executor.js'));

var env = CONST.ENV_TEST;
var symbol = CONST.SYMBOL_BTC;
var sign = CONST.SIGN_LONG;

async function test() {
  var Executor = new executorModule(env);
  await Executor.main(symbol, sign);    
}

test();
