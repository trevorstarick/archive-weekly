/*jshint node: true*/
"use strict";

var archiver = require("./lib.js");

// ExpressJS imports
var express = require('express');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var moment = require('moment');

// Project Enviroment Variable imports
var project_name = 'sdwa_151108';

var client_id = process.env[project_name + '_client_id'];
var client_secret = process.env[project_name + '_client_secret'];
var redirect_uri = process.env[project_name + '_redirect_uri'];
var cookie_secret = process.env[project_name + '_cookie_secret'];

var scopes = 'playlist-read-private playlist-modify-private';

// Init Express Server
var app = express();

// Use cookies, logging and static file serving
app.use(cookieParser(cookie_secret));
app.use(logger('combined'));
app.use(express.static(__dirname + '/public'));

// Main web endpoint
app.get('/archive', function (req, res) {
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

      archiver.fetchPlaylists(access_token, id, function (plists) {
        Object.keys(plists).forEach(function (v, i) {
          if (plists[i].name === plist_name) {
            dupe = true;
            res.redirect('/done');
          } else if (plists[i].name === "Discover Weekly" && dupe === false) {
            var playlist = plists[i];

            archiver.fetchTracks(access_token, playlist, function (tracks) {
              archiver.archive(access_token, id, tracks, plist_name, function (response) {
                res.redirect('/done');
              });
            });
          }
        });
      });
    } else {
      archiver.refreshToken(req.signedCookies.refresh_token, function (access_token, expires_in) {
        res.cookie('access_token', access_token, {
          signed: true,
          maxAge: expires_in * 1000
        });

        res.redirect('/archive');
      });
    }
  } else {
    res.redirect('/login');
  }
});

app.get('/enable_cron', function (req, res) {
  if (req.signedCookies.id && req.signedCookies.refresh_token) {
    if (req.signedCookies.access_token) {
      archiver.fetchPlaylists(req.signedCookies.access_token, req.signedCookies.id, function (plists) {
        Object.keys(plists).forEach(function (v, i, a) {
          if (plists[i].name === "Discover Weekly") {
            var value = req.signedCookies;
            value.playlist = plists[i];

            archiver.addToCron(req.signedCookies.id, value);
            res.json(value);
          } else if (i === a.length - 1) {
            res.end("Could not find playlist");
          }
        });
      });
    } else {
      archiver.refreshToken(req.signedCookies.refresh_token, function (access_token, expires_in) {
        res.cookie('access_token', access_token, {
          signed: true,
          maxAge: expires_in * 1000
        });

        res.redirect('/archive');
      });
    }
  } else {
    res.redirect('/login');
  }
});

// Login via Spotify
app.get('/login', function (req, res) {
  // *TODO*
  // [ ] Use state param (https://developer.spotify.com/web-api/authorization-guide/#tablepress-64)
  res.redirect('https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + client_id +
    (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
    '&redirect_uri=' + encodeURIComponent(redirect_uri));
});

// Callback Me Maybe
app.get('/crj', archiver.auth);

app.get('/start', function (req, res) {
  res.sendFile(__dirname + '/public/start.html');
});

app.get('/done', function (req, res) {
  res.sendFile(__dirname + '/public/done.html');
});

// Catch all and point to index. Lazy man's 404 page
app.all('/*', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

// Listen on enviroment variable port or default of 8000
var port = process.env.PORT || 8000;
app.listen(port);