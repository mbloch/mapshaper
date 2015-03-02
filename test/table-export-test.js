var api = require('../'),
    utils = api.utils,
    assert = require('assert');

function stringifyEqual(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-table-export.js', function() {
  describe('exportAsDelim()', function () {


  })
})
