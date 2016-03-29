var api = require('../'),
    SVG = api.internal.svg,
    assert = require('assert');

describe('geojson-to-svg.js', function () {

  describe('importGeoJSONFeatures()', function() {
    it('single point feature', function() {
      var geo = {
        type: "MultiPoint",
        coordinates: [[0, -1], [1, -2]]
      };
      var target = [{
        tag: 'g',
        children: [{
          tag: 'circle',
          properties: {cx: 0, cy: 1, r: 2}
        }, {
          tag: 'circle',
          properties: {cx: 1, cy: 2, r: 2}
        }]
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures(geo), target);
    })

    it('feature collection with ids', function() {
      var geo = {
        type: "FeatureCollection",
        features: [{
          type: 'Feature',
          id: 'a',
          geometry: {
            type: 'Point',
            coordinates: [0, 0]
          }
        }, {
          type: 'Feature',
          id: 'b',
          geometry: {
            type: 'LineString',
            coordinates: [[1, -2], [0, -2]]
          }
        }]
      };
      var target = [{
        tag: 'circle',
        properties: {cx: 0, cy: 0, r: 2, id: 'a'}
      }, {
        tag: 'path',
        properties: {d: 'M1 2 L0 2', id: 'b'}
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures(geo, [0, 0, 1, 2]), target);
    })

  })

  describe('stringify()', function () {
    it('g element, no children', function () {
      var obj = {tag: 'g'};
      assert.equal(SVG.stringify(obj), '<g/>');
    })

    it('path element', function() {
      var obj = {tag: 'path', properties: {d: 'M0 0 L1 1'}};
      assert.equal(SVG.stringify(obj), '<path d="M0 0 L1 1"/>')
    })

    it('group inside a group', function() {
      var obj = {
        tag: 'g',
        children: [{
          tag: 'g'
        }]
      }
      assert.equal(SVG.stringify(obj), '<g>\n<g/>\n</g>');
    });

    it('group of two circles', function() {
      var obj = {
        tag: 'g',
        properties: {id: 0},
        children: [{
          tag: 'circle',
          properties: {
            cx: 0,
            cy: 1
          }
        }, {
          tag: 'circle',
          properties: {
            cx: -1,
            cy: 0
          }
        }]
      };
      var target = '<g id="0">\n' +
        '<circle cx="0" cy="1"/>\n' +
        '<circle cx="-1" cy="0"/>\n' +
        '</g>';
      assert.equal(SVG.stringify(obj), target);
    })
  })


})