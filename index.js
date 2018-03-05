'use strict';

/**
 * OONIMap runs a selector function across the OONI measurement corpus.
 * It can either be used to process reports for a specific slice of OONI
 * data retrieved online from the API, or against the full OONI corpus in
 * autoclaved format (Roughly 2TB at the time of writing).
 */

/**
 * OONIMap
 * If 'corpus' is unset, the API will be used, and selector will
 * specify a domain (string) or list of domains (array) to process against.
 * If corpus is a directory containing OONI data, selector can be
 * a domain (string), list of domains (array), regex of domains to match, or
 * unset (to execute func on all records).
 * func is a function called, on each relevant record.
 * Returns a readable stream of the outputs of func.
 */
module.exports = function(selector, corpus, func) {
  if (corpus) {
    var corpus = require('./corpus');
    return corpus.map(selector, corpus, func);
  } else {
    var api = require('./api');
    var can = require('./uncan');
    var tmp = require('temporary');
    var dir = new tmp.Dir();
    return api.DownloadMeasurements(selector, dir.path)
      .pipe(can.mapJSON(1, func))
      .on('finish', function () {
        dir.rmdir();
      });
  }
};
