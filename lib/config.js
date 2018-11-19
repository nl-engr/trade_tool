var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
const CONFIG = require(path.join(__dirname, '../config/config.json'));

class Config {
  constructor(env) {
    this.init(env);
  }
  init(env) {
    this.env = env;
    this.bitmex = {
      ApiKey: this.env === CONST.ENV.TEST ? CONFIG.bitmex.ApiKeyTest : CONFIG.bitmex.ApiKey,
      ApiSecret: this.env === CONST.ENV.TEST ? CONFIG.bitmex.ApiSecretTest : CONFIG.bitmex.ApiSecret
    };
    this.bitflyer = {
      ApiKey: CONFIG.bitflyer.ApiKey,
      ApiSecret: CONFIG.bitflyer.ApiSecret
    };
  }
}

module.exports = Config;
