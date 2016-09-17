var sax = require('sax');
var request = require('request');
var d3 = require('d3-queue');
var _ = require('lodash');
var changesetParser = sax.parser();
var featureParser = sax.parser();
var q = d3.queue(1);

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

featureParser.onend = function () {
    var position = changesets.indexOf(currentChangeset.toString());
    // console.log(position);
    // console.log('Reverted changeset: ' + changesets[position - 1]);
    revertedChangesets.push(changesets[position - 1]);
};

function getHistory(changeset) {
    var url = "http://www.openstreetmap.org/api/0.6/changeset/" + changeset + "/download";
    request(url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
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
        console.log('## ' + nodeid);
        changeset = [];
        var nodeUrl = "http://www.openstreetmap.org/api/0.6/node/" + nodeid + "/history";
        q.defer(listChangesets, nodeUrl);
    });
    q.awaitAll(function (error) {
        if (error) throw error;
        console.log(JSON.stringify(_.uniq(revertedChangesets)));
    });
}

function listChangesets(nodeUrl, callback) {
    request(nodeUrl, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            featureParser.write(body).close();
        }
        callback(null);
    });
}

var currentChangeset = 42023530;
getHistory(42023530);
