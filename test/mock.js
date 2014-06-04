// Load modules

var Querystring = require('querystring');
var Hawk = require('hawk');
var Lab = require('lab');
var Hapi = require('hapi');
var Hoek = require('hoek');
var Nipple = require('nipple');


// Declare internals

var internals = {};


// Test shortcuts

var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var describe = Lab.experiment;


exports.V1 = internals.V1 = function () {

    this.tokens = {};

    this.server = new Hapi.Server(0, 'localhost');
    this.server.route([
        {
            method: 'POST',
            path: '/temporary',
            config: {
                bind: this,
                handler: function (request, reply) {

                    var header = Hawk.utils.parseAuthorizationHeader(request.headers.authorization.replace(/OAuth/i, 'Hawk'), ['realm', 'oauth_consumer_key', 'oauth_signature_method', 'oauth_callback', 'oauth_signature', 'oauth_version', 'oauth_timestamp', 'oauth_nonce']);
                    expect(header.oauth_callback).to.exist;

                    var token = String(Object.keys(this.tokens).length + 1);
                    this.tokens[token] = {
                        authorized: false,
                        secret: 'secret',
                        callback: header.oauth_callback
                    };

                    var payload = {
                        oauth_token: token,
                        oauth_token_secret: 'secret',
                        oauth_callback_confirmed: true
                    };

                    reply(Querystring.encode(payload)).type('application/x-www-form-urlencoded');
                }
            }
        },
        {
            method: 'GET',
            path: '/auth',
            config: {
                bind: this,
                handler: function (request, reply) {

                    var token = this.tokens[request.query.oauth_token];
                    expect(token).to.exist;

                    token.authorized = true;
                    token.verifier = '123';

                    reply().redirect(unescape(token.callback) + '?oauth_token=' + request.query.oauth_token + '&oauth_verifier=' + token.verifier);
                }
            }
        },
        {
            method: 'POST',
            path: '/token',
            config: {
                bind: this,
                handler: function (request, reply) {

                    var header = Hawk.utils.parseAuthorizationHeader(request.headers.authorization.replace(/OAuth/i, 'Hawk'), ['realm', 'oauth_consumer_key', 'oauth_token', 'oauth_signature_method', 'oauth_verifier', 'oauth_signature', 'oauth_version', 'oauth_timestamp', 'oauth_nonce']);
                    var token = this.tokens[header.oauth_token];
                    expect(token).to.exist;
                    expect(token.verifier).to.equal(header.oauth_verifier);
                    expect(token.authorized).to.equal(true);

                    var payload = {
                        oauth_token: 'final',
                        oauth_token_secret: 'secret'
                    };

                    if (header.oauth_consumer_key === 'twitter') {
                        payload.user_id = '1234567890';
                        payload.screen_name = 'Steve Stevens';
                    }

                    reply(Querystring.encode(payload)).type('application/x-www-form-urlencoded');
                }
            }
        }
    ]);
};


internals.V1.prototype.start = function (callback) {

    var self = this;

    this.server.start(function (err) {

        expect(err).to.not.exist;

        self.uri = self.server.info.uri;

        return callback({
            protocol: 'oauth',
            temporary: self.server.info.uri + '/temporary',
            auth: self.server.info.uri + '/auth',
            token: self.server.info.uri + '/token'
        });
    })
};


internals.V1.prototype.stop = function (callback) {

    this.server.stop(callback);
};


exports.V2 = internals.V2 = function () {

    this.codes = {};

    this.server = new Hapi.Server(0, 'localhost');
    this.server.route([
        {
            method: 'GET',
            path: '/auth',
            config: {
                bind: this,
                handler: function (request, reply) {

                    var code = String(Object.keys(this.codes).length + 1);
                    this.codes[code] = {
                        redirect_uri: request.query.redirect_uri,
                        client_id: request.query.client_id
                    };

                    reply().redirect(request.query.redirect_uri + '?code=' + code + '&state=' + request.query.state);
                }
            }
        },
        {
            method: 'POST',
            path: '/token',
            config: {
                bind: this,
                handler: function (request, reply) {

                    var code = this.codes[request.payload.code];
                    expect(code).to.exist;
                    expect(code.redirect_uri).to.equal(request.payload.redirect_uri);
                    expect(code.client_id).to.equal(request.payload.client_id);

                    var payload = {
                        access_token: '456',
                        expires_in: 3600
                    };

                    reply(payload);
                }
            }
        }
    ]);
};


internals.V2.prototype.start = function (callback) {

    var self = this;

    this.server.start(function (err) {

        expect(err).to.not.exist;

        self.uri = self.server.info.uri;

        return callback({
            protocol: 'oauth2',
            auth: self.server.info.uri + '/auth',
            token: self.server.info.uri + '/token'
        });
    })
};


internals.V2.prototype.stop = function (callback) {

    this.server.stop(callback);
};


exports.override = function (uri, payload) {

    internals.nippleGet = Nipple.get;
    Nipple.get = function (dest) {

        var options = arguments.length === 3 ? arguments[1] : {};
        var callback = arguments.length === 3 ? arguments[2] : arguments[1];

        if (dest.indexOf(uri) === 0) {
            return Hoek.nextTick(callback)(null, { statusCode: 200 }, JSON.stringify(payload));
        }

        return internals.nippleGet.apply(null, arguments);
    };
};


exports.clear = function (uri) {

    Nipple.get = internals.nippleGet;
};