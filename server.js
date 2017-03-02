//  OpenShift sample Node application
var express = require('express'),
    fs      = require('fs'),
    app     = express(),
    eps     = require('ejs'),
    morgan  = require('morgan'),
    request = require('request'),
    ldap = require('ldapjs');
    
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

app.get('/testBackEnd/', function (req, res) {
  var options = {
    url: 'http://kong-proxy.apigw-d0.svc.cluster.local:8000/pagecount',
    method: 'GET'
  };
  request(options, function (error, response, body) {
    console.log('error: '+error.stack);
    console.log('response: '+response);
    console.log('body: '+body);
//  console.log('STATUS: ' + res.statusCode);
//  console.log('HEADERS: ' + JSON.stringify(res.headers));
//  res.setEncoding('utf8');
//  res.on('data', function (chunk) {
//    console.log('BODY: ' + chunk);
//    });
    if (error){
      res.status(500).send(error);  
    }else if (response.statusCode == 200) {
      res.status(response.statusCode).send(body);
    }else{
      res.status(response.statusCode).send(body);
    }
    
  });
});

app.get('/test', function (req, res) {
    var client = ldap.createClient({
      url: 'ldap://ADDS.ETE.CATHAYPACIFIC.COM/cn=OAuthTestUser1,OU=IMT,OU=CLK,OU=HQ,OU=Users,OU=CPA,DC=nwow001,DC=corp,DC=ete,DC=cathaypacific,DC=com',
      timeout: 5000,
      connectTimeout: 10000
    });
    try {
      client.bind('OAuthTestUser1', 'OAuthTestUser1', function (error) {
        if(error){
          console.log(error.message);
          client.unbind(function(error) {if(error){console.log(error.message);} else{console.log('client disconnected');}});
        } else {
          console.log('connected');
          client.unbind(function(error) {if(error){console.log(error.message);} else{console.log('client disconnected');}});
        }
      });
    } catch(error){
      console.log(error);
      client.unbind(function(error) {if(error){console.log(error.message);} else{console.log('client disconnected');}});
    }
});

// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
