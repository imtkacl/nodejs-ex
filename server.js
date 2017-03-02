//  OpenShift sample Node application
var express = require('express'),
    fs      = require('fs'),
    app     = express(),
    eps     = require('ejs'),
    morgan  = require('morgan'),
    request = require('request');
    
var bodyParser = require('body-parser');
// Create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })
app.use(urlencodedParser);

Object.assign=require('object-assign')

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';

app.get('/', function (req, res) {

  res.render('index.html', { pageCountMessage : null});
  
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  console.log(req.headers)

  //res.send('{ pageCount: 0 }');
  res.send(req.headers);

});

app.post('/oauth2/token', function (req, res) {
    
  
  // try to initialize the db on every request if it's not already
  // initialized.
  
  var out={"header": req.headers, "param": req.query, "body": req.body};
  res.send(out);
});

app.get('/test/', function (req, res) {
  var options = {
    url: 'http://bs.apigw-d0.svc.cluster.local:8080/pagecount',
    method: 'GET'
  };
  request(options, function(res) {
    console.log('STATUS: ' + res.statusCode);
    console.log('HEADERS: ' + JSON.stringify(res.headers));
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      console.log('BODY: ' + chunk);
    });
  });
});

// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
