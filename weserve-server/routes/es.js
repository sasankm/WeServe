var express = require('express');
var router = express.Router();
var elasticsearch = require('elasticsearch');


// Instantiate client
var client = new elasticsearch.Client({
  host: 'http://ec2-35-167-3-67.us-west-2.compute.amazonaws.com:9200/',
  log: 'trace',
  apiVersion: '5.3'
});

// // ping client
// client.ping({
//     requestTimeout: 3000
// }, function (error) {
//     if (error) {
//       console.trace('Elasticsearch is down');
//     } else {
//       console.log('All is well');
//     }
// });

// // check if index exists
// elasticClient.indices.exists({
//     index: indexName
// }, function (error) {
//     if (error) {
//         console.trace('exists request failed')
//     }
// });

// Convert delimited token filter string back to array
function reverse_convert(s) {
    var f = s.split(" ");
    for(var i in f) {
        f[i] = parseFloat(f[i].split("|")[1]);
    }
    return f;
}

// Construct Elasticsearch function score query
function fn_query(query_vec, q="*", cosine=False) {
    return {
        "query": {
            "function_score": {
                "query": { 
                    "query_string": {
                        "query": q
                    }
                },
                "script_score": {
                    "script": {
                            "inline": "payload_vector_score",
                            "lang": "native",
                            "params": {
                                "field": "@model.factor",
                                "vector": query_vec,
                                "cosine" : cosine
                            }
                    }
                },
                "boost_mode": "replace"
            }
        }
    }
}

// get specific
router.get('/get_specific/:index/:type/:id', function(req,res) {
    res.send(client.get({
        index: req.params.index,
        type: req.params.type,
        id: req.params.id
    }, function (error) {
        if (error) {
            console.trace('cannot get %s/%s/%d', req.params.index, req.params.type, req.params.id);
        }
    }));
});

// Get Project Recommendations for User
// Params:
//    id  - user ID
//    num - # of projects to return
// Output: array of project IDs
router.get('/rec_projects_for_user/:id/:num', function(req,res) {
    console.log('In recommend projects for users...')
    function getUser(callback) {
        client.get({
            index: 'weserve',
            type: 'users',
            id: req.params.id
        }).then(function(response) {
            callback(response);
        });
    }
    getUser(function(response) {
        src=response._source;
        if(src.hasOwnProperty('@model') && src['@model'].hasOwnProperty('factor')){
            var raw_vec = src['@model']['factor'];
            var query_vec = reverse_convert(raw_vec);
            var query = fn_query(query_vec, q='*', cosine=false);

            function userRecSearch(callback) {
                client.search({
                    index: 'weserve',
                    type: 'projects',
                    body: query
                }).then(function(results) {
                    callback(results);
                });
            }
            userRecSearch(function(results) {
                var hits = results['hits']['hits'].slice(0,req.params.num);
                var result = hits.map(a => a._id);
                res.json({result: result});
            });
        }
    });
});

// Get User Recommendations for Project
// Params:
//    id  - project ID
//    num - # of users to return
// Output: array of user IDs
router.get('/rec_users_for_project/:id/:num', function(req,res) {
    console.log('In recommend users for project...')
    function getProject(callback) {
        client.get({
            index: 'weserve',
            type: 'projects',
            id: req.params.id
        }).then(function(response) {
            callback(response);
        });
    }
    getProject(function(response) {
        src=response._source;
        if(src.hasOwnProperty('@model') && src['@model'].hasOwnProperty('factor')){
            var raw_vec = src['@model']['factor'];
            var query_vec = reverse_convert(raw_vec);
            var query = fn_query(query_vec, q='*', cosine=false);

            function projectRecSearch(callback) {
                client.search({
                    index: 'weserve',
                    type: 'users',
                    body: query
                }).then(function(results) {
                    callback(results);
                });
            }
            projectRecSearch(function(results) {
                var hits = results['hits']['hits'].slice(0,req.params.num);
                var result = hits.map(a => a._id);
                console.log(result);
                res.json({result: result});
            });
        }
    });
});

module.exports = router;