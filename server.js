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
function extractUsernameFromRequest(req) {
	var loginUsername = null;
	if (req.body.username != null) {
		loginUsername = req.body.username;
	} else if (req.headers.username != null) {
		loginUsername = req.headers.username;
	}
	return loginUsername;
}

function extractPasswordFromRequest(req) {
	var loginPassword = null;
	if (req.body.password != null) {
		loginPassword = req.body.password;
	} else if (req.headers.password != null) {
		loginPassword = req.headers.password;
	}
	return loginPassword;
}

function assertUsernamePassword(userSearchInfo) {
	if (loginUsername == null || loginPassword == null) {
		userSearchInfo.errorMessage = 'Invalid username: ' + userSearchInfo.loginUsername + ' or password ' + userSearchInfo.loginPassword;
		console.log(userSearchInfo.errorMessage);
		return false;
	}
	return true;
}

function unbindLdap(client) {
	client.unbind(function (error) {
		if (error) {
			console.log('Unable to unbind: ' + error.message);
		} else {
			console.log('client disconnected');
		}
	});
}

function createOnLdapBindHandler(client, res, systemUserName, userSearchInfo) {
	return function (error) {
		if (error) {
			console.log('Unable to bind with systemUsername: ' + systemUserName + ' with error ' + error.message);
			unbindLdap(clietn);
			res.send('Unable to bind with systemUsername: ' + systemUserName + ' with error ' + error.message);
		} else {
			console.log('connected');
			var opts = {
				filter: '(cn=' + userSearchInfo.loginUsername + ')',
				scope: 'sub',
				attributes: ['dn']
			};
			client.search(userSearchInfo.loginBaseDn, opts, createOnLdapSearchHandler(client, res, userSearchInfo));
		}
	}
}

function createOnLdapSearchHandler(client, res, userSearchInfo) {
	return function (error, search) {
		console.log('Searching for ' + userSearchInfo.loginUsername);
		if (error) {
			userSearchInfo.errorMessage = 'Unable to search with loginUsername: ' + userSearchInfo.loginUsername + ' with error ' + error.message;
			console.log(userSearchInfo.errorMessage);
			unbindLdap(client);
			res.send(userSearchInfo.errorMessage);
		} else {
			search.on('searchEntry', createOnLdapSearchEntryHandler(userSearchInfo));
			search.on('error', createOnLdapSearchErrorHandler(userSearchInfo));
			search.on('end', createOnLdapSearchEndHandler(client, res, userSearchInfo));
		}
	}
}

function createOnLdapSearchEntryHandler(userSearchInfo) {
	return function (entry) {
		if (entry.object) {
			userSearchInfo.loginUserDnCount++;
			if (userSearchInfo.loginUserDnCount == 1) {
				userSearchInfo.loginUserDn = entry.object.dn;
			}
			console.log('Found DN: ' + JSON.stringify(entry.object));
		}
	}
}

function createOnLdapSearchEndHandler(client, res, userSearchInfo) {
	return function (result) {
		if (!assertUserSearchInfoError(userSearchInfo, result)) {
			unbindLdap(client);
			res.send(userSearchInfo.errorMessage);
		} else {
			console.log('Binding using DN: ' + userSearchInfo.loginUserDn);
			client.bind(userSearchInfo.loginUserDn, userSearchInfo.loginPassword, createOnBindLoginUserHandler(client, res, userSearchInfo));
		}
	}
}

function assertUserSearchInfoError(userSearchInfo, result) {
	if (userSearchInfo.errorMessage == null) {
		if (result.status != 0) {
			userSearchInfo.errorMessage = 'error in searching with loginUsername: ' + userSearchInfo.loginUsername + ' with status' + result.status;
		} else if (userSearchInfo.loginUserDnCount == 0) {
			userSearchInfo.errorMessage = 'error in searching with loginUsername: ' + userSearchInfo.loginUsername + ' with empty result';
		} else if (userSearchInfo.loginUserDnCount > 1) {
			userSearchInfo.errorMessage = 'error in searching with loginUsername: ' + userSearchInfo.loginUsername + ' with ' + userSearchInfo.loginUserDnCount + ' result';
		}
	}
	if (userSearchInfo.errorMessage != null) {
		console.error(userSearchInfo.errorMessage);
		return false;
	}
	return true;
}

function createOnLdapSearchErrorHandler(userSearchInfo) {
	return function (error) {
		userSearchInfo.errorMessage = 'error in searching with loginUsername: ' + userSearchInfo.loginUsername + ' with error ' + error.message;
	}
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

app.get('/test', function (req, res) {
	var systemUsername = 'OAuthTestUser1';
	var systemPassword = 'OAuthTestUser1';
	var systemDnSuffix = 'OU=IMT,OU=CLK,OU=HQ,OU=Users,OU=CPA,DC=nwow001,DC=corp,DC=ete,DC=cathaypacific,DC=com';
	var ldapHost = 'ADDS.ETE.CATHAYPACIFIC.COM';
	var ldapPort = '389';
	var loginBaseDn = 'OU=IMT,OU=CLK,OU=HQ,OU=Users,OU=CPA,DC=nwow001,DC=corp,DC=ete,DC=cathaypacific,DC=com';

	var userSearchInfo = {
		loginUsername: extractUsernameFromRequest(req),
		loginPassword: extractPasswordFromRequest(req),
		loginBaseDn: null;
		loginUserDnCount: 0,
		loginUserDn: null,
		errorMessage: null
	}
	userSearchInfo.loginBaseDn=loginBaseDn;
	
	if (!assertUsernamePassword(userSearchInfo)) {
		res.send(userSearchInfo.errorMessage);
		return;
	}

	var client = ldap.createClient({
			url: 'ldap://' + ldapHost + ':' + ldapPort,
			timeout: 5000,
			connectTimeout: 10000
		});

	try {
		client.bind('cn=' + systemUsername + ',' + systemDnSuffix, systemPassword,
			createOnLdapBindHandler(client, res, systemUserName, userSearchInfo));
	} catch (error) {
		console.log(error);
		unbindLdap(client);
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
