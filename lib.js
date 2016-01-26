/**
 * Spotify Discover Weekly Archiver (v1.0.0)
 * Trevor Starick <trevor.starick@gmail.com>
 *
 * Archives SPOTIFY'S Discover Weekly playlist for later listening.
 * (Something that Spotify should have implemented IMHO)
 *
 * TODO:
 *  - Better comments
 *  - Optimize how Request is making get and post requests with headers. It
 *    feels like it could be declared somewhere at the top of the file instead
 *    of every time a request is made.
 *  - Callback city like usual...
 *  - Set up some type of CRON to run every Wednesday so that Spotify has enough
 *    time to create and push the playlists to everyone.
 *  - Set up a landing page via GH-Pages
 */

// Project Enviroment Variable imports
var project_name = 'sdwa_151108';
var client_id = process.env[project_name + '_client_id'];
var client_secret = process.env[project_name + '_client_secret'];
var redirect_uri = process.env[project_name + '_redirect_uri'];
var cookie_secret = process.env[project_name + '_cookie_secret'];

// Everything else imports
var request = require('request');
var moment = require('moment');

var redis = require("redis");
var rdb = redis.createClient();


// Define scope and reusable Auth token
var scopes = 'playlist-read-private playlist-modify-private';

var auth_basic = "Basic ";
auth_basic += new Buffer(client_id + ':' + client_secret).toString('base64');

var exports = {};

exports.addToCron = function(key, value) {
    rdb.set(key, JSON.stringify(value), function(err) {
        if(err) console.error(err);
        console.log('Stored "%s": %s', key, JSON.stringify(value));
    });
};

// Main authentication function
exports.auth = function(req, res) {
    request({
        uri: 'https://accounts.spotify.com/api/token',
        method: 'POST',
        headers: {
            "Authorization": auth_basic
        },
        form: {
            grant_type: 'authorization_code',
            code: req.query.code,
            redirect_uri: redirect_uri
        },
        json: true
    }, function(e, r, b) {

        res.cookie('access_token', b.access_token, {
            signed: true,
            maxAge: b.expires_in * 1000
        });

        res.cookie('refresh_token', b.refresh_token, {
            signed: true
        });

        request({
            baseUrl: 'https://api.spotify.com/v1/',
            uri: 'me',
            headers: {
                "Authorization": "Bearer " + b.access_token
            },
            json: true
        }, function(e, r, b) {

            res.cookie('id', b.id, {
                signed: true
            });
            res.redirect('/archive');
        });
    });
}

// Fetch all playlists (private and public) and pass them back
exports.fetchPlaylists = function(access_token, id, cb) {
    request({
        baseUrl: 'https://api.spotify.com/v1/',
        uri: 'users/' + id + '/playlists',
        qs: {
            limit: 50
        },
        headers: {
            "Authorization": "Bearer " + access_token
        },
        json: true
    }, function(e, r, b) {
        if (e) throw e;
        if (b.error) console.log(e);

        return cb(b.items);
    });
}

// Fetch all tracks in the playlist and pass back the uris
exports.fetchTracks = function(access_token, playlist, cb) {
    request({
        uri: playlist.tracks.href,
        headers: {
            "Authorization": "Bearer " + access_token
        },
        json: true
    }, function(e, r, b) {
        if (e) throw e;

        console.log(b);

        var tracks = b.items.map(function(v, i, a) {
            return v.track.uri;
        });

        return cb(tracks);
    });
}


// Create a new playlist and add tracks to it
// *TODO*
// [ ] Split this into two functions one for creating the playlist and another for filling it
exports.archive = function(access_token, id, tracks, plist_name, cb) {
    request({
        baseUrl: 'https://api.spotify.com/v1/',
        uri: 'users/' + id + '/playlists',
        method: 'POST',
        headers: {
            "Authorization": "Bearer " + access_token,
            "Content-Type": "application/json"
        },
        json: {
            "name": plist_name,
            "public": false
        }
    }, function(e, r, b) {
        if (e) throw e;

        var plist_id = b.id;
        request({
            baseUrl: 'https://api.spotify.com/v1/',
            uri: 'users/' + id + '/playlists/' + plist_id + '/tracks',
            method: 'POST',
            headers: {
                "Authorization": "Bearer " + access_token,
                "Content-Type": "application/json"
            },
            json: {
                "uris": tracks
            }
        }, function(e, r, b) {
            return cb(b);
        });
    });
}

// Get a new access token
exports.refreshToken = function(refresh_token, cb) {
    request({
        uri: 'https://accounts.spotify.com/api/token',
        method: 'POST',
        headers: {
            "Authorization": auth_basic
        },
        form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        },
        json: true
    }, function(e, r, b) {
        cb(b.access_token, b.expires_in);
    });
};

module.exports = exports;