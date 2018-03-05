'use strict';

/**
 * Run a function over an OONI canned measurement.
 */

var fs = require('fs');
var chalk = require('chalk');
var es = require('event-stream');
var ndjson = require('ndjson');
var child = require('child_process');
var mapConcurrent = require('map-stream-concurrent');
var path = require('path');
var progress = require('progressbar-stream');
var tmp = require('temporary');

function regexify(selector) {
  if (x instanceof RegExp) {
    return selector;
  }
  if (typeof selector == "string") {
    selector = [selector];
  }
  if (Array.isArray(selector)) {
    if (selector.filter(function (d) {return d.indexOf("://") != -1}).lenth == 0) {
      return new RegExp("http(s)?://(" + selector.join("|")+")(/.*)?","i");
    } else {
      return new RegExp("(" + selector.join("|") + ")(/.*)?");
    }
  }
}

console.error(chalk.blue("Done."));

var ooniWorker = function(file, match, map, done) {
  if (!file || !file.length) {
    return done("");
  }

  var matched = [];
  extract(file).on('data', function (record) {
    if (!record || !record.input || !match.test(record.input)) {
      return "";
    }
    var result = map(record);
    if (result) {
      matched.push(result);
    }
    return "";
  }).on('finish', function() {
    if(matched.length) {
      done(JSON.stringify(matched));
    } else {
      done("");
    }
  });
}

var extract = function(file) {
  return fs.createReadStream(file)
  .pipe(ndjson.parse({strict: false}));
}

// a stream adapter for a descriptor of individual JSON files to process.
// concurrency defines how many files you're okay with the map reading at once.
exports.mapJSON = function(concurrency, func) {
  return mapConcurrent(concurrency, function(records, done) {
    if (typeof records == "string") {
      records = JSON.parse(records);
    }
    if (!records.files) {
      return done();
    }
    var todo = records.files.length;
    var agg = [];
    records.files.forEach(function (file) {
      ooniWorker(file, new RegExp(''), func, function(output) {
        if (output) {
          agg.push(output)
        }
        todo--;
        if (todo == 0) {
          done(agg);
        }
      })
    });
    if (todo == 0) {
      done(agg);
    }
  });
}

// Uncan a single canned set of measurements.
// file: the .lz4
// where: the tmp directory to extract to
// what: regExp of inputs to match
// func: the function to run over getMeasurement
// out: the function to call when func() returns a non-empty output
// done: the function to call when done.
exports.unCan = function(file, where, what, func, out, done) {
  fs.mkdirSync(where);
  child.exec('tar -I lz4 --extract -f ' + file + ' -C ' + where + ' --strip-components=1',  function() {
    var jsons = fs.readdirSync(where);
    var todo = jsons.length;
    jsons.forEach(function (f) {
      ooniWorker(path.join(where, f), what, func, function(output) {
        todo--;
        if (todo == 0) {
          done();
          child.exec('rm -r ' + where);
        }
        if(output && output.length) {
          out(output)
        }
      });
    });
    // or if no files...
    if (todo == 0) {
      done();
    }
  });
}

// Can is run as a subprocess by corpus, helping to mitigate the potential
// for memory leaks when processing lots of data.
if (require.main === module) {
  if (!process.argv[2]) {
    console.error(chalk.red("Usage: uncan <file> <selector>"));
    process.exit(1);
  }
  var inRoot = process.argv[2];
  var selector = process.argv[3];

  if (selector == '-f') {
    var conf = JSON.parse(fs.readFileSync(process.argv[4]).toString());
    var func = new Function('', 'return ' + conf.func)();
    exports.unCan(inRoot, conf.tmp, regexify(conf.selector), func, console.log, function() {});
  } else {
    // random names to not conflict with others.
    var dir = new tmp.Dir();

    exports.unCan(inRoot, dir.path, regexify(selector), fuction(r) {return r}, console.log, function() {
      dir.rmdir();
    });
  }
}
