var path = require('path');
var CONST = require(path.join(__dirname, 'const.js'));
const KEYS = require(path.join(__dirname, '../config/keys.json'));

class Config {
  constructor(env) {
    this.init(env);
  }
  init(env) {
    this.env = env;
    this.bitmex = {
      ApiKey: this.env === CONST.ENV_TEST ? KEYS.bitmex.ApiKeyTest : KEYS.bitmex.ApiKey,
      ApiSecret: this.env === CONST.ENV_TEST ? KEYS.bitmex.ApiSecretTest : KEYS.bitmex.ApiSecret
    };
    this.bitflyer = {
      ApiKey: KEYS.bitflyer.ApiKey,
      ApiSecret: KEYS.bitflyer.ApiSecret
    };
  }
}

module.exports = Config;
