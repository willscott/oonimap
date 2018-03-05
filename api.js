'use strict';

/**
 * Given a list of domains, download relevant OONI measurements.
 * Note: this approach seems to be super slow :-/
 */

var fs = require('fs');
var chalk = require('chalk');
var axios = require('axios');
var es = require('event-stream');
var mapConcurrent = require('map-stream-concurrent');
var path = require('path');
var progress = require('progressbar-stream');

var CONCURRENT_REQUESTS = 2;
var PAGE_SIZE = 10000;

function ooniWorker(domain, done) {
  if (!domain || !domain.length) {
    return done();
  }
  var info = {domain: domain, pages: 0, files: []};
  getMeasurements(info)
  .then(downloadMeasurements)
  .then(function(result) {
    delete result.queue;
    if (result.indexFailure) {
      result.error = result.indexFailure;
    }
    done(JSON.stringify(result));
  }).catch(function(err) {
    info.error = err.toString();
    done(JSON.stringify(info));
  });
}

// Get the list of measurementID's associated with a domain
function getMeasurements(info) {
  var page = info.pages * PAGE_SIZE;
  return axios.get("https://api.ooni.io/api/v1/measurements?test_name=web_connectivity&limit=" + PAGE_SIZE + "&offset=" + page + "&input=" + encodeURIComponent(info.domain))
  .then(onMeasurement.bind(this, info)).catch(onFailMeasure.bind(this,info));
}

function onMeasurement(info, response) {
  console.log('index for ' + info.domain + '.');
  if (!info.ids) {
    info.ids = [];
  }
  info.ids = info.ids.concat(response.data.results.map(function(result) {
    return result.measurement_id;
  }));
  if(response.data.metadata.next_url) {
    info.pages += 1;
    return getMeasurements(info);
  } else {
    return info;
  }
}

function onFailMeasure(info, err) {
  info.indexFailure = err.toString();
  info.ids = [];
  return info;
}

// Download the measurementID's associated with a domain
function downloadMeasurements(info) {
  if (!info.queue) {
    info.queue = info.ids;
  }

  var next = info.queue.pop();
  if (!next) {
    return Promise.resolve(info);
  }

  return axios.get("https://api.ooni.io/api/v1/measurement/" + next).then(onDownload.bind(this, info, next)).catch(onError.bind(this,info, next));
}

function onDownload(info, id, response) {
  var df = path.join(outFolder, info.domain);
  if (!fs.existsSync(df)) {
    fs.mkdirSync(df);
  }
  fs.writeFileSync(path.join(df, id), JSON.serialize(response.data));
  info.files.push(path.join(df, id));
  return downloadMeasurements(info);
}

function onError(info, id, err) {
  if (!info.failures) {
    info.failures=[];
  }
  info.failures.push(id);
  return downloadMeasurements(info);
}

/**
 * DownloadMeasurements downloads OONI measurements for one or several domains.
 * domains is an array of domains to be passed to OONI API.
 * output dir is a directory to be filled with donloaded measurments.
 *   In the folder, a new folder will be made for each domain, which will
 *   be populated with json files of each report relevant to that domain.
 * Returns a stream of JSON serialized records of what measurement IDs were
 * downloaded for each domain specified.
 */
exports.DownloadMeasurements = function(domains, outputDir) {
  var length = domains.join("").length;

  if(!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  var outFile = path.join(outputDir, "log.json");

  return es.readArray(domains)
      .pipe(progress({total: length}))
      .pipe(mapConcurrent(CONCURRENT_REQUESTS, ooniWorker))
};
