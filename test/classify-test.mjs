import api from '../mapshaper.js';
import assert from 'assert';

describe('mapshaper-classify.js', function () {

  describe('classify command', function() {
    it('outer-breaks option + equal-interval classification', async function() {
      var data = 'value\n0\n3\n5\n7\n10\n100'
      // three classes, two inner breaks: 4,6
      var cmd = 'data.csv -classify value outer-breaks=2,8 save-as=type values=a,b,c equal-interval -o format=json';
      var out = await api.applyCommands(cmd, {'data.csv': data});
      var target = [
        {value:0, type: 'a'},
        {value: 3, type: 'a'},
        {value: 5, type: 'b'},
        {value: 7, type: 'c'},
        {value: 10, type: 'c'},
        {value: 100, type: 'c'}];
      assert.deepEqual(JSON.parse(out['data.json']), target)
    });

  })

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

    it('assign a color to each value when categories=* is used', function(done) {
      var data = 'name\ncar\ntruck\ntrain\nbike';
      var cmd = '-i data.csv -classify name categories=* colors=Tableau20 -o';
      api.applyCommands(cmd, {'data.csv': data}, function(err, out) {
        var target = 'name,fill\ncar,#4c78a8\ntruck,#9ecae9\ntrain,#f58518\nbike,#ffbf79';
        assert.equal(out['data.csv'], target);
        done();
      });
    })

    it('accept numbers as categorical values', async function() {
      var data = 'name\ncar\ntruck\ntrain\nbike';
      var cmd = '-i data.csv -classify save-as=opacity name categories=car,truck,train values=0.3,0.5,0.7 null-value=0 -o format=json';
      var out = await api.applyCommands(cmd, {'data.csv': data});
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{name: 'car', opacity: 0.3}, {name: 'truck', opacity: 0.5}, {name: 'train', opacity: 0.7}, {name: 'bike', opacity: 0}]);
    });

    it('accept numbers as categories', async function() {
      var data = 'code\n0\n1\n2\n3';
      var cmd = '-i data.csv -classify save-as=opacity code categories=0,1,2 values=0.3,0.5,0.7 null-value=0 -o format=json';
      var out = await api.applyCommands(cmd, {'data.csv': data});
      var data = JSON.parse(out['data.json']);
      assert.deepEqual(data, [{code: 0, opacity: 0.3}, {code: 1, opacity: 0.5}, {code: 2, opacity: 0.7}, {code: 3, opacity: 0}]);
    });

  })

  describe('empty field tests', function() {
    it('test 1', function(done) {
      var data = [{foo: null}, {foo: null}];
      var cmd = '-i data.json -classify foo breaks=0,2,4 colors=random -o';
      api.applyCommands(cmd, {'data.json': data}, function(err, out) {
        var json = JSON.parse(out['data.json']);
        assert.deepStrictEqual(json, [
          {foo: null, fill: '#eee'}, {foo: null, fill: '#eee'}]);
        done();
      });
    })

    it('test 1b', function(done) {
      var data = [{foo: NaN}, {foo: NaN}];
      var cmd = '-i data.json -classify foo breaks=0,2,4 colors=random null-value=purple -o';
      api.applyCommands(cmd, {'data.json': data}, function(err, out) {
        var json = JSON.parse(out['data.json']);
        assert.deepStrictEqual(json, [
          {foo: null, fill: 'purple'}, {foo: null, fill: 'purple'}]);
        done();
      });
    })


    it('test 2', function(done) {
      var data = [{foo: null}, {foo: null}];
      var cmd = '-i data.json -classify foo null-value=-2 -o';
      api.applyCommands(cmd, {'data.json': data}, function(err, out) {
        var json = JSON.parse(out['data.json']);
        assert.deepStrictEqual(json, [
          {foo: null, class: -2}, {foo: null, class: -2}]);
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