var sax = require('sax');
var request = require('request');
var d3 = require('d3-queue');
var _ = require('lodash');
// var csv = require('csvtojson');
var fs = require('fs');
var changesetParser = sax.parser();
var featureParser = sax.parser();
var q = d3.queue(1);

var Converter = require("csvtojson").Converter;
var converter = new Converter({});
var currentChangeset;
converter.fromFile("./changesets.csv",function(err,result){
    // console.log(result);
    result.splice(0,1).forEach(function (d) {
        console.log(d.changesetID);
        currentChangeset = d.changesetID;
        getHistory(d.changesetID);
        // fs.appendFileSync('reverted-changesets.csv', reverts.join(','), {'encoding': 'utf8'});
    });
});

changesetParser.onopentag = function (node) {
    var name = node.name.toLowerCase();
    var attrs = {};
    for (var k in node.attributes) {
      attrs[k.toLowerCase()] = node.attributes[k];
    }

    if (name === 'node') {
        ids.nodes.push(attrs.id);
    }

    if (name === 'way') {
        ids.ways.push(attrs.id);
    }

    if (name === 'relation') {
        ids.relations.push(attrs.id);
    }

};

changesetParser.onend = function () {
    // console.log(JSON.stringify(ids));
    getRevertChangeset(ids);
};
// for a changeset, get the history
// 42023530
// `http://www.openstreetmap.org/api/0.6/changeset/42023530/download

featureParser.onopentag = function (node) {
    var name = node.name.toLowerCase();
    var attrs = {};
    for (var k in node.attributes) {
      attrs[k.toLowerCase()] = node.attributes[k];
    }

    if (name === 'node' || name === 'way' || name === 'relation') {
        changesets.push(attrs.changeset);
    }
};

featureParser.onclosetag = function (name) {
    // console.log(name);
    if (name === 'OSM') {
        var position = changesets.indexOf(currentChangeset.toString());
        revertedChangesets.push(changesets[position - 1]);
    }
};
featureParser.onend = function () {
    // console.log(position);
    // console.log('Reverted changeset: ' + changesets[position - 1]);
};

function getHistory(changeset) {
    console.log(changeset);
    var url = "http://www.openstreetmap.org/api/0.6/changeset/" + changeset + "/download";
    request(url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        // console.log(body);
        getFeatureList(body);
      }
    });
}

// get a list of all node ids and way id from the history.

var ids = {
    "nodes": [],
    "ways": [],
    "relations": []
};


function getFeatureList(history) {
    ids.nodes = [];
    ids.ways = [];
    ids.relations = [];
    changesetParser.write(history).close();
}

// for each node and way, get it's history, and get a list of changeset IDs, then get the revert changeset - 1 from that list.

var changesets = [];
var revertedChangesets = [];
function getRevertChangeset(ids) {
    ids.nodes.forEach(function (nodeid) {
        var nodeUrl = "http://www.openstreetmap.org/api/0.6/node/" + nodeid + "/history";
        q.defer(listChangesets, nodeUrl);
    });
    q.awaitAll(function (error) {
        if (error) throw error;
        var reverts = _.uniq(revertedChangesets).join(',');
        var data = {};
        data[currentChangeset] = reverts;
        fs.appendFileSync('reverted-changesets.csv', JSON.stringify(data) + '\n', {'encoding': 'utf8'});
        // return _.uniq(revertedChangesets);
    });
}

function listChangesets(nodeUrl, callback) {
    changesets = [];
    request(nodeUrl, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            featureParser.write(body).close();
        }
        callback(null);
    });
}

// var currentChangeset = 42023530;
// getHistory(42023530);
