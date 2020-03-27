const path = require('path');
const rp = require('request-promise');
const Base = require(path.join(__dirname, 'base.js'));
const CONST = require(path.join(__dirname, 'const.js'));
const jsonRW = require(path.join(__dirname, 'jsonRW.js'));
const processor = require(path.join(__dirname, 'processor.js'));

const PRICE = path.join(__dirname, '../data/price.json');

async function request(url) {
  let result = null;
  try {
    result = await rp(url);
  } catch (err) {
    result = err;
  }
  return result;
}

class Cryptowatch extends Base {
  constructor() {
    super();
    this.log('Cryptowatch New');
  }

  async getPrice(symbol, exchange) {
    this.log('Cryptowatch.getPrice');
    this.log('symbol='+symbol);
    this.log('exchange='+exchange);
    let symbolPair = processor.getSymbolPairCryptowatch(symbol, exchange);
    let url = CONST.URL_CRYPTOWATCH.replace(CONST.REPLACE_EXCHANGE, exchange).replace(CONST.REPLACE_SYMBOL, symbolPair)+'/price';
    this.log('url='+url);
    let result = await request(url);
    let resultJson = JSON.parse(result);
    let price = resultJson.result.price;
    this.log(price);
    return price;
  }

  async getOHLC(symbol, exchange) {
    this.log('Cryptowatch.getOHLC');
    // priceファイル読み込み
    let price = jsonRW.readJson(PRICE);
    let lastTime = '';
    if (price[exchange] && price[exchange][symbol] && price[exchange][symbol].lastTime) {
      lastTime = price[exchange][symbol].lastTime;
    }
    let symbolPair = processor.getSymbolPairCryptowatch(symbol, exchange);
    let url = CONST.URL_CRYPTOWATCH.replace(CONST.REPLACE_EXCHANGE, exchange).replace(CONST.REPLACE_SYMBOL, symbolPair)+'/ohlc?periods=60&after='+lastTime;
    let result = await request(url);
    let resultJson = JSON.parse(result);
    // this.log('resultJson.result='+resultJson.result);
    let ohlcList = Object.values(resultJson.result)[0];
    let latestOHLC = ohlcList[ohlcList.length-1];
    // this.log('lastTime='+lastTime);
    this.log(exchange+':'+latestOHLC);
    return latestOHLC;
  }

}

module.exports = Cryptowatch;
