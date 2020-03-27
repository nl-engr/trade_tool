const path = require('path');
const Base = require(path.join(__dirname, 'base.js'));
const CONST = require(path.join(__dirname, 'const.js'));
class Order extends Base {
  constructor() {
    super();
    this.log('Order New');
  }

  async setLeverage(exchange, symbol, leverage) {
    this.log('order.setLeverage');
    let result = {};
    await exchange.private_post_position_leverage({"symbol":symbol, "leverage": leverage}).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async getPositions(exchange) {
    this.log('order.getPositions');
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

  async getInstrument(exchange, symbol, fetchType) {
    this.log('order.getInstrument');
    let result = {};
    await exchange.publicGetInstrument({symbol: symbol, reverse: true}).then(value => {
      result.value = value[fetchType];
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async fetchTicker(exchange, symbol, fetchType) {
    this.log('order.fetchTicker');
    let result = {};
    await exchange.fetch_ticker(symbol).then(value => {
      result.value = value[fetchType];
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async fetchOrder(id, exchange, symbol, fetchType) {
    this.log('order.fetchOrder');
    let result = {};
    await exchange.fetch_order(id, symbol).then(value => {
      result.value = value[fetchType];
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async fetchOpenOrders(exchange, symbol) {
    this.log('order.fetchOpenOrders');
    let result = {};
    await exchange.fetchOpenOrders(symbol).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async fetchClosedOrders(exchange, symbol) {
    this.log('order.fetchClosedOrders');
    let result = {};
    await exchange.fetchClosedOrders(symbol,undefined,undefined,{'reverse': true}).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async getParentOrders(exchange, symbol) {
    this.log('order.getParentOrders');
    let result = {};
    await exchange.private_get_getparentorders({"product_code":CONST.BF_FX_BTC_JPY, "parent_order_state":"ACTIVE"}).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async cancelOrder(exchange, id, symbol) {
    this.log('order.cancelOrder');
    let result = {};
    await exchange.cancelOrder(id, symbol).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async cancelParentOrder(exchange, id, symbol) {
    this.log('order.cancelParentOrder');
    let result = {};
    await exchange.private_post_cancelparentorder({"product_code":symbol,"parent_order_id":id}).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async fetchBalance(exchange) {
    this.log('order.fetchBalance');
    let result = {};
    await exchange.fetch_balance().then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async createLimitOrder(exchange, symbol, side, amount, price) {
    this.log('order.createLimitOrder');
    let result = {};
    await exchange.createOrder(symbol, 'limit', side, amount, price).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async createMarketOrder(exchange, symbol, side, amount) {
    this.log('order.createMarketOrder');
    let result = {};
    await exchange.createOrder(symbol, 'market', side, amount).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async createStopOrder_bitmex(exchange, symbol, side, amount, params) {
    this.log('order.createStopOrder_bitmex');
    let result = {};
    await exchange.createOrder(symbol, 'stop', side, amount, undefined, params).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async createStopOrder_bitflyer(exchange, params) {
    this.log('order.createStopOrder_bitflyer');
    let result = {};
    await exchange.private_post_sendparentorder(params).then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async getCollateral(exchange) {
    this.log('order.getCollateral');
    let result = {};
    await exchange.private_get_getcollateral().then(value => {
      result.value = value;
    }).catch(v => {
      result.e = v;
    });
    return result;
  }

  async fetchTrades(exchange, symbol) {
    this.log('order.fetchTrades');
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
