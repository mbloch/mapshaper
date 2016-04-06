var api = require('../'),
    SVG = api.internal.svg,
    assert = require('assert');

describe('geojson-to-svg.js', function () {

  describe('importGeoJSONFeatures()', function() {
    it('single point geometry', function() {
      var geo = {
        type: "MultiPoint",
        coordinates: [[0, -1], [1, -2]]
      };
      var target = [{
        tag: 'g',
        children: [{
          tag: 'circle',
          properties: {cx: 0, cy: 1}
        }, {
          tag: 'circle',
          properties: {cx: 1, cy: 2}
        }]
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures([geo], {r: 2}), target);
    })

    it('single point feature', function() {
      var geo = {
        type: "Feature",
        properties: {r: 2, opacity: 0.5, 'class': "dot pinkdot"},
        geometry: {
          type: "MultiPoint",
          coordinates: [[0, -1], [1, -2]]
        }
      };
      var target = [{
        tag: 'g',
        properties: {opacity: "0.5"},
        children: [{
          tag: 'circle',
          properties: {cx: 0, cy: 1, r: 2, 'class': "dot pinkdot"} // class attached to glyph, not container
        }, {
          tag: 'circle',
          properties: {cx: 1, cy: 2, r: 2, 'class': "dot pinkdot"}
        }]
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures([geo], {r: 2}), target);
    })

    it('feature collection with ids', function() {
      var geo = {
        type: "FeatureCollection",
        features: [{
          type: 'Feature',
          id: 'a',
          properties: {
            r: 4,
            stroke: 'black',
            stroke_width: 2
          },
          geometry: {
            type: 'MultiPoint',
            coordinates: [[0, 0], [1, 1]]
          }
        }, {
          type: 'Feature',
          id: 'b',
          properties: {
            stroke: 'steelblue',
            stroke_width: 1
          },
          geometry: {
            type: 'LineString',
            coordinates: [[1, -2], [0, -2]]
          }
        }]
      };
      var target = [{
        tag: 'g',
        children: [{
          tag: 'circle',
          properties: {cx: 0, cy: 0, r: 4}
        }, {
          tag: 'circle',
          properties: {cx: 1, cy: -1, r: 4}
        }],
        properties: {id: 'a', stroke: 'black', 'stroke-width': 2}
      }, {
        tag: 'path',
        properties: {d: 'M 1 2 0 2', id: 'b', stroke: 'steelblue', 'stroke-width': 1}
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures(geo.features), target);
    })

    it('filter out styles that do not match LineString type', function() {
      var geo = {
        type: "Feature",
        properties: {fill: '#eee', stroke: 'pink', r: 3},
        geometry: {
          type: "LineString",
          coordinates: [[0, 0], [1, 0]]
        }
      };
      var target = [{
        tag: 'path',
        properties: {d: 'M 0 0 1 0', stroke: 'pink'}
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures([geo]), target);
    })

    it('filter out styles that do not match Polygon type', function() {
      var geo = {
        type: "Feature",
        properties: {fill: '#eee', r: 3},
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]
        }
      };
      var target = [{
        tag: 'path',
        properties: {d: 'M 0 0 1 0 1 -1 0 0 Z', fill: '#eee'}
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures([geo]), target);
    })

  })

  describe('stringify()', function () {
    it('g element, no children', function () {
      var obj = {tag: 'g'};
      assert.equal(SVG.stringify(obj), '<g/>');
    })

    it('path element', function() {
      var obj = {tag: 'path', properties: {d: 'M 0 0 1 1'}};
      assert.equal(SVG.stringify(obj), '<path d="M 0 0 1 1"/>')
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
