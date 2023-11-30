import assert from 'assert';
import api from '../mapshaper.js';

describe('mapshaper-cluster.js', function () {
  // areas: 1, 2, 3, 6
  var polys = {
    type: "GeometryCollection",
    geometries: [{
      type: "Polygon",
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
    }, {
      type: "Polygon",
      coordinates: [[[1, 0], [1, 1], [3, 1], [3, 0], [1, 0]]]
    }, {
      type: "Polygon",
      coordinates: [[[0, 1], [0, 4], [1, 4], [1, 1], [0, 1]]]
    }, {
      type: "Polygon",
      coordinates: [[[1, 1], [1, 5], [3, 5], [3, 1], [1, 1]]]
    }]
  };


  it ('clusters everything by default', function(done) {

    api.applyCommands('-cluster -o format=csv', polys, function(err, output) {
      if (err) throw err;
      var target = 'cluster\n0\n0\n0\n0';
      assert.equal(output, target);
      done();
    });
  })

  it ('uses max-height parameter', function(done) {
    api.applyCommands('-cluster id-field=aggId max-height=1 -o format=csv', polys, function(err, output) {
      var target = 'aggId\n2\n2\n0\n1';
      assert.equal(output, target);
      done();
    });
  })

  it ('uses max-width parameter', function(done) {
    api.applyCommands('-cluster id-field=aggId max-width=1 -o format=csv', polys, function(err, output) {
      var target = 'aggId\n2\n0\n2\n1';
      assert.equal(output, target);
      done();
    });
  })

  it ('pct=50%', function(done) {
    api.applyCommands('-cluster id-field=aggId pct=50% -o format=csv', polys, function(err, output) {
      var target = 'aggId\n1\n1\n1\n0';
      assert.equal(output, target);
      done();
    });
  })

  it ('pct=1%', function(done) {
    api.applyCommands('-cluster id-field=aggId pct=1% -o format=csv', polys, function(err, output) {
      var target = 'aggId\n0\n1\n2\n3';
      assert.equal(output, target);
      done();
    });
  })

  it ('pct=1', function(done) {
    api.applyCommands('-cluster id-field=aggId pct=1 -o format=csv', polys, function(err, output) {
      var target = 'aggId\n0\n0\n0\n0';
      assert.equal(output, target);
      done();
    });
  })

  it ('works with -dissolve test1', function(done) {
    api.applyCommands('-cluster id-field=aggId -dissolve aggId -o format=csv', polys, function(err, output) {
      var target = 'aggId\n0';
      assert.equal(output, target);
      done();
    });

  })

  it ('works with -dissolve test2', function(done) {
    api.applyCommands('-cluster id-field=aggId pct=0.5 -dissolve aggId -o format=csv', polys, function(err, output) {
      var target = 'aggId\n1\n0';
      assert.equal(output, target);
      done();
    });

  })

  it ('maintains groups', function(done) {
    var geojson = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {group: "a"},
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
        }
      }, {
        type: "Feature",
        properties: {group: "a"},
        geometry: {
          type: "Polygon",
          coordinates: [[[1, 0], [1, 1], [3, 1], [3, 0], [1, 0]]]
        }
      }, {
        type: "Feature",
        properties: {group: "b"},
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 1], [0, 4], [1, 4], [1, 1], [0, 1]]]
        }
      }, {
        type: "Feature",
        properties: {group: "b"},
        geometry: {
          type: "Polygon",
          coordinates: [[[1, 1], [1, 4], [3, 4], [3, 1], [1, 1]]]
        }
      }]
    };

    api.applyCommands('-cluster group-by=group id-field=grouping -o format=csv', geojson, function(err, output) {
      var target = 'group,grouping\na,0\na,0\nb,1\nb,1';
      assert.equal(output, target);
      done();
    });

  })
});
