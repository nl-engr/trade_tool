
// 基本設定値
exports.MAX_RETRY_CNT = 3;
exports.WHOLE_LOT_RATE = 0.95;
exports.BASIC_STOP_LOSS_PERCENTAGE = 5;

exports.SYMBOL_BTC = 'BTC';
exports.SYMBOL_ETH = 'ETH';
exports.SYMBOL_ADA = 'ADA';
exports.SYMBOL_BCH = 'BCH';
exports.SYMBOL_EOS = 'EOS';
exports.SYMBOL_LTC = 'LTC';
exports.SYMBOL_TRX = 'TRX';
exports.SYMBOL_XRP = 'XRP';

exports.SYMBOL_XBT = 'XBT';

exports.SYMBOL_ALL_ARRAY = [
    exports.SYMBOL_BTC,
    exports.SYMBOL_ETH,
    exports.SYMBOL_ADA,
    exports.SYMBOL_BCH,
    exports.SYMBOL_EOS,
    exports.SYMBOL_LTC,
    exports.SYMBOL_TRX,
    exports.SYMBOL_XRP
];
exports.SYMBOL_BASE_ARRAY = [
    exports.SYMBOL_BTC,
    exports.SYMBOL_ETH
];
exports.SYMBOL_ALT_ARRAY = [
    exports.SYMBOL_ADA,
    exports.SYMBOL_BCH,
    exports.SYMBOL_EOS,
    exports.SYMBOL_LTC,
    exports.SYMBOL_TRX,
    exports.SYMBOL_XRP
];
exports.SYMBOL_TRADE_ARRAY = [
    exports.SYMBOL_BTC,
    exports.SYMBOL_XRP
];
exports.PAIR_SYMBOL_USD = '/USD';
exports.PAIR_SYMBOL_Z18 = 'Z18';
exports.PAIR_SYMBOL_USD_DAFAULT = 'USD';

exports.BF_FX_BTC_JPY = 'FX_BTC_JPY';

exports.STR_ADMIN = ['ADMIN'];
exports.EXCHANGE_BITFLYER = ['BF'];

exports.STR_LEVERAGE_ARRAY = ['LV','LEV','LEVERAGE'];
exports.STR_BUY_SIDE_ARRAY = ['BUY','LONG'];
exports.STR_SELL_SIDE_ARRAY = ['SELL','SHORT'];
exports.STR_CLOSE_ARRAY = ['CLOSE','EXIT'];
exports.STR_INFO_ARRAY = ['INFO','POSITION','POS','BALANCE'];
exports.STR_MODE_ON_ARRAY = ['ON','ACTIVATE','START'];
exports.STR_MODE_OFF_ARRAY = ['OFF','DEACTIVATE','PAUSE','STOP'];
// exports.STR_MODE = 'MODE';
exports.STR_REDOTEN_ARRAY = ['REDOTEN','RD'];

exports.MSG_STATUS_SUCCESS = '成功';
exports.MSG_STATUS_FAILED = '失敗';

exports.MSG_CHANGE_LEVERAGE = 'レバレッジ変更';

exports.REPLACE_STR = '%%%STR%%%';
exports.MSG_DOTEN = 'ドテン'+ exports.REPLACE_STR+'発動';
exports.MSG_REDOTEN = 'Reドテンプログラム発動';

exports.MSG_GET_POS_INFO = 'ポジション情報取得';
exports.MSG_GET_LAST_PRICE = '最終価格取得';
exports.MSG_GET_BALANCE = 'バランス取得';
exports.MSG_GET_OPEN_ODERS = 'オープンOrder取得';
exports.MSG_CANCEL_ORDER = 'Orderキャンセル';

exports.MSG_ADD = '追加';
exports.MSG_CLEARANCE = '決済';
exports.MSG_ENTRY = 'ENTRY';

exports.MSG_MARKET_BUY = '成行買い';
exports.MSG_MARKET_SELL = '成行売り';
exports.MSG_LIMIT_BUY = '指値買い';
exports.MSG_LIMIT_SELL = '指値売り';
exports.MSG_STOPLOSS_BUY = '損切りSTOP買い';
exports.MSG_STOPLOSS_SELL = '損切りSTOP売り';
exports.MSG_CANCEL_OPEN_ODERS = 'オープンOrderキャンセル';

exports.MSG_REPLACE_STATE = '%%%STATE%%%';
exports.MSG_CHANGE_STATE = exports.MSG_REPLACE_STATE + '変更';
exports.MSG_EXCHANGE = '取引所';
exports.MSG_ENV = 'ENV';
exports.MSG_MODE = 'MODE';
exports.MSG_SYMBOL = '$';
exports.MSG_POSITION = 'POS';
exports.MSG_TOTAL_COLLATERAL = '証拠金';

exports.MSG_POS_SIDE = 'SIDE';
exports.MSG_POS_QTY = 'QTY';
exports.MSG_LAST_PRICE = '最終';
exports.MSG_POS_ENTRY_PRICE = '参入';
exports.MSG_POS_LIQUIDATION_PRICE = '精算';
exports.MSG_POS_STOPLOSS_PRICE = '損切';
exports.MSG_LV = 'Lv';

exports.MSG_ADMIN_ON = 'adminモード-ON';
exports.MSG_ADMIN_OFF = 'adminモード-OFF';

exports.CRLF = '\r\n';

exports.LEVERAGE_2  = 2;
exports.LEVERAGE_3  = 3;
exports.LEVERAGE_5  = 5;
exports.LEVERAGE_10 = 10;

exports.ENV = {
  "PROD" : "PROD",
  "TEST" : "TEST"
};

exports.EXCHANGE = {
  "BITMEX" : "bitmex",
  "BITFLYER" : "bitflyer"
};

exports.ALERT = {
  "LONG" : "LONG",
  "SHORT" : "SHORT"
};

exports.SIDE = {
  "BUY" : "buy",
  "SELL" : "sell"
};

exports.MODE = {
  "ON" : "ON",
  "OFF" : "OFF"
};

exports.REDOTEN = {
  "ON" : "ON",
  "OFF" : "OFF"
};