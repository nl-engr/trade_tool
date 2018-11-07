exports.ENV_TEST = 'TEST';
exports.ENV_PROD = 'PROD';

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
exports.PAIR_SYMBOL_USD = '/USD';
exports.PAIR_SYMBOL_Z18 = 'Z18';
exports.PAIR_SYMBOL_USD_DAFAULT = 'USD';

exports.STR_COIN = '(枚)';

exports.STR_LEVERAGE_ARRAY = ['lv','lev','leverage','LV','LEV','LEVERAGE','レバ','レバレッジ'];
exports.STR_BUY_SIDE_ARRAY = ['買','買い','買う','購入','BUY','LONG'];
exports.STR_SELL_SIDE_ARRAY = ['売','売り','売る','売却','SELL','SHORT'];
exports.STR_CLOSE_ARRAY = ['CLOSE','EXIT','閉じる','閉'];
exports.STR_INFO_ARRAY = ['INFO','POSITION','ポジ','POS','BALANCE','バランス'];

exports.SIGN_LONG = 'LONG';
exports.SIGN_SHORT = 'SHORT';

exports.SIDE_BUY = 'buy';
exports.SIDE_SELL = 'sell';

exports.MSG_STATUS_SUCCESS = '成功';
exports.MSG_STATUS_FAILED = '失敗';

exports.MSG_CHANGE_LEVERAGE = 'レバレッジ変更';

exports.MSG_DOTEN_LONG = 'ドテンロング発動';
exports.MSG_DOTEN_SHORT = 'ドテンショート発動';
exports.MSG_DOTEN_THROUGH = 'スルー';

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

exports.MSG_ENV = '環境';
exports.MSG_SYMBOL = '通貨';
exports.MSG_LAST_PRICE = '最終価格';
exports.MSG_POSITION = 'ポジション';
exports.MSG_TOTAL_BTC = 'total_btc';

exports.MSG_POS_SIDE = 'SIDE';
exports.MSG_POS_QTY = 'QTY';
exports.MSG_POS_ENTRY_PRICE = '参入価格';
exports.MSG_POS_LIQUIDATION_PRICE = '精算価格';
exports.MSG_POS_STOPLOSS_PRICE = '損切価格';
exports.MSG_LV = 'Lv';

exports.MSG_ADMIN_ON = 'adminモード-ON';
exports.MSG_ADMIN_OFF = 'adminモード-OFF';
exports.MSG_PAUSE_ON = 'pauseモード-ON';
exports.MSG_PAUSE_OFF = 'pauseモード-OFF';

exports.CRLF = '\r\n';

exports.MAX_RETRY_CNT = 30;
exports.WHOLE_LOT_RATE = 0.8;

exports.LEVERAGE_2  = 2;
exports.LEVERAGE_3  = 3;
exports.LEVERAGE_5  = 5;
exports.LEVERAGE_10 = 10;
