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
	if (userSearchInfo.loginUsername == null || userSearchInfo.loginPassword == null) {
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

function createOnLdapBindHandler(client, systemUsername, userSearchInfo, onUserVerifySuccess, onUserVierfyFail) {
	return function (error) {
		if (error) {
			console.log('Unable to bind with systemUsername: ' + systemUsername + ' with error ' + error.message);
			onUserVierfyFail('Unable to bind with systemUsername: ' + systemUsername + ' with error ' + error.message, userSearchInfo);
		} else {
			console.log('connected');
			var opts = {
				filter: '(cn=' + userSearchInfo.loginUsername + ')',
				scope: 'sub',
				attributes: ['dn']
			};
			client.search(userSearchInfo.loginBaseDn, opts, createOnLdapSearchHandler(client, userSearchInfo, onUserVerifySuccess, onUserVierfyFail));
		}
	}
}

function createOnLdapSearchHandler(client, userSearchInfo, onUserVerifySuccess, onUserVierfyFail) {
	return function (error, search) {
		console.log('Searching for ' + userSearchInfo.loginUsername);
		if (error) {
			userSearchInfo.errorMessage = 'Unable to search with loginUsername: ' + userSearchInfo.loginUsername + ' with error ' + error.message;
			console.log(userSearchInfo.errorMessage);
			onUserVierfyFail(userSearchInfo.errorMessage, userSearchInfo);
		} else {
			search.on('searchEntry', createOnLdapSearchEntryHandler(userSearchInfo));
			search.on('error', createOnLdapSearchErrorHandler(userSearchInfo));
			search.on('end', createOnLdapSearchEndHandler(client, userSearchInfo, onUserVerifySuccess, onUserVierfyFail));
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

function createOnLdapSearchEndHandler(client, userSearchInfo, onUserVerifySuccess, onUserVierfyFail) {
	return function (result) {
		if (!assertUserSearchInfoError(userSearchInfo, result)) {
			onUserVierfyFail(userSearchInfo.errorMessage, userSearchInfo);
		} else {
			console.log('Binding using DN: ' + userSearchInfo.loginUserDn);
			client.bind(userSearchInfo.loginUserDn, userSearchInfo.loginPassword, createOnBindLoginUserHandler(userSearchInfo, onUserVerifySuccess, onUserVierfyFail));
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

function createOnBindLoginUserHandler(userSearchInfo, onUserVerifySuccess, onUserVierfyFail) {
	return function (error) {
		if (error) {
			console.log('Unable to bind with DN: ' + userSearchInfo.loginUserDn + ' with error ' + error.message);
			onUserVerifySuccess('Unable to bind with DN: ' + userSearchInfo.loginUserDn + ' with error ' + error.message, userSearchInfo);
		} else {
			console.log('Binded with DN: ' + userSearchInfo.loginUserDn);
			onUserVierfyFail('Binded with DN: ' + userSearchInfo.loginUserDn, userSearchInfo);
		}
	}
}

function createOnUserVerifySuccessHandler(res) {
	return function (msg, userSearchInfo) {
		userSearchInfo.verfied = true;
		console.log('Verified Success');
		res.send(msg);
	}
}

function createOnUserVerifyFailHandler(res) {
	return function (msg, userSearchInfo) {
		userSearchInfo.verfied = false;
		console.log('Verified Fail');
		res.send(msg);
	}
}

function createOnLdapUserVerifySuccessHandler(client, onUserVerifySuccessHandler) {
	return function (msg, userSearchInfo) {
		unbindLdap(client);
		onUserVerifySuccessHandler(msg, userSearchInfo);
	}
}

function createOnLdapUserVerifyFailHandler(client, createOnUserVerifyFailHandler) {
	return function (msg, userSearchInfo) {
		unbindLdap(client);
		createOnUserVerifyFailHandler(msg, userSearchInfo);
	}
}

function verifyLdapUser(loginUsername, loginPassword, onUserVerifySuccess, onUserVerifyFail) {
	var systemUsername = 'OAuthTestUser1';
	var systemPassword = 'OAuthTestUser1';
	var systemDnSuffix = 'OU=IMT,OU=CLK,OU=HQ,OU=Users,OU=CPA,DC=nwow001,DC=corp,DC=ete,DC=cathaypacific,DC=com';
	var ldapHost = 'ADDS.ETE.CATHAYPACIFIC.COM';
	var ldapPort = '389';
	var loginBaseDn = 'OU=IMT,OU=CLK,OU=HQ,OU=Users,OU=CPA,DC=nwow001,DC=corp,DC=ete,DC=cathaypacific,DC=com';

	var userSearchInfo = {
		loginUsername: loginUsername,
		loginPassword: loginPassword,
		loginBaseDn: null,
		loginUserDnCount: 0,
		loginUserDn: null,
		verified: false,
		errorMessage: null
	}
	userSearchInfo.loginBaseDn = loginBaseDn;

	if (!assertUsernamePassword(userSearchInfo)) {
		onUserVerifyFail(userSearchInfo.errorMessage, userSearchInfo);
		return userSearchInfo.verified;
	}

	var client = ldap.createClient({
			url: 'ldap://' + ldapHost + ':' + ldapPort,
			timeout: 5000,
			connectTimeout: 10000
		});
	var onLdapUserVerifySuccess=createOnLdapUserVerifySuccessHandler(client, onUserVerifySuccess);
	var onLdapUserVerifyFail=createOnLdapUserVerifyFailHandler(client, onUserVerifyFail);
	try {
		client.bind('cn=' + systemUsername + ',' + systemDnSuffix, systemPassword,
			createOnLdapBindHandler(
				client,
				systemUsername,
				userSearchInfo,
				onLdapUserVerifySuccess,
				onLdapUserVerifyFail));
	} catch (error) {
		console.log(error);
		onLdapUserVerifyFail('error in binding: ' + error.message, userSearchInfo);
	}
	return userSearchInfo.verified;
}

app.get('/test', function (req, res) {
	var userVerified = verifyLdapUser(
			extractUsernameFromRequest(req),
			extractPasswordFromRequest(req),
			createOnUserVerifySuccessHandler(res),
			createOnUserVerifyFailHandler(res));

	console.log('userVerified:' + userVerified);
});

// error handling
app.use(function (err, req, res, next) {
	console.error(err.stack);
	res.status(500).send('Something bad happened!');
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app;
