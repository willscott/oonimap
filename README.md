OONI Map
========

A downloader for all measurements meeting a specific citeria in the OONI database.

Installation
-----

API Usage
=========
OONIMap presents a stream interface to queries against the OONI data. A
basic example looks like:

```node

var oonimap = require('oonimap');
oonimap("www.google.com", null, function (record) {
  if (record.probe_cc == "US" && record.probe_asn != null && record.test_keys.accessible !== true) {
    return [record.test_start_time, record.probe_asn];
  }
}).on('data', function(result) {
  console.log(result);
});

```

CMD Line Usage
======

Single File
----

```
node uncan.js measurement.lz4 google.com
```

will print all JSON records within measurement.lz4 matching the selector (google.com).

Relevant Environmental Variables:
`TMPDIR` is used for extraction of .lz4 files. If the default temporary directory
is not memory backed, consider making a `tmp` filesystem that is used.

Full corpus
------

```
node corpus.js s3-sync/ domains.txt output.txt
```

Takes in the s3 buckets of OONI data, a list of selectors on input (either return separated, JSON encoded array),
and a file where matching / transformed records are output to. 
