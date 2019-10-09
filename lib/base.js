const path = require('path');
const bucketsJs = require('buckets-js');
const moment = require('moment');
const Log = require(path.join(__dirname, 'log.js'));

class Base extends Log {
  constructor() {
    super();
  }
  dequeueById(id) {
    this.log('dequeueById:'+id);
    q.forEach((item, idx) => {
      if (id === item.id) {
        q.splice(idx, 1);
      }
    });
  }
  addOrderId(id, orderId) {
    this.log('addOrderId:'+id+' '+orderId);
    q.forEach((item, idx) => {
      if (id === item.id) {
        q[idx].orderId = orderId;
      }
    });
  }
}

module.exports = Base;