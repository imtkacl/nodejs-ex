//  OpenShift sample Node application
var express = require('express'),
fs = require('fs'),
app = express(),
eps = require('ejs'),
morgan = require('morgan'),
request = require('request'),
ldap = require('ldapjs');

var bodyParser = require('body-parser');
// Create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({
		extended: false
	});
app.use(urlencodedParser);

Object.assign = require('object-assign');

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
ip = process.env.IP || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';

app.get('/', function (req, res) {

	res.render('index.html', {
		pageCountMessage: null
	});

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

	var out = {
		"header": req.headers,
		"param": req.query,
		"body": req.body
	};
	res.send(out);
});

app.get('/testBackEnd/', function (req, res) {
	var options = {
		url: 'http://kong-proxy.apigw-d0.svc.cluster.local:8000/pagecount',
		method: 'GET'
	};
	request(options, function (error, response, body) {
		console.log('error: ' + error.stack);
		console.log('response: ' + response);
		console.log('body: ' + body);
		//  console.log('STATUS: ' + res.statusCode);
		//  console.log('HEADERS: ' + JSON.stringify(res.headers));
		//  res.setEncoding('utf8');
		//  res.on('data', function (chunk) {
		//    console.log('BODY: ' + chunk);
		//    });
		if (error) {
			res.status(500).send(error);
		} else if (response.statusCode == 200) {
			res.status(response.statusCode).send(body);
		} else {
			res.status(response.statusCode).send(body);
		}

	});
});

function unbindLdap(client) {
	client.unbind(function (error) {
		if (error) {
			console.log('Unable to unbind: ' + error.message);
		} else {
			console.log('client disconnected');
		}
	});
}

function createOnBindLoginUserHandler(client, res, userSearchInfo) {
	return function (error) {
		unbindLdap(client);
		if (error) {
			console.log('Unable to bind with DN: ' + userSearchInfo.loginUserDn + ' with error ' + error.message);
			res.send('Unable to bind with DN: ' + userSearchInfo.loginUserDn + ' with error ' + error.message);
		} else {
			console.log('Binded with DN: ' + userSearchInfo.loginUserDn);
			res.send('Binded with DN: ' + userSearchInfo.loginUserDn);
		}
	}
}

function createOnLdapSearchEndHandler(client, res, userSearchInfo) {
	return function (result) {
		if (userSearchInfo.searchErrorMessage != null) {}
		else if (result.status != 0) {
			userSearchInfo.searchErrorMessage = 'error in searching with loginUsername: ' + userSearchInfo.loginUsername + ' with status' + result.status;
		} else if (userSearchInfo.loginUserDnCount == 0) {
			userSearchInfo.searchErrorMessage = 'error in searching with loginUsername: ' + userSearchInfo.loginUsername + ' with empty result';
		} else if (userSearchInfo.loginUserDnCount > 1) {
			userSearchInfo.searchErrorMessage = 'error in searching with loginUsername: ' + userSearchInfo.loginUsername + ' with ' + userSearchInfo.loginUserDnCount + ' result';
		}
		if (userSearchInfo.searchErrorMessage != null) {
			unbindLdap(client);
			console.error(userSearchInfo.searchErrorMessage);
			res.send(userSearchInfo.searchErrorMessage);
		} else {
			console.log('Binding using DN: ' + userSearchInfo.loginUserDn);
			//                  var clientForLogin = ldap.createClient({
			//                    url: 'ldap://'+ldapHost+':'+ldapPort,
			//                    timeout: 5000,
			//                    connectTimeout: 10000
			//                  });
			client.bind(userSearchInfo.loginUserDn, userSearchInfo.loginPassword, createOnBindLoginUserHandler(client, res, userSearchInfo));
		}
	}
}
function createOnLdapSearchErrorHandler(userSearchInfo) {
	return function (error) {
		userSearchInfo.searchErrorMessage = 'error in searching with loginUsername: ' + userSearchInfo.loginUsername + ' with error ' + error.message;
	}
}

app.get('/test', function (req, res) {
	var systemUsername = 'OAuthTestUser1';
	var systemPassword = 'OAuthTestUser1';
	var systemDnSuffix = 'OU=IMT,OU=CLK,OU=HQ,OU=Users,OU=CPA,DC=nwow001,DC=corp,DC=ete,DC=cathaypacific,DC=com';
	var ldapHost = 'ADDS.ETE.CATHAYPACIFIC.COM';
	var ldapPort = '389';
	var loginUsername = 'OAuthTestUser1';
	var loginPassword = 'OAuthTestUser1';
	var loginBaseDn = 'OU=IMT,OU=CLK,OU=HQ,OU=Users,OU=CPA,DC=nwow001,DC=corp,DC=ete,DC=cathaypacific,DC=com';

	if (req.body.username != null) {
		loginUsername = req.body.username;
	} else if (req.headers.username != null) {
		loginUsername = req.headers.username;
	}
	if (req.body.password != null) {
		loginPassword = req.body.password;
	} else if (req.headers.password != null) {
		loginPassword = req.headers.password;
	}

	var client = ldap.createClient({
			url: 'ldap://' + ldapHost + ':' + ldapPort,
			timeout: 5000,
			connectTimeout: 10000
		});

	try {
		client.bind('cn=' + systemUsername + ',' + systemDnSuffix, systemPassword, function (error) {
			if (error) {
				console.log('Unable to bind with systemUsername: ' + systemUserName + ' with error ' + error.message);
				unbindLdap(clietn);
				res.send('Unable to bind with systemUsername: ' + systemUserName + ' with error ' + error.message);
			} else {
				console.log('connected');
				var opts = {
					filter: '(cn=' + loginUsername + ')',
					scope: 'sub',
					attributes: ['dn']
				};
				client.search(loginBaseDn, opts, function (error, search) {
					console.log('Searching for ' + loginUsername);
					if (error) {
						console.log('Unable to search with loginUsername: ' + loginUsername + ' with error ' + error.message);
						unbindLdap(clietn);
						res.send('Unable to search with loginUsername: ' + loginUsername + ' with error ' + error.message);
					} else {
						var loginUserDn = null;
						var loginUserDnCount = 0;
						var searchErrorMessage = null;
						
						var userSearchInfo = {
							loginUsername: null,
							loginPassword: null,
							loginUserDnCount: 0,
							loginUserDn: null,
							searchErrorMessage: null
						}
						userSearchInfo.loginUsername=loginUsername;
						userSearchInfo.loginPassword=loginPassword;
						search.on('searchEntry', function (entry) {
							if (entry.object) {
								loginUserDnCount++;
								if (loginUserDnCount == 1) {
									loginUserDn = entry.object.dn;
								}
								console.log('Found DN: ' + JSON.stringify(entry.object));

							}
						});

						search.on('error', createOnLdapSearchErrorHandler(userSearchInfo));

						search.on('end', createOnLdapSearchEndHandler(client, res, userSearchInfo));
					}
				});
			}
		});
	} catch (error) {
		console.log(error);
		unbindLdap(clietn);
		res.send('error in binding: ' + error.message);
	}

});

// error handling
app.use(function (err, req, res, next) {
	console.error(err.stack);
	res.status(500).send('Something bad happened!');
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app;
