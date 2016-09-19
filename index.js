var sax = require('sax');
var request = require('request');
var d3 = require('d3-queue');
var _ = require('lodash');
var fs = require('fs');
var parser = require('xml2json');
var Converter = require("csvtojson").Converter;
var converter = new Converter({});

processChangesets('./changesets.csv');

function processChangesets(filename) {
    var topQ = d3.queue(1);
    var existingChangesets;
    if (fs.existsSync('reverted-changesets.csv')) {
        // console.log('reverted changesets exists');
        existingChangesets = fs.readFileSync('reverted-changesets.csv', {'encoding': 'utf-8'})
            .split('\n')
            .map(function(line) {
                if (_.trim(line)) {
                    var d = JSON.parse(line);
                    return Number(_.keys(d)[0]);
                }
            })
            .filter(function(obj) {
                return obj;
            });
    } else {
        existingChangesets = [];
    }
    converter.fromFile(filename, function(err, result) {
        result.slice(1, 4).forEach(function(d) {
            if (existingChangesets.indexOf(d.changesetID) === -1) {
                topQ.defer(findReverted, d.changesetID);
            }
        });
        topQ.awaitAll(function() {
            console.log('done');
        });
    });
}

function findReverted(changeset, callback) {
    var url = "http://www.openstreetmap.org/api/0.6/changeset/" + changeset + "/download";
    request(url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var data = parser.toJson(body, {
            'object': true,
            'arrayNotation': true
        });
        var changesetData = getChangesetData(data);
        console.log('changeset data', changesetData);
        getRevertedChangesets(changeset, changesetData, callback);
        // callback();
      } else {
        console.log('get history error', error);
        console.log('get history response', response);
        callback('error');
      }
    });
}

/*
    Takes an xml2json output of a changeset and gives back all node / way / relation ids
*/
function getChangesetData(data) {
    var out = {
        'node': {},
        'way': {},
        'relation': {}
    };
    var change = data.osmChange[0];
    ['modify', 'delete'].forEach(function(changeType) {
        if (change.hasOwnProperty(changeType)) {
            change[changeType].forEach(function(obj) {
                var type = _.keys(obj)[0];
                var changeDetails = obj[type][0];
                var id = changeDetails.id;
                var version = Number(changeDetails.version);
                if (changeType === 'delete') {
                    version = version + 1;
                }
                out[type][id] = version;
            });
        }
    });
    return out;
}

function getRevertedChangesets(id, data, callback) {
    var q = d3.queue(1);
    ['node', 'way', 'relation'].forEach(function(type) {
        _.keys(data[type]).slice(0,50).forEach(function(id) {
            var version = data[type][id];
            q.defer(getRevertedChangeset, type, id, version);
        });
    });
    q.awaitAll(function(err, results) {
        var d = {};
        var cleanResults = _.filter(results, function(result) {
            return result;
        });
        d[id] = _.uniq(cleanResults);
        fs.appendFileSync('reverted-changesets.csv', JSON.stringify(d) + '\n', {'encoding': 'utf8'});
        callback();
    });
}

function getRevertedChangeset(type, id, version, callback) {
    var url = 'http://www.openstreetmap.org/api/0.6/' + type + '/' + id + '/history';
    request(url, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var featureJson = parser.toJson(body, {
                'object': true,
                'arrayNotation': true
            });
            var revertedChangesetId = getRevertedChangesetId(featureJson, type, version);
            callback(null, revertedChangesetId);
        } else {
            console.log('error fetching feature', error);
            callback(null, null);
        }
    });
}

function getRevertedChangesetId(featureJson, type, version) {
    var osm = featureJson.osm[0];
    var history = osm[type];
    var revertedChangeset;
    history.forEach(function(obj) {
        // console.log('history', obj.version, version);
        if (Number(obj.version) === Number(version) - 1) {
            revertedChangeset = obj.changeset;
        }
    });
    return revertedChangeset;
}