import csv
import collections as cl
import datetime

class output :
    # 初期処理
    def __init__(self) :
        print("start")

    def main(self, ohlcData):
        print("main")
        today = datetime.date.today()
        fw = open('./data/'+str(today)+'_ohlc.csv','a+')
        fw.write(ohlcData)
        # with open("./data/ohlc.csv", "w+", newline="") as f:
        #     writer = csv.writer(f, delimiter=',')
        #     writer.writerows(ohlcData)
        # fw = open('./data/ohlc.csv','a+')
        # # json.dump関数でファイルに書き込む
        # json.dump(ohlcData,fw,indent=4)
