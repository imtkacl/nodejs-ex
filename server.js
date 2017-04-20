//  OpenShift sample Node application
var express = require('express'),
fs = require('fs'),
app = express(),
eps = require('ejs'),
morgan = require('morgan'),
request = require('request'),
ldap = require('ldapjs');

var assert = require('assert');

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

var oauth2TokenUrl=process.env.OAUTH2_TOKEN_URL;
var oauth2ProvisionKey=process.env.OAUTH2_PROVISION_KEY;
var oauth2TestBackEnd=process.env.OAUTH2_TEST_BACK_END;
var oauth2TokenTestClientId=process.env.OAUTH2_TEST_CLIENT_ID;
var oauth2TokenTestClientSecret=process.env.OAUTH2_TEST_CLIENT_SECRET;
var oauth2TokenTestUserId=process.env.OAUTH2_TEST_USER_ID;
var ldapSystemUsername = process.env.LDAP_SYSTEM_USER_NAME;
var ldapSystemPassword = process.env.LDAP_SYSTEM_PASSWORD;
var ldapSystemDnSuffix = process.env.LDAP_SYSTEM_DN_SUFFIX;
var ldapHost = process.env.LDAP_HOST;
var ldapPort = process.env.LDAP_PORT;
var ldapBaseDn = process.env.LDAP_BASE_DN;

app.get('/', function (req, res) {

	res.render('index.html', {
		pageCountMessage: null
	});

});

app.post('/dumpRequest', function (req, res) {
	var out = {
		"header": req.headers,
		"param": req.query,
		"body": req.body
	};
	res.send(out);
});

app.get('/pagecount', function (req, res) {
	// try to initialize the db on every request if it's not already
	// initialized.
	var responseCode=extractParameterFromRequest(req, 'x-custom-rsp-code');
	var responseBody=extractParameterFromRequest(req, 'x-custom-rsp-body');
	if (responseCode==null){
		responseCode=200;
	}
	if (responseBody==null){
		responseBody='{ pageCount: 0 }'
	}
	console.log(req.headers);
	res.status(responseCode).send(responseBody);
	//res.send(req.headers);

});

function getAccessToken(res, grantType, clientId, clientSecret, userid) {
	var options = {
		url: oauth2TokenUrl,
		method: 'POST',
		headers: {
			'x-forwarded-proto': 'https'
		},
		formData: {
			grant_type: grantType,
			client_id: clientId,
			client_secret: clientSecret,
			provision_key: oauth2ProvisionKey,
			authenticated_userid: userid
		}
	};

	request(options, function (error, response, body) {
		console.log('error: ' + JSON.stringify(error));
		console.log('response: ' + JSON.stringify(response));
		console.log('body: ' + body);
		if (error) {
			res.status(500).send(error);
		} else if (response.statusCode == 200) {
			res.status(response.statusCode).send(body);
		} else {
			res.status(response.statusCode).send(body);
		}

	});
}

function createGetAccessTokenHandler(res, grantType, clientId, clientSecret, userid) {
	return function (msg, userSearchInfo) {
		userSearchInfo.verfied = true;
		console.log('Verified Success');
		getAccessToken(res, grantType, clientId, clientSecret, userid);
	}
}

function createOAuthAuthFailHandler(res) {
	return function (msg, userSearchInfo) {
		userSearchInfo.verfied = false;
		console.log('OAuth Verified Fail: '+msg);
		res.status(400).send('{ "error":"invalid_grant" }');
	}
}

app.post('/oauth2/token', function (req, res) {
	var userid = extractParameterFromRequest(req, 'username');
	verifyLdapUser(
		userid,
		extractParameterFromRequest(req, 'password'),
		createGetAccessTokenHandler(
			res,
			extractParameterFromRequest(req, 'grant_type'),
			extractParameterFromRequest(req, 'client_id'),
			extractParameterFromRequest(req, 'client_secret'),
			userid),
		createOAuthAuthFailHandler(res));
});

app.post('/testOAuth2', function (req, res) {
	getAccessToken(res, "password",  oauth2TokenTestClientId, oauth2TokenTestClientSecret, oauth2TokenTestUserId);
});

