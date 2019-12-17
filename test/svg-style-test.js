var api = require('../'),
    assert = require('assert');

describe('mapshaper-svg-style.js', function () {

  describe('command line tests', function() {
    it('-svg-style (old name) works', function(done) {
      var input = [{
        name: 'foo'
      }];
      api.applyCommands('-i data.json -svg-style r=2 -o', {'data.json': input}, function(err, out) {
        var result = JSON.parse(out['data.json']);
        assert.deepEqual(result, [{name: 'foo', r: 2}]);
        done();
      });
    })

    it('-style (new name) works', function(done) {
      var input = [{
        name: 'foo'
      }];
      api.applyCommands('-i data.json -style r=2 -o', {'data.json': input}, function(err, out) {
        var result = JSON.parse(out['data.json']);
        assert.deepEqual(result, [{name: 'foo', r: 2}]);
        done();
      });
    })
  })


  describe('isSvgColor()', function () {
    var isSvgColor = api.internal.isSvgColor;
    it('hits', function () {
      assert(isSvgColor('#eee'))
      assert(isSvgColor('blue'))
      assert(isSvgColor('none'))
      assert(isSvgColor('rgb(0,32,0)'))
      assert(isSvgColor('rgba(0, 255, 92, 0.2)'))
    })
    it('misses', function() {
      assert.equal(isSvgColor('#'), false)
      assert.equal(isSvgColor('33'), false)
    })
  })

  describe('isSvgNumber()', function () {
    var isSvgNumber = api.internal.isSvgNumber;
    it('hits', function () {
      assert(isSvgNumber('4'))
      assert(isSvgNumber('0'))
      assert(isSvgNumber('-4'))
      assert(isSvgNumber(4))
      assert(isSvgNumber('0.003'))
    })
    it('misses', function () {
      assert.equal(isSvgNumber('#eee'), false)
      assert.equal(isSvgNumber('none'), false)
      assert.equal(isSvgNumber(''), false)
    })
  })

  describe('isSvgClassName()', function () {
    var isSvgClassName = api.internal.isSvgClassName;
    it('hits', function () {
      assert(isSvgClassName('_'))
      assert(isSvgClassName('black opaque'))
      assert(isSvgClassName('class-0'))
    })
    it('misses', function () {
      assert.equal(isSvgClassName('-somevar'), false)
      assert.equal(isSvgClassName(''), false)
      assert.equal(isSvgClassName('5'), false)
    })
  })

  describe('svgStyle()', function () {
    it('label-text expression detection', function() {
      var records = [{foo: 'a'}, {foo: 'b'}];
      var lyr = {data: new api.internal.DataTable(records)};

    })

    it('expressions', function () {
      var records = [{foo: 2, bar: 'a', baz: 'white'}, {foo: 0.5, bar: 'b', baz: 'black'}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        stroke: 'baz',
        'stroke-width': 'foo / 2',
        fill: 'bar == "a" ? "pink" : "green"'
      };
      var target = [{
        foo: 2,
        bar: 'a',
        baz: 'white',
        stroke: 'white',
        'stroke-width': 1,
        fill: 'pink'
      }, {
        foo: 0.5,
        bar: 'b',
        baz: 'black',
        stroke: 'black',
        'stroke-width': 0.25,
        fill: 'green'
      }];
      api.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    })

    it('literals', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        stroke: '#222222',
        'stroke-width': '4',
        fill: 'rgba(255,255,255,0.2)'
      };
      var target = [{
        stroke: '#222222',
        'stroke-width': 4,
        fill: 'rgba(255,255,255,0.2)'
      }];
      api.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    })

    it('literals 2', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        stroke: 'red',
        label_text: 'green',
        fill: 'SteelBlue'
      };
      var target = [{
        stroke: 'red',
        'label-text': 'green',
        fill: 'SteelBlue'
      }];
      api.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    })

    it('literals 3', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        label_text: 'National Oceanic and Atmospheric Administration (NOAA)',
        font_family: 'Helvetica,_sans'
      };
      var target = [{
        'label-text': 'National Oceanic and Atmospheric Administration (NOAA)',
        'font-family': 'Helvetica,_sans'
      }];
      api.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    });

    it('literals 4', function() {
      var records = [{}]
      var lyr = {
        data: new api.internal.DataTable(records)
      };
      var opts = {
        label_text: 'dane © OpenStreetMap (licencja ODBL)' // issue 363
      };
      var target = [{
        'label-text': 'dane © OpenStreetMap (licencja ODBL)'
      }];
      api.svgStyle(lyr, {}, opts);
      assert.deepEqual(lyr.data.getRecords(), target);
    });

  })
});