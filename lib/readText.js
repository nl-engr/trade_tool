const fs = require('fs');
const path = require('path');
const moment = require('moment')
var readline = require('readline');
var stream = require('stream');
const Base = require(path.join(__dirname, 'base.js'));

class ReadText extends Base {
  constructor() {
    super();
  }

  readLatest(filePath, seconds) {
    this.log('readText');
    let result = [];
    let instream = fs.createReadStream(path.join(__dirname, filePath));
    let outstream = new stream;
    return new Promise((resolve, reject)=> {
      let rl = readline.createInterface(instream, outstream);
      rl.on('line', function (line) {
        let lineData = line.split(',');
        // console.log('lineData[0]='+new Date(lineData[0].slice( 0, -2)));
        let dateTime = new Date(lineData[0].slice( 0, -2));
        let nowTime = new Date();
        // 今から20秒内のデータ
        if (moment(dateTime).isAfter(moment(nowTime).subtract(seconds, 's').format())) {
          result.push(line);
        }
      });

      rl.on('close', function () {
        resolve(result)
      });
    });
  }

  readLast(filePath) {
    this.log('readText');
    let lastData = null;
    let instream = fs.createReadStream(path.join(__dirname, filePath));
    let outstream = new stream;
    return new Promise((resolve, reject) => {
      let rl = readline.createInterface(instream, outstream);
      rl.on('line', function (line) {
        lastData = line.split(',');
      });
      instream.on('end', function() {
        resolve(lastData);
      });
    });
  }
}

module.exports = ReadText;
