var sax = require('sax');
var request = require('request');
var d3 = require('d3-queue');
var _ = require('lodash');
// var csv = require('csvtojson');
var fs = require('fs');
var changesetParser = sax.parser();
var featureParser = sax.parser();

var Converter = require("csvtojson").Converter;
var converter = new Converter({});
var currentChangeset;

var revertChangesets = {};
converter.fromFile("./changesets.csv",function(err,result){
    // console.log(result);
    var topQ = d3.queue(1);
    console.log('json result', result);
    result.slice(1, 40).forEach(function (d) {
        console.log(d.changesetID);
        // currentChangeset = d.changesetID;
        revertChangesets[d.changesetID] = {
            'ids': {
                'nodes': {},
                'ways': {},
                'relations': {}
            }
        };
        topQ.defer(getHistory, d.changesetID);
        // fs.appendFileSync('reverted-changesets.csv', reverts.join(','), {'encoding': 'utf8'});
    });
    topQ.awaitAll(function(err) {
        if (err) throw err;
        console.log('topq awaitall called');
        console.log('revert changesets', JSON.stringify(revertChangesets));
        getRevertedChangesets(revertChangesets);
    });

});

var currentAction;
changesetParser.onopentag = function (node) {
    var name = node.name.toLowerCase();
    var attrs = {};
    for (var k in node.attributes) {
      attrs[k.toLowerCase()] = node.attributes[k];
    }

    if (name === 'modify' || name === 'delete' || name === 'create') {
        currentAction = name;
    }

    // Slightly silly hack since version numbers are not incremented for deleted features
    if (currentAction === 'delete') {
        attrs.version = Number(attrs.version) + 1;
    }

    if (name === 'node') {
        revertChangesets[currentChangeset].ids.nodes[attrs.id] = attrs.version;
    }

    if (name === 'way') {
        revertChangesets[currentChangeset].ids.ways[attrs.id] = attrs.version;
    }

    if (name === 'relation') {
        revertChangesets[currentChangeset].ids.relations[attrs.id] = attrs.version;
    }

};

changesetParser.onend = function () {
    console.log('changeset onend');
    // console.log(JSON.stringify(ids));
    // getRevertedChangesets(revertChangesets);
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
        var version = Number(attrs.version);
        var type = name + 's';
        var revertVersion = Number(revertChangesets[currentChangeset].ids[type][attrs.id]);
        // console.log('versions', version, revertVersion);
        if (version === revertVersion - 1) {
            revertedChangesets.push(attrs.changeset);
        }
    }
};

featureParser.onclosetag = function (name) {
    // console.log(name);
    // if (name === 'OSM') {
    //     var position = changesets.indexOf(currentChangeset.toString());
    //     revertedChangesets.push(changesets[position - 1]);
    // }
};
featureParser.onend = function () {
    // console.log('feature parser ended');
    // console.log(position);
    // console.log('Reverted changeset: ' + changesets[position - 1]);
};

function getHistory(changeset, callback) {
    console.log('get history', changeset);
    currentChangeset = changeset;
    var url = "http://www.openstreetmap.org/api/0.6/changeset/" + changeset + "/download";
    request(url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        // console.log(body);
        console.log('before changeset parser write body');
        changesetParser.write(body).close();
        console.log('after changeset parser write body');
        callback();
      } else {
        console.log('get history error', error);
        console.log('get history response', response);
        callback('error');
      }
    });
}

// get a list of all node ids and way id from the history.

// var ids = {
//     "nodes": [],
//     "ways": [],
//     "relations": []
// };


// function getFeatureList(history) {
//     // console.log(history);
//     // ids.nodes = [];
//     // ids.ways = [];
//     // ids.relations = [];
//     changesetParser.write(history);
// }

// for each node and way, get it's history, and get a list of changeset IDs, then get the revert changeset - 1 from that list.

var changesets = [];
var revertedChangesets = [];

function getRevertedChangesets(allChangesets) {
    var changesetQ = d3.queue(1);
    for (var c in allChangesets) {
        if (allChangesets.hasOwnProperty(c)) {
            changesetQ.defer(getRevertChangeset, c, allChangesets[c]);
        }
    }
    changesetQ.awaitAll(function() {
        console.log('all done');
    });
}

function getRevertChangeset(id, data, callback) {
    // console.log('revert changesets', JSON.stringify(revertChangesets));
    currentChangeset = id;
    var revertQ = d3.queue(1);
    revertedChangesets = [];
    _.keys(data.ids.nodes).slice(0,20).forEach(function (nodeid) {
        var nodeUrl = "http://www.openstreetmap.org/api/0.6/node/" + nodeid + "/history";
        revertQ.defer(listChangesets, nodeUrl);
    });
    _.keys(data.ids.ways).slice(0,20).forEach(function (wayid) {
        var nodeUrl = "http://www.openstreetmap.org/api/0.6/way/" + wayid + "/history";
        revertQ.defer(listChangesets, nodeUrl);
    });
    _.keys(data.ids.relations).slice(0,20).forEach(function (relid) {
        var nodeUrl = "http://www.openstreetmap.org/api/0.6/relation/" + relid + "/history";
        revertQ.defer(listChangesets, nodeUrl);
    });
    revertQ.awaitAll(function (error) {
        if (error) throw error;
        var reverts = _.uniq(revertedChangesets).join(',');
        var d = {};
        d[id] = reverts;
        fs.appendFileSync('reverted-changesets.csv', JSON.stringify(d) + '\n', {'encoding': 'utf8'});
        callback();
        // return _.uniq(revertedChangesets);
    });
}

function listChangesets(nodeUrl, callback) {
    // changesets = [];
    request(nodeUrl, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            // console.log('feature parser before write');
            featureParser.write(body).close();
            // console.log('feature parser after write');
        }
        callback(null);
    });
}

// var currentChangeset = 42023530;
// getHistory(42023530);
