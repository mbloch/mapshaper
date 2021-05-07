var api = require('../'),
  assert = require('assert');

describe('mapshaper-classify.js', function () {

  describe('categorical colors', function () {
    it('options use lists of quoted strings', function (done) {
      var data='plu\nAsian Indian\n"Chinese, except Taiwanese"\nFilipino';
      var cmd = "-i data.csv -classify plu categories='Asian Indian','Chinese, except Taiwanese' colors='#e6194b','#3cb44b' -o";
      api.applyCommands(cmd, {'data.csv': data}, function(err, out) {
        var target='plu,fill\nAsian Indian,#e6194b\n"Chinese, except Taiwanese",#3cb44b\nFilipino,#eee';
        assert.equal(out['data.csv'], target);
        done();
      });
    })
  })
  it('error on unknown color scheme', function(done) {
    var data='value\n1\n2\n3\n4';
    api.applyCommands('-i data.csv -classify value colors=blues -o', {'data.csv': data}, function(err, out) {
      done();
    });
  });

  it('color= option accepts a color scheme name', function(done) {
    var data='value\n1\n2\n3\n4';
    api.applyCommands('-i data.csv -classify value colors=Blues -o format=json', {'data.csv': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert('fill' in data[0]);
      done();
    });
  })


});