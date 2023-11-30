import api from '../mapshaper.js';
import assert from 'assert';
var SVG = api.internal.svg;


describe('geojson-to-svg.js', function () {

  describe('importGeoJSONFeatures()', function() {
    it('invalid multi-part become empty <g> tags', function() {
      var input = [{
        type: 'MultiPolygon',
        coordinates: []
      }, {
        type: 'MultiPoint',
        coordinates: []
      }];
      var output = [{tag: 'g'}, {tag: 'g'}];
      assert.deepEqual(SVG.importGeoJSONFeatures(input), output);
    })

   it('multipoint with no size -> empty', function() {
      var geo = {
        type: "MultiPoint",
        coordinates: [[0, 1], [1, 2]]
      };
      var target = [{tag: 'g'}]; // empty element (missing r property)
      var output = SVG.importGeoJSONFeatures([geo]);
      assert.deepEqual(output, target);
    })


   it('multipoint with size -> circles', function() {
      var feat = {
        type: 'Feature',
        properties: {
          fill: 'magenta',
          r: 3
        },
        geometry: {
          type: "MultiPoint",
          coordinates: [[0, 1], [1, 2]],
        }
      };
      var target = [{tag: 'g',
        properties: {
          fill: 'magenta'
        },
        children: [{
          tag: 'circle',
          properties: {
            cx: 0,
            cy: 1,
            r: 3
          }
        }, {
          tag: 'circle',
          properties: {
            cx: 1,
            cy: 2,
            r: 3
          }
        }]
      }]; // empty element (missing r property)
      var output = SVG.importGeoJSONFeatures([feat]);
      assert.deepEqual(output, target);
    })

    it('single point feature with circle', function() {
      var geo = {
        type: "Feature",
        properties: {r: 2, opacity: 0.5, 'class': "dot pinkdot"},
        geometry: {
          type: "MultiPoint",
          coordinates: [[0, 1], [1, 2]]
        }
      };
      var target = [{
        tag: 'g',
        properties: {opacity: "0.5", 'class': "dot pinkdot"}, // class attached container, not glyph
        children: [{
          tag: 'circle',
          properties: {cx: 0, cy: 1, r: 2}
        }, {
          tag: 'circle',
          properties: {cx: 1, cy: 2, r: 2}
        }]
      }];
      var output = SVG.importGeoJSONFeatures([geo]);
      assert.deepEqual(output, target);
    })

    it('feature with null geometry', function() {
      var geo = {
        type: 'Feature',
        properties: {r: 2},
        geometry: null
      };
      var expected = [{
        tag: 'g',
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures([geo], {point_symbol: 'square'}), expected)
    })

    // square symbols no longer supported
    false && it('point feature with square symbol', function() {
      var geo = {
        type: 'Feature',
        properties: {r: 2},
        geometry: {type: 'Point', coordinates: [5, 5]}
      };
      var expected = [{
        tag: 'rect',
        properties: {x: 3, y: 3, width: 4, height: 4}
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures([geo], {point_symbol: 'square'}), expected)
    });

    it('point feature with circle and label', function() {
      var geo = {
        type: 'Feature',
        properties: {r: 2, 'label-text': 'foo'},
        geometry: {type: 'Point', coordinates: [5, 5]}
      };
      var expected = [{
        tag: 'g',
        children: [{
          tag: 'circle',
          properties: {cx: 0, cy: 0, r: 2}
        }, {
          tag: 'text',
          value: 'foo',
          // properties: {x: 5, y: 5}
          properties: {x: 0, y: 0}
        }],
        properties: {transform: 'translate(5 5)'}
      }];
      // square symbol no longer supported
      assert.deepEqual(SVG.importGeoJSONFeatures([geo], {point_symbol: 'square'}), expected)
    });


    it('label feature', function() {
      var geo = {
        type: "Feature",
        properties: {'label-text': 'TBD'},
        geometry: {
          type: "MultiPoint",
          coordinates: [[0, 1]]
        }
      };
      var target = [{
        tag: 'g',
        children: [{
          tag: 'text',
          value: 'TBD',
          // properties: {x: 0, y: 1}
          properties: {transform: 'translate(0 1)', x: 0, y: 0}
        }]
      }];
      var output = SVG.importGeoJSONFeatures([geo]);
      assert.deepEqual(output, target);
    })

    it('multiline label', function() {
      var geo = {
        type: "Feature",
        properties: {'label-text': 'New\nYork\nCity', 'line-height': '1.3em'},
        geometry: {
          type: "MultiPoint",
          coordinates: [[0, 1]]
        }
      };
      var target = [{
        tag: 'g',
        children: [{
          tag: 'text',
          value: 'New',
          // properties: {x: 0, y: 1},
          properties: {transform: 'translate(0 1)', x: 0, y: 0},
          children: [{
            tag: 'tspan',
            value: 'York',
            properties: {
              x: 0,
              dy: '1.3em',
            }
          }, {
            tag: 'tspan',
            value: 'City',
            properties: {
              x: 0,
              dy: '1.3em',
            }
          }]
        }]
      }];
      var output = SVG.importGeoJSONFeatures([geo]);
      assert.deepEqual(output, target);
    })


    it('label with dx, dy and font style properties', function() {
      var geo = {
        type: "Feature",
        properties: {
          'foo': 'bar', // should not be in output
          'label-text': 'TBD',
          'font-style': 'italic',
          'font-weight': 'bold',
          'font-family': 'Gill Sans, sans-serif', // TODO: handle quotes
          dx: '10px',
          dy: '-1em',
        },
        geometry: {
          type: "MultiPoint",
          coordinates: [[0, 1]]
        }
      };
      var target = [{
        tag: 'g',
        children: [{
          tag: 'text',
          value: 'TBD',
          // properties: {x: 0, y: 1, dx: '10px', dy: '-1em'}
          properties: {
            transform: 'translate(0 1)', x: '10px', y: '-1em',
            'font-family': 'Gill Sans, sans-serif', 'font-style': 'italic', 'font-weight': 'bold'
          }
        }]
      }];
      var output = SVG.importGeoJSONFeatures([geo]);
      assert.deepEqual(output, target);
    });


    it('label with anchor point and label text', function() {
      var geo = {
        type: "Feature",
        properties: {
          'label-text': 'Milwaukee',
          'text-anchor': 'start',
          dx: 5,
          r: 2
        },
        geometry: {
          type: "Point",
          coordinates: [0, 1]
        }
      };
      var target = [{
        tag: 'g',
        children: [{
          tag: 'circle',
          properties: {cx: 0, cy: 0, r: 2}
        },{
          tag: 'text',
          value: 'Milwaukee',
          // properties: {x: 0, y: 1, dx: 5}
          properties: {'text-anchor': 'start', x: 5, y: 0}
        }],
        properties: {transform: 'translate(0 1)'}
      }];
      var output = SVG.importGeoJSONFeatures([geo]);
      assert.deepEqual(output, target);
    });

    it('feature collection with ids', function() {
      var geo = {
        type: "FeatureCollection",
        features: [{
          type: 'Feature',
          id: 'a',
          properties: {
            r: 4,
            stroke: 'black',
            'stroke-width': 2
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
            'stroke-width': 1
          },
          geometry: {
            type: 'LineString',
            coordinates: [[1, 2], [0, 2]]
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
          properties: {cx: 1, cy: 1, r: 4}
        }],
        properties: {id: 'a', stroke: 'black', 'stroke-width': 2}
      }, {
        tag: 'path',
        properties: {d: 'M 1 2 0 2', id: 'b', stroke: 'steelblue', 'stroke-width': 1}
      }];
      var output = SVG.importGeoJSONFeatures(geo.features);
      assert.deepEqual(output, target);
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
        properties: {d: 'M 0 0 1 0 1 1 0 0 Z', fill: '#eee'}
      }];
      assert.deepEqual(SVG.importGeoJSONFeatures([geo]), target);
    })

  })

  describe('SVG.importPoint()', function () {

    it('svg-symbol with circle', function() {
      var d = {
        'svg-symbol': {
          type: 'circle',
          r: 5,
          fill: 'magenta'
        }
      };
      var obj = SVG.importPoint([1, 2], d)
      var target = {
        tag: 'circle',
        properties: {
          r: 5,
          fill: 'magenta',
          cx: 0,
          cy: 0,
          transform: "translate(1 2)"
        }
      };
      assert.deepEqual(obj, target);
    })

    it('svg-symbol with circle and label', function() {
      var d = {
        'label-text': 'TBD',
        fill: 'purple',
        'svg-symbol': {
          type: 'circle',
          r: 5,
          fill: 'magenta'
        }
      };
      var obj = SVG.importPoint([1, 2], d)
      var target = {
        tag: 'g',
        properties: {transform: "translate(1 2)"},
        children: [
          {
            tag: 'circle',
            properties: {
              r: 5,
              fill: 'magenta',
              cx: 0,
              cy: 0,
            }
          }, {
            tag: 'text',
            value: 'TBD',
            properties: {
              fill: 'purple',
              x: 0,
              y: 0
            }
          }
        ]};
      assert.deepEqual(obj, target);
    })

    it('recognizes several newline markers', function () {
      var str = 'line one\nline two\\nline three<br>line four';
      var obj = SVG.importPoint([1, 2], {'label-text': str})
      var target = {
        tag: 'text',
        value: 'line one',
        // properties: {x: 1, y: 2},
        properties: {transform: 'translate(1 2)', x: 0, y: 0},
        children: [{
          tag: 'tspan',
          value: 'line two',
          properties: {x: 0, dy: '1.1em'}
        }, {
          tag: 'tspan',
          value: 'line three',
          properties: {x: 0, dy: '1.1em'}
        }, {
          tag: 'tspan',
          value: 'line four',
          properties: {x: 0, dy: '1.1em'}
        }]
      }
      assert.deepEqual(obj, target);
    })

    it('(bugfix) converts numeric 0 to string', function () {
      var str = 'line one\nline two\\nline three<br>line four';
      var obj = SVG.importPoint([1, 2], {'label-text': 0})
      var target = {
        tag: 'text',
        value: '0',
        properties: {transform: 'translate(1 2)', x: 0, y: 0}
      }
      assert.deepEqual(obj, target);
    })

  })

})
