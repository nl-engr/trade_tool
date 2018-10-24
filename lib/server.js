const fs = require("fs");
const http = require("http");
const hostname = '0.0.0.0';
const port = 8080;

var server = http.createServer();
server.on('request', doRequest);
 
// リクエストの処理
function doRequest(req, res) {
    // ファイルを読み込んだら、コールバック関数を実行する。
    fs.readFile('../../plgraph.html', 'utf-8' , doReard );
    // コンテンツを表示する。
    function doReard(err, data) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        res.end();
    }
}

// Cloud9の設定はポート8080、ローカルIPは0.0.0.0です
// server.listen(8080,'0.0.0.0');　
// console.log("server listening ...");

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});