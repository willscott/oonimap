'use strict';

/**
 * Given a list of domains, download relevant OONI measurements.
 */

var fs = require('fs');
var chalk = require('chalk');
var axios = require('axios');
var es = require('event-stream');
var mapConcurrent = require('map-stream-concurrent');
var path = require('path');
var progress = require('progressbar-stream');


if (!process.argv[2]) {
  console.error(chalk.red("Usage: oonimap <domains> <outputFolder>"));
  process.exit(1);
}
var inFile = process.argv[2];
var outFolder = process.argv[3];
if(fs.existsSync(outFolder)) {
  console.error(chalk.red("Output folder exists. cowardly exiting."));
  process.exit(1);
}
fs.mkdirSync(outFolder);
var outFile = path.join(outFolder, "log.json");

var CONCURRENT_REQUESTS = 2;
var PAGE_SIZE = 10000;

function ooniWorker(domain, done) {
  var info = {domain: domain, page: 0};
  getMeasurements(info)
  .then(downloadMeasurements)
  .then(function(result) {
    done(result);
  }).catch(function(err) {
    console.warn(err);
    done();
  });
}

function handler(prop, func, info, resolve, err, result) {
  if(!info[prop]) {
    info[prop] = [];
  }
  if(!err && result) {
    info[prop] = Array.from(new Set(info[prop].concat(result)));
  }

  var next = info.queue.pop();
  if(next) {
    func(next, handler.bind(this, prop, func, info, resolve));
  } else {
    resolve(info);
  }
}


// Get the list of measurementID's associated with a domain
function getMeasurements(info) {
  var page = info.page * PAGE_SIZE;
  return axios.get("https://api.ooni.io/api/v1/measurements?test_name=web_connectivity&limit=" + PAGE_SIZE + "&offset=" + page + "&input=" + info.domain)
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
    info.page += 1;
    return getMeasurements(info);
  } else {
    return info;
  }
}

function onFailMeasure(info, err) {
  info.indexFailure = err;
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
  return downloadMeasurements(info);
}

function onError(info, id, err) {
  if (!info.failures) {
    info.failures=[];
  }
  info.failures.push(id);
  return downloadMeasurements(info);
}



var length = fs.statSync(inFile).size;
fs.createReadStream(inFile)
    .pipe(progress({total: length}))
    .pipe(es.split())
    .pipe(mapConcurrent(CONCURRENT_REQUESTS, ooniWorker))
    .pipe(es.join('\n'))
    .pipe(fs.createWriteStream(outFile));
