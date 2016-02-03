var connect = require('connect'),
    compression = require('compression'),
    http = require('http'),
    static = require('serve-static'),
    app = connect(),
    port = 5005;

app.use(compression());
app.use(static(__dirname + '/'));

http.createServer(app).listen(port);
console.log('Static server started for directory:\n    ' + __dirname + '\n    at http://localhost:' + port);