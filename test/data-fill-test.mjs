import api from '../mapshaper.js';
import assert from 'assert';


// DATA SETS

// two adjacent boxes
//
//  . --- . --- .
//  |     |     |
//  |     |     |
//  . --- . --- .
//
var inputA = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {state: ''},
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
    }
  }, {
    type: 'Feature',
    properties: {state: 'IL'},
    geometry: {
      type: 'Polygon',
      coordinates: [[[1, 0], [1, 1], [2, 1], [2, 0], [1, 0]]]
    }
  }]
};

//
//  . --------- .
//  |           |
//  |   . - .   |
//  |   |   |   |
//  |   . - .   |
//  |           |
//  . --------- .
//
var inputB = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {state: 'outer'},
    geometry: {
      type: 'Polygon',
      coordinates: [[[1, 4], [4, 4], [4, 1], [1, 1], [1, 4]], [[2, 3], [3, 3], [3, 2], [2, 2], [2, 3]]]
    }
  }, {
    type: 'Feature',
    properties: {state: 'inner'},
    geometry: {
      type: 'Polygon',
      coordinates: [[[2, 3], [3, 3], [3, 2], [2, 2], [2, 3]]]
    }
  }]
};

//
// . --------------- .
// |                 |
// |  . --------- .  |
// |  |           |  |
// |  |   . - .   |  |
// |  |   |   |   |  |
// |  |   . - .   |  |
// |  |           |  |
// |  . --------- .  |
// |                 |
// . --------------- .
//
var inputC = JSON.stringify({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {state: 'a', weight: 1, value: 'A', value2: null},
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 5], [5, 5], [5, 0], [0, 0], [0, 5]], [[1, 4], [4, 4], [4, 1], [1, 1], [1, 4]]]
    }
  },{
    type: 'Feature',
    properties: {state: 'b', weight: 0, value: null, value2: null},
    geometry: {
      type: 'Polygon',
      coordinates: [[[1, 4], [4, 4], [4, 1], [1, 1], [1, 4]], [[2, 3], [3, 3], [3, 2], [2, 2], [2, 3]]]
    }
  }, {
    type: 'Feature',
    properties: {state: 'a', weight: 10, value: 'B', value2: 'Z'},
    geometry: {
      type: 'Polygon',
      coordinates: [[[2, 3], [3, 3], [3, 2], [2, 2], [2, 3]]]
    }
  }]
});

// three adjacent boxes
//
//  . --- . --- . --- .
//  |     |     |     |
//  |     |     |     |
//  . --- . --- . --- .
//
var inputD = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {id: 0},
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
    }
  }, {
    type: 'Feature',
    properties: {id: null},
    geometry: {
      type: 'Polygon',
      coordinates: [[[1, 0], [1, 1], [2, 1], [2, 0], [1, 0]]]
    }
  }, {
    type: 'Feature',
    properties: {id: null},
    geometry: {
      type: 'Polygon',
      coordinates: [[[2, 0], [2, 1], [3, 1], [3, 0], [2, 0]]]
    }
  }]
};

describe('mapshaper-data-fill.js', function () {

  it('works for simple case', function(done) {

    api.applyCommands('-i polygons.json -data-fill field=state -o',
      {'polygons.json': inputA}, function(err, output) {
        var features = JSON.parse(output['polygons.json']).features;
        assert.equal(features[0].properties.state, 'IL');
        assert.equal(features[1].properties.state, 'IL');
        done();
      });

  })


  it('contiguous option does not remove ordinary islands', function(done) {

    api.applyCommands('-i polygons.json -data-fill field=state contiguous -o',
      {'polygons.json': inputB}, function(err, output) {
        var features = JSON.parse(output['polygons.json']).features;
        assert.equal(features[0].properties.state, 'outer');
        assert.equal(features[1].properties.state, 'inner');
        done();
      });
  });

  it('null-value shapes take their value from the neighbor with the longest shared border', function(done) {

    api.applyCommands('-i polygons.json -data-fill field=value -o',
      {'polygons.json': inputC}, function(err, output) {
        var features = JSON.parse(output['polygons.json']).features;
        assert.equal(features[0].properties.value, 'A');
        assert.equal(features[1].properties.value, 'A');
        assert.equal(features[2].properties.value, 'B');
       done();
      });
  });

  it('empty shapes can receive values at a distance', function(done) {

    api.applyCommands('-i polygons.json -data-fill field=value2 -o',
      {'polygons.json': inputC}, function(err, output) {
        var features = JSON.parse(output['polygons.json']).features;
        assert.equal(features[0].properties.value2, 'Z');
        assert.equal(features[1].properties.value2, 'Z');
        assert.equal(features[2].properties.value2, 'Z');
       done();
      });
  });


  it('contiguous option removes small-area islands', function(done) {

    api.applyCommands('-i polygons.json -data-fill field=state contiguous -o',
      {'polygons.json': inputC}, function(err, output) {
        var features = JSON.parse(output['polygons.json']).features;
        assert.equal(features[0].properties.state, 'a');
        assert.equal(features[1].properties.state, 'b');
        assert.equal(features[2].properties.state, 'b');
       done();
      });
  });

  // weight field values are used instead of polygon area
  it('contiguous works with weight-field= option', function(done) {
    api.applyCommands('-i polygons.json -data-fill field=state contiguous weight-field=weight -o',
      {'polygons.json': inputC}, function(err, output) {
        var features = JSON.parse(output['polygons.json']).features;
        assert.equal(features[0].properties.state, 'b');
        assert.equal(features[1].properties.state, 'b');
        assert.equal(features[2].properties.state, 'a');
       done();
      });
  });


  it('works for numerical values, including 0', function(done) {

    api.applyCommands('-i polygons.json -data-fill field=id -o',
      {'polygons.json': inputD}, function(err, output) {
        var features = JSON.parse(output['polygons.json']).features;
        assert.equal(features[0].properties.id, 0);
        assert.equal(features[1].properties.id, 0);
        assert.equal(features[2].properties.id, 0);
        done();
      });

  })
})
