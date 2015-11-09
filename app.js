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

// ExpressJS imports
var express = require('express');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

// Everything else imports
var request = require('request');
var moment = require('moment');


// Init Express Server
var app = express();

// Use cookies, logging and static file serving
app.use(cookieParser(cookie_secret));
app.use(logger('combined'));
app.use(express.static(__dirname + '/public'));


// Define scope and reusable Auth token
var scopes = 'playlist-read-private playlist-modify-private';

var auth_basic = "Basic ";
auth_basic += new Buffer(client_id + ':' + client_secret).toString('base64');


// Main authentication function
function auth(req, res) {
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
function fetchPlaylists(access_token, id, cb) {
  request({
    baseUrl: 'https://api.spotify.com/v1/',
    uri: 'users/' + id + '/playlists',
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
function fetchTracks(access_token, playlist, cb) {
  request({
    uri: playlist.tracks.href,
    headers: {
      "Authorization": "Bearer " + access_token
    },
    json: true
  }, function(e, r, b) {
    if (e) throw e;

    var tracks = b.items.map(function(v, i, a) {
      return v.track.uri;
    });

    return cb(tracks);
  });
}


// Create a new playlist and add tracks to it
// *TODO*
// [ ] Split this into two functions one for creating the playlist and another for filling it
function archive(access_token, id, tracks, plist_name, cb) {
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
function refreshToken(req, res) {
  request({
    uri: 'https://accounts.spotify.com/api/token',
    method: 'POST',
    headers: {
      "Authorization": auth_basic
    },
    form: {
      grant_type: 'refresh_token',
      refresh_token: req.signedCookies.refresh_token
    },
    json: true
  }, function(e, r, b) {
    res.cookie('access_token', b.access_token, {
      signed: true,
      maxAge: b.expires_in * 1000
    });

    res.redirect('/archive');
  });
}


// Main web endpoint
app.get('/archive', function(req, res) {
  if (req.signedCookies.id && req.signedCookies.refresh_token) {

    if (req.signedCookies.access_token) {
      var access_token = req.signedCookies.access_token;
      var id = req.signedCookies.id;

      // Moment says weeks start on sunday. This makes them start on Monday.
      var startOfWeek = moment()
        .subtract(1, 'days').startOf('week') // Go back a day and then to the start of the week
        .add(1, 'days').format('L'); // Go forward a day and get the current date

      var plist_name = "Archive Weekly - " + startOfWeek;

      var dupe = false;

      fetchPlaylists(access_token, id, function(plists) {
        Object.keys(plists).forEach(function(v, i) {
          if (plists[i].name === plist_name) {
            dupe = true;
            res.redirect('/done');
          } else if (plists[i].name === "Discover Weekly" && dupe === false) {
            var playlist = plists[i];

            fetchTracks(access_token, playlist, function(tracks) {
              archive(access_token, id, tracks, plist_name, function(response) {
                // res.json(response);
                res.redirect('/done');
              });
            });
          }
        });
      });
    } else {
      refreshToken(req, res);
    }
  } else {
    res.redirect('/login');
  }
});

// Refresh token endpoint for no reason at all.
app.get('/refresh_token', refreshToken);

// Login via Spotify
app.get('/login', function(req, res) {
  // *TODO*
  // [ ] Use state param (https://developer.spotify.com/web-api/authorization-guide/#tablepress-64)
  res.redirect('https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + client_id +
    (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
    '&redirect_uri=' + encodeURIComponent(redirect_uri));
});

// Callback Me Maybe
app.get('/crj', auth);

app.get('/start', function(req, res) {
  res.sendFile(__dirname + '/public/start.html');
});

app.get('/done', function(req, res) {
  res.sendFile(__dirname + '/public/done.html');
});

// Catch all and point to index. Lazy man's 404 page
app.all('/*', function(req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

// Listen on enviroment variable port or default of 8000
app.listen(process.env.PORT || 8000);
