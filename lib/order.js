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
  
  async getParentOrders(exchange, symbol) {
    let result = {};
    await exchange.private_get_getparentorders({"product_code":CONST.BF_FX_BTC_JPY, "parent_order_state":"ACTIVE"}).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async cancelOrder(exchange, id, symbol) {
    let result = {};
    await exchange.cancelOrder(id, symbol).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async cancelParentOrder(exchange, id, symbol) {
    let result = {};
    await exchange.private_post_cancelparentorder({"product_code":symbol,"parent_order_id":id}).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async fetchBalance(exchange) {
    let result = {};
    await exchange.fetch_balance().then(value => {
      result.value = value;
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

  async createMarketOrder(exchange, symbol, side, amount) {
    let result = {};
    await exchange.createOrder(symbol, 'market', side, amount).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async createStopOrder_bitmex(exchange, symbol, side, amount, params) {
    let result = {};
    await exchange.createOrder(symbol, 'stop', side, amount, undefined, params).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async createStopOrder_bitflyer(exchange, params) {
    let result = {};
    await exchange.private_post_sendparentorder(params).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async getCollateral(exchange) {
    let result = {};
    await exchange.private_get_getcollateral().then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
  async fetchTrades(exchange, symbol) {
    let result = {};
    await exchange.fetchTrades(symbol).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }
  
}

module.exports = Order;
