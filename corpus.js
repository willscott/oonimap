'use strict';

/**
 * Process over OONI tests. runs again local lz4 repo.
 */

var fs = require('fs');
var chalk = require('chalk');
var es = require('event-stream');
var child = require('child_process');
var mapConcurrent = require('map-stream-concurrent');
var path = require('path');
var progress = require('progressbar-stream');


var CONCURRENT_READS = 10;

var ooniWorker = function(file, done) {
  child.exec("node uncan.js " + file + " -f oonimap.lock", function(err, stdout, stderr) {
    if (!stdout.trim().length) {
      done()
    } else {
      done(stdout);
    }
  });
};

// Run function on all ooni records found within the canned repo at root
// optionally matching input of domains (string or array).
exports.map = function(domains, root, func) {
  // Learn how many files there are to process.
  console.log(chalk.blue("Finding work..."));
  var dates = fs.readdirSync(root);
  var files =[];
  dates.forEach(function (date) {
    var tests = fs.readdirSync(path.join(root, date));
    files.push(tests.filter(function (f) {
      return f.indexOf("web_connectivity") > -1;
    }).map(function (f) {
      return path.join(path.join(root, date), f);
    }));
  });
  // flatten files
  files = [].concat.apply([], files);

  console.log(chalk.blue("Done. " + files.length + " reports found."));

  // Write a config for the children.
  var tmpdir = process.env.TMPDIR;
  var td = null;
  if (!tmpdir) {
    var tmp = require('temporary');
    td = tmp.Dir();
    tmpdir = td.path;
  }
  var conf = {
    tmp: tmpdir,
    selector: domains,
    func: func.toString()
  };
  fs.writeFileSync('oonimap.lock', JSON.stringify(conf));

  return es.readArray(files)
      .pipe(progress({total: files.join("").length}))
      .pipe(mapConcurrent(CONCURRENT_READS, ooniWorker))
      .pipe(es.join('\n')).on('finish', function() {
        fs.unlinkSync('oonimap.lock');
        if (td) {
          td.rmdir();
        }
      });
}

if (require.main === module) {
  if (!process.argv[2]) {
    console.error(chalk.red("Usage: corpus <ooniroot> <domainsofinterest> <outfile>"));
    process.exit(1);
  }
  var inRoot = process.argv[2];
  var inFile = process.argv[3];
  var outFile = process.argv[4];
  if(fs.existsSync(outFile)) {
    console.error(chalk.red("Output file exists. cowardly exiting."));
    process.exit(1);
  }

  var data = fs.readFileSync(inFile).toString();
  try {
    data = JSON.parse(data);
  } catch(e) {
    data = data.trim().split('\n');
  }

  return exports.map(data, inRoot, function (r) {return r}).pipe(fs.createWriteStream(outFile));
}