app.get('/testBackEnd/', function (req, res) {
	var options = {
		url: oauth2TestBackEnd,
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

function extractParameterFromRequest(req, parameterName) {
	var parameterValue = null;
	if (req.body[parameterName] != null) {
		parameterValue = req.body[parameterName];
	} else if (req.headers[parameterName] != null) {
		parameterValue = req.headers[parameterName];
	}
	return parameterValue;
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
			onUserVierfyFail('Unable to bind with DN: ' + userSearchInfo.loginUserDn + ' with error ' + error.message, userSearchInfo);
		} else {
			console.log('Binded with DN: ' + userSearchInfo.loginUserDn);
			onUserVerifySuccess('Binded with DN: ' + userSearchInfo.loginUserDn, userSearchInfo);
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
	var userSearchInfo = {
		loginUsername: loginUsername,
		loginPassword: loginPassword,
		ldapBaseDn: null,
		loginUserDnCount: 0,
		loginUserDn: null,
		verified: false,
		errorMessage: null
	}
	userSearchInfo.loginBaseDn = ldapBaseDn;

	if (!assertUsernamePassword(userSearchInfo)) {
		onUserVerifyFail(userSearchInfo.errorMessage, userSearchInfo);
		return;
	}

	var client = ldap.createClient({
			url: 'ldap://' + ldapHost + ':' + ldapPort,
			timeout: 5000,
			connectTimeout: 10000
		});
	var onLdapUserVerifySuccess = createOnLdapUserVerifySuccessHandler(client, onUserVerifySuccess);
	var onLdapUserVerifyFail = createOnLdapUserVerifyFailHandler(client, onUserVerifyFail);
	try {
		client.bind('cn=' + ldapSystemUsername + ',' + ldapSystemDnSuffix, ldapSystemPassword,
			createOnLdapBindHandler(
				client,
				ldapSystemUsername,
				userSearchInfo,
				onLdapUserVerifySuccess,
				onLdapUserVerifyFail));
	} catch (error) {
		console.log(error);
		onLdapUserVerifyFail('error in binding: ' + error.message, userSearchInfo);
	}
}

app.get('/verifyLdap', function (req, res) {
	verifyLdapUser(
		extractParameterFromRequest(req, 'username'),
		extractParameterFromRequest(req, 'password'),
		createOnUserVerifySuccessHandler(res),
		createOnUserVerifyFailHandler(res));

});

// error handling
app.use(function (err, req, res, next) {
	console.error(err.stack);
	res.status(500).send('Something bad happened!');
});


console.log('ldapHost: '+ldapHost);
console.log('ldapPort: '+ldapPort);
console.log('ldapBaseDn: '+ldapBaseDn);
console.log('ldapSystemUsername: '+ldapSystemUsername);
console.log('ldapSystemPassword: '+ldapSystemPassword);
console.log('ldapSystemDnSuffix: '+ldapSystemDnSuffix);
console.log('oauth2TokenUrl: '+oauth2TokenUrl);
console.log('oauth2ProvisionKey: '+oauth2ProvisionKey);

console.log('oauth2TokenTestClientId: '+oauth2TokenTestClientId);
console.log('oauth2TokenTestClientSecret: '+oauth2TokenTestClientSecret);
console.log('oauth2TokenTestUserId: '+oauth2TokenTestUserId);
console.log('oauth2TestBackEnd: '+oauth2TestBackEnd);

if (typeof oauth2TokenTestClientId === 'undefined'){
	console.log('Environment variable OAUTH2_TEST_CLIENT_ID is not set. /testOAuth2 will not work')
}
if (typeof oauth2TokenTestClientSecret === 'undefined'){
	console.log('Environment variable OAUTH2_TEST_CLIENT_SECRET is not set. /testOAuth2 will not work')
}
if (typeof oauth2TokenTestUserId === 'undefined'){
	console.log('Environment variable OAUTH2_TEST_USER_ID is not set. /testOAuth2 will not work')
}
if (typeof oauth2TestBackEnd === 'undefined'){
	console.log('Environment variable OAUTH2_TEST_BACK_END is not set. /testBackEnd will not work')
}

assert(typeof ldapHost!=='undefined',  'Environment variable LDAP_HOST is not set.');
assert(typeof ldapPort!=='undefined',  'Environment variable LDAP_PORT is not set.');
assert(typeof ldapBaseDn!=='undefined',  'Environment variable LDAP_BASE_DN is not set.');
assert(typeof ldapSystemUsername!=='undefined',  'Environment variable LDAP_SYSTEM_USER_NAME is not set.');
assert(typeof ldapSystemPassword!=='undefined',  'Environment variable LDAP_SYSTEM_PASSWORD is not set.');
assert(typeof ldapSystemDnSuffix!=='undefined',  'Environment variable LDAP_SYSTEM_DN_SUFFIX is not set.');
assert(typeof oauth2TokenUrl!=='undefined',  'Environment variable OAUTH2_TOKEN_URL is not set.');
assert(typeof oauth2ProvisionKey!=='undefined',  'Environment variable OAUTH2_PROVISION_KEY is not set.');

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app;
