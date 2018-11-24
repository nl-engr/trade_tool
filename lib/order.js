var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
class Order {
  constructor() {
  }
  
  async setLeverage(exchange, symbol, leverage) {
    let result = {};
    await exchange.private_post_position_leverage({"symbol":symbol, "leverage": leverage}).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async getPositions(exchange) {
    let result = {};
    if (CONST.EXCHANGE.BITFLYER === exchange.id) {
      await exchange.private_get_getpositions({"product_code":CONST.BF_FX_BTC_JPY}).then(value => {
        result.value = value;
      }).catch(v => {
        result.e = v;
      });
    } else {
      await exchange.private_get_position().then(value => {
        result.value = value;
      }).catch(v => {
        result.e = v;
      });
    }
    return result;
  }
  
  async fetchTicker(exchange, symbol, fetchType) {
    let result = {};
    await exchange.fetch_ticker(symbol).then(value => {
      result.value = value[fetchType];
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async fetchOpenOrders(exchange, symbol) {
    let result = {};
    await exchange.fetchOpenOrders(symbol).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async cancelOrder(exchange, id) {
    let result = {};
    await exchange.cancelOrder(id).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async fetchBalance(exchange) {
    let result = {};
    await exchange.fetch_balance().then(value => {
      result.value = value[CONST.SYMBOL_BTC].total;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async limitBuy(exchange, symbol, amount, price) {
    let result = {};
    await exchange.createOrder(symbol, 'limit', 'buy', Number.parseInt(amount, 10), price).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async limitSell(exchange, symbol, amount, price) {
    let result = {};
    await exchange.createOrder(symbol, 'limit', 'sell', Number.parseInt(amount, 10), price).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async marketBuy(exchange, symbol, amount) {
    let result = {};
    await exchange.createOrder(symbol, 'market', 'buy', Number.parseInt(amount, 10)).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async marketSell(exchange, symbol, amount) {
    let result = {};
    await exchange.createOrder(symbol, 'market', 'sell', Number.parseInt(amount, 10)).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async stoplossBuy(exchange, symbol, amount, params) {
    let result = {};
    await exchange.createOrder(symbol, 'stop', 'buy', Number.parseInt(amount, 10), undefined, params).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async stoplossSell(exchange, symbol, amount, params) {
    let result = {};
    await exchange.createOrder(symbol, 'stop', 'sell', Number.parseInt(amount, 10), undefined, params).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
}

module.exports = Order;
