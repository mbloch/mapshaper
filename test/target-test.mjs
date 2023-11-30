import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-target.js', function () {

  it('error is thrown if target is not found', function(done) {
    var cmd = "-i test/data/three_points.shp -i test/data/text/states.csv -target counties -o";
    api.applyCommands(cmd, {}, function(err, output) {
      assert(err.name, 'UserError');
      done();
    })
  })

  it('error is thrown if target= option is not found', function(done) {
    var cmd = "-i test/data/three_points.shp -i test/data/text/states.csv -o target=counties";
    api.applyCommands(cmd, {}, function(err, output) {
      assert(err.name, 'UserError');
      done();
    })
  })


  it('target second of two datasets', function(done) {
    var cmd = "-i test/data/three_points.shp -i test/data/text/states.csv -target states -o";
    api.applyCommands(cmd, {}, function(err, output) {
      assert('states.csv' in output);
      done();
    })
  })

  it('target layer in first of two datasets by layer number', function(done) {
    var cmd = "-i test/data/three_points.shp -i test/data/text/states.csv -target 1 -o";
    api.applyCommands(cmd, {}, function(err, output) {
      assert('three_points.shp' in output);
      assert('three_points.dbf' in output);
      assert('three_points.prj' in output);
      done();
    })
  })

  it('target layer in second of two datasets by layer number', function(done) {
    var cmd = "-i test/data/three_points.shp -filter true + -i test/data/text/states.csv -target 3 -o";
    api.applyCommands(cmd, {}, function(err, output) {
      assert.deepEqual(Object.keys(output), ['states.csv']);
      done();
    })
  })

  it('-target name= option renames target layer', function(done) {
    var cmd = "-i test/data/three_points.shp -target 1 name=a -o format=geojson";
    api.applyCommands(cmd, {}, function(err, output) {
      var a = JSON.parse(output['a.json']);
      assert.equal(a.type, 'FeatureCollection');
      done();
    })
  })

  it('error if no layer is matched', function(done) {
    var cmd = "-i test/data/three_points.shp -target states";
    api.runCommands(cmd, function(err) {
      assert.equal(err.name, 'UserError');
      done();
    })
  })

  it('layers on separate datasets can be matched', function(done) {
    var cmd = "-i test/data/three_points.shp -i test/data/three_points.shp \
      -rename-layers layer1,layer2 -target * -o format=geojson";
    api.applyCommands(cmd, function(err, output) {
      assert('layer1.json' in output);
      assert('layer2.json' in output);
      done();
    })
  })

  it('select target by type', function(done) {
    var cmd = "-i test/data/issues/177/mixed_feature.json -target type=point -o point.json";
    var target = {
      "type": "FeatureCollection",
      "features": [{
        "type": "Feature",
        "properties": {"name": "A"},
        "geometry": {
          "type": "MultiPoint",
          "coordinates": [[0, 1], [2, 3]]
        }
      }]
    };
    api.applyCommands(cmd, {}, function(err, output) {
      assert.deepEqual(JSON.parse(output['point.json']), target);
      done();
    })
  })

  it('select target by type and target=', function(done) {
    var cmd = "-i test/data/issues/177/mixed_feature.json name=features -target features type=point -o point.json";
    api.applyCommands(cmd, {}, function(err, output) {
      assert(!!output['point.json']);
      done();
    })
  })

})