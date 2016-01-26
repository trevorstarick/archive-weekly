var archiver = require("./lib.js");

var moment = require('moment');

var redis = require("redis");
var rdb = redis.createClient();

rdb.keys('*', function(err, value) {
    if (err) throw err;

    var startOfWeek = moment()
        .subtract(1, 'days').startOf('week') // Go back a day and then to the start of the week
        .add(1, 'days').format('L'); // Go forward a day and get the current date

    var plist_name = "Archive Weekly - " + startOfWeek;

    value.forEach(function(v, i, a) {
        rdb.get(v, function(err, data) {
            if (err) throw err;
            data = JSON.parse(data);

            archiver.refreshToken(data.refresh_token, function(access_token) {
                archiver.fetchTracks(access_token, data.playlist, function(tracks) {
                    archiver.archive(access_token, v, tracks, plist_name, function(){});
                });
            });
        });
    });
});