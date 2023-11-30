import api from '../mapshaper.js';
import assert from 'assert';
import helpers from './helpers';

var DataTable = api.internal.DataTable;
var Utils = api.utils;
var fixPath = helpers.fixPath;

describe('mapshaper-geojson.js', function () {

  describe('-o hoist option', function() {

    it('hoist= moves output properties to root of feature', async function() {
      var data = [{
        id: 'a', tippecanoe: { "maxzoom" : 9, "minzoom" : 4 }, foo: 'bar'
      }];
      var cmd = '-i data.json -o a.geojson hoist=id,tippecanoe -o b.geojson';
      var out = await api.applyCommands(cmd, {'data.json': data});
      var a = JSON.parse(out['a.geojson']);
      var b = JSON.parse(out['b.geojson']);
      assert.deepEqual(a, {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          tippecanoe: {maxzoom: 9, minzoom: 4},
          id: 'a',
          properties: {foo: 'bar'},
          geometry: null
        }]
      })
      // hoisting doesn't affect subsequent exports
      assert.deepEqual(b, {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {foo: 'bar', tippecanoe: {maxzoom: 9, minzoom: 4}, id: 'a'},
          geometry: null
        }]
      })
    });
  });

  describe('ndjson input', function () {
    console.log('TODO: support reading ndjson')
    false && it('reads features from an ndjson string', function (done) {
      var a = {
        type: 'Feature',
        properties: {id: 1},
        geometry: null
      };
      var b = {
        type: 'Feature',
        properties: {id: 2},
        geometry: null
      };
      var json = JSON.stringify(a) + '\n' + JSON.stringify(b);
      var buf = Buffer.from(json);
      var cmd = '-i data.json -o';
      api.applyCommands(cmd, {'data.json': buf}, function(err, out) {
        console.log(err, out)
        done();
      });
    })
  })

  describe('-o ndjson option', function () {
    it('outputs ndjson features', function (done) {
      var data = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {id: 1},
          geometry: {
            type: 'Point',
            coordinates: [0, 1]
          }
        }, {
          type: 'Feature',
          properties: {id: 2},
          geometry: null
        }]
      }
      var cmd = '-i data.json -o ndjson';
      api.applyCommands(cmd, {'data.json': data}, function(err, out) {
        var json = out['data.json'].toString();
        var lines = json.split('\n');
        assert.equal(lines.length, 2);
        assert.equal(lines[0][0], '{')
        assert.equal(lines[1][0], '{')
        assert.equal(lines[0].slice(-1), '}')
        assert.equal(lines[1].slice(-1), '}')
        done();
      });
    })
  })

  describe('getDatasetBbox()', function() {

    describe('RFC 7946 bbox', function() {
      function getBbox(geojson) {
        var d = api.internal.importGeoJSON(geojson, {});
        return api.internal.getDatasetBbox(d, true);
      }

      it('wrapped bbox 1', function() {
        var input = {
          type: 'MultiPoint',
          coordinates: [[-170, 0], [170, 0]]
        }
        assert.deepEqual(getBbox(input), [170, 0, -170, 0]);
      })

      it('wrapped bbox2', function() {
        var input = {
          type: 'MultiPoint',
          coordinates: [[-180, 0], [180, 1], [10, -1]]
        }
        assert.deepEqual(getBbox(input), [10, -1, -180, 1]);
      })

      it('wrapped bbox 3 (lines)', function() {
        var input = {
          type: 'MultiLineString',
          coordinates: [[[-180, 0], [-170, 1]], [[170, -1], [175, -2]]]
        }
        assert.deepEqual(getBbox(input), [170, -2, -170, 1]);
      })

      it('non-wrapped points: Western Hemisphere', function() {
        var input = {
          type: 'MultiPoint',
          coordinates: [[-170, 0], [-180, 1], [-90, -1]]
        }
        assert.deepEqual(getBbox(input), [-180, -1, -90, 1]);
      })

      it('non-wrapped points: Eastern Hemisphere', function() {
        var input = {
          type: 'MultiPoint',
          coordinates: [[170, 0], [180, 1], [90, -1]]
        }
        assert.deepEqual(getBbox(input), [90, -1, 180, 1]);
      })

      it('non-wrapped points 3', function() {
        var input = {
          type: 'MultiPoint',
          coordinates: [[100, 0], [0, 1], [-100, -1]]
        }
        assert.deepEqual(getBbox(input), [-100, -1, 100, 1]);
      })

      it('null bbox', function() {
        var input = {
          type: 'GeometryCollection',
          geometries: []
        }
        assert.strictEqual(getBbox(input), null);
      })

    });

  });


  describe('importGeoJSON', function () {
    it('Import FeatureCollection with polygon geometries', function () {
      var data = api.internal.importFile(fixPath('data/two_states.json'))
      assert.equal(data.layers[0].shapes.length, 2);
      assert.equal(data.layers[0].data.size(), 2);
    })

    it('Import FeatureCollection with three null geometries', function () {
      var data = api.internal.importFile(fixPath('data/six_counties_three_null.json'), 'geojson');
      assert.equal(data.layers[0].data.size(), 6);
      assert.equal(data.layers[0].shapes.length, 6);
      assert.equal(data.layers[0].shapes.filter(function(shape) {return shape != null}).length, 3)
      assert.deepEqual(Utils.pluck(data.layers[0].data.getRecords(), 'NAME'), ["District of Columbia", "Arlington", "Fairfax County", "Alexandria", "Fairfax City", "Manassas"]);
    })

    it('Able to import GeometryCollection containing null geometry (non-standard)', function() {
      var geojson = {
        type: 'GeometryCollection',
        geometries: [
          null,
          {type: 'Point', coordinates: [1, 1]}
        ]
      };
      var dataset = api.internal.importGeoJSON(geojson, {});
      assert.deepEqual(dataset.layers[0].shapes, [null, [[1, 1]]]);

    })

    it('Able to import Feature containing GeometryCollection of same-type objects', function() {
      var json = {
          "type": "Feature",
          "properties": {"name": "A"},
          "geometry": {
            "type": "GeometryCollection",
            "geometries": [{
                "type": "MultiPoint",
                "coordinates": [[0, 1], [2, 3]]
              }, {
                "type": "Point",
                "coordinates": [4, 5]
              }
            ]
          }
        };
      var dataset = api.internal.importGeoJSON(json, {});
      assert.deepEqual(dataset.layers[0].shapes, [[[0, 1], [2, 3], [4, 5]]])
    })



    it('Features with GeometryCollection type geometries are supported', function() {
      var json = {
          "type": "Feature",
          "properties": {"name": "A"},
          "geometry": {
            "type": "GeometryCollection",
            "geometries": [{
                "type": "MultiPoint",
                "coordinates": [[0, 1], [2, 3]]
              }, {
                "type": "LineString",
                "coordinates": [[0, 1], [2, 3], [4, 5]]
              }, {
                "type": "Polygon",
                "coordinates": [[[0, 1], [1, 1], [0, 0], [0, 1]]]
              }
            ]
          }
        };

      var output = api.internal.importGeoJSON(json, {});
      assert.equal(output.layers.length, 3);
      assert.equal(output.layers[0].geometry_type, 'point')
      assert.equal(output.layers[1].geometry_type, 'polyline')
      assert.equal(output.layers[2].geometry_type, 'polygon')
      assert.deepEqual(output.layers[2].data.getRecords(), [{name: 'A'}])
    });


   it('Features with nested GeometryCollection type geometries are supported', function() {
      var json = {
          "type": "Feature",
          "properties": {"name": "A"},
          "geometry": {
            "type": "GeometryCollection",
            "geometries": [{
                "type": "MultiPoint",
                "coordinates": [[0, 1], [2, 3]]
              }, {
              "type": "GeometryCollection",
              "geometries": [{
                "type": "Point",
                    "coordinates": [0, 4]
                  }, {
                    "type": "LineString",
                    "coordinates": [[0, 1], [2, 3], [4, 5]]
                  }
                ]
              }
            ]
          }
        };

      var output = api.internal.importGeoJSON(json, {});
      assert.equal(output.layers.length, 2);
      assert.deepEqual(output.layers[0].shapes, [[[0, 1], [2, 3], [0, 4]]])
    });

    it('Import FeatureCollection with mixed geometry types', function() {
      var json = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: null,
          geometry: {
            type: "MultiPoint",
            coordinates: [[0, 1], [2, 3]]
          }
        }, {
          type: "Feature",
          properties: {name: "A"},
          geometry: {
            type: "LineString",
            coordinates: [[0, 1], [2, 3], [4, 5]]
          }
        }, {
          type: "Feature",
          properties: {name: "B"},
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 1], [1, 1], [0, 0], [0, 1]]]
          }
        }]
      };

      var target = {
        info: {},
        arcs: [[[0, 1], [2, 3], [4, 5]], [[0, 1], [1, 1], [0, 0], [0, 1]]],
        layers: [{
          geometry_type: 'point',
          data: [{}],
          shapes: [[[0, 1], [2, 3]]]
        }, {
          geometry_type: "polyline",
          data: [{name: "A"}],
          shapes: [[[0]]]
        }, {
          geometry_type: "polygon",
          data: [{name: "B"}],
          shapes: [[[1]]]
        }]
      }

      var dataset = api.internal.importGeoJSON(json, {});
      var data = JSON.stringify(dataset)
      assert.deepEqual(JSON.parse(data), target);
    })

    it('Import Feature with id field', function () {
      var obj = {
        type: 'Feature',
        id: 'foo',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [2, 1]
        }
      };
      var dataset = api.internal.importGeoJSON(obj, {id_field: 'name'});
      var records = dataset.layers[0].data.getRecords();
      assert.deepEqual(records, [{name: 'foo'}]);
    })


    it('Import GeometryCollection inside a feature', function() {
      var src = {
        type: 'Feature',
        properties: {id: 0},
        geometry: {
          type: 'GeometryCollection',
          geometries: [{
            type: "Polygon",
            coordinates: [[[3, 1], [1, 1], [2, 3], [3, 1]]]
           }, {
            type: "Polygon",
            coordinates: [[[5, 3], [4, 1], [3, 3], [5, 3]]]
          }]
        }
      }
      // Separate Polygons are convered into a MultiPolygon
      var target = {
        type: 'Feature',
        properties: {id: 0},
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[[[3, 1], [1, 1], [2, 3], [3, 1]]], [[[5, 3], [4, 1], [3, 3], [5, 3]]]]
        }
      };
      var dataset = api.internal.importGeoJSON(src, {});
      var output = api.internal.exportDatasetAsGeoJSON(dataset, {});
      assert.deepEqual(output.features[0], target);
    })
  })


  describe('exportGeoJSON()', function () {

    describe('-o geojson-type= option', function() {

      it('geojson-type=Feature, no attributes', function() {
        var input = {type: 'Point', coordinates: [0, 0]};
        var output = api.internal.exportGeoJSON(api.internal.importGeoJSON(input, {}), {geojson_type: 'Feature'})[0].content;
        assert.deepEqual(JSON.parse(output), {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'Point',
            coordinates: [0, 0]
          }
        });
      });

      it('geojson-type=FeatureCollection, no attributes', function() {
        var input = {type: 'Point', coordinates: [0, 0]};
        var output = api.internal.exportGeoJSON(api.internal.importGeoJSON(input, {}), {geojson_type: 'FeatureCollection'})[0].content;
        assert.deepEqual(JSON.parse(output), {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: null,
            geometry: {
              type: 'Point',
              coordinates: [0, 0]
            }
          }]
        });
      });

      it('geojson-type=GeometryCollection (data has attributes)', function() {
        var input = {type: 'Feature', properties: {name: 'foo'}, geometry: {type: 'Point', coordinates: [0, 0]}};
        var output = api.internal.exportGeoJSON(api.internal.importGeoJSON(input, {}), {geojson_type: 'GeometryCollection'})[0].content;
        assert.deepEqual(JSON.parse(output), {
          type: 'GeometryCollection',
          geometries: [ {
            type: 'Point',
            coordinates: [0, 0]
          }]
        });
      });

    });

    describe('-o precision= option', function () {


      it('set coordinate precision to 6 decimals', function() {
        var input = {
          type: 'MultiPoint',
          coordinates: [[4.000000000000001, 3.999999999999], [0.123456789,-9.87654321]]
        };
        var output = api.internal.exportGeoJSON(api.internal.importGeoJSON(input, {}), {precision: 0.000001})[0].content.toString();
        var coords = output.match(/"coordinates.*\]\]/)[0];
        assert.equal(coords, '"coordinates":[[4,4],[0.123457,-9.876543]]');
      });

      it('A warning is generated for non-lat-long datasets', function() {
        var input = {
          type: 'Point',
          coordinates: [100, 100]
        },
        dataset = api.internal.importGeoJSON(input, {});
        assert(/RFC 7946 warning/.test(api.internal.getRFC7946Warnings(dataset)));
      })

      it('Use CCW winding order for rings and CW for holes', function (done) {
        var input = {
          type:"GeometryCollection",
          geometries:[{
            type: "Polygon",
            coordinates: [[[100.0, 0.0], [100.0, 10.0], [110.0, 10.0], [110.0, 0.0], [100.0, 0.0]],
              [[101.0, 1.0], [109.0, 1.0], [109.0, 9.0], [101.0, 9.0], [101.0, 1.0]]
            ]
        }]};

        var target = [[[100.0, 0.0], [110.0, 0.0], [110.0, 10.0], [100.0, 10.0], [100.0, 0.0]],
              [[101.0, 1.0],  [101.0, 9.0], [109.0, 9.0], [109.0, 1.0], [101.0, 1.0]]
            ];

        api.applyCommands('-i input.json -o output.json', {'input.json': input}, function(err, output) {
          var json = JSON.parse(output['output.json']);
          assert.deepEqual(json.geometries[0].coordinates, target);
          done();
        });

      })
    })

    describe('-i geometry-type option', function () {
      it('filters geometry types inside nested GeometryCollection', function (done) {
        var geo = {
          type: 'GeometryCollection',
          geometries: [{
            type: 'GeometryCollection',
            geometries: [{
              type: 'Point',
              coordinates: [0, 0]
            }, {
              type: 'LineString',
              coordinates: [[1, 1], [0, 1]]
            }, {
              type: 'Polygon',
              coordinates: [[[5, 5], [5, 6], [6, 6], [5, 5]]]
            }]
          }]
        };
        var expect = {
          type: 'GeometryCollection',
          geometries: [{
            type: 'Point',
            coordinates: [0, 0]
          }]
        }
        api.applyCommands('-i geo.json geometry-type=point -o', {'geo.json': geo}, function(err, output) {
          var geom = JSON.parse(output['geo.json']);
          assert.deepEqual(geom, expect)
          done();
        });
      })
    })

    describe('-o combine-layers option', function () {
      it('combines datasets derived from same input file', function(done) {
        var a = {
          type: 'Feature',
          properties: {foo: 'a'},
          geometry: {
            type: 'LineString',
            coordinates: [[0, 0], [1, 1]]
          }
        };
        api.applyCommands('-i a.json -filter true + name=a2 -o combine-layers', {'a.json': a}, function(err, output) {
          assert.deepEqual(JSON.parse(output['a.json']), {
            type: 'FeatureCollection',
            features: [a, a]
          });
          done();
        });

      });

      it('combines datasets of different types from different sources', function (done) {
        var a = {
          type: 'Feature',
          properties: {foo: 'a'},
          geometry: {
            type: 'LineString',
            coordinates: [[0, 0], [1, 1]]
          }
        };
        var b = {
          type: 'Point',
          coordinates: [2, 2]
        };
        api.applyCommands('-i a.json -i b.json -o combine-layers c.json', {'a.json': a, 'b.json': b}, function(err, output) {
          assert('c.json' in output);
          assert.deepEqual(JSON.parse(output['c.json']), {
            type: 'FeatureCollection',
            features: [a,
              {
                type: 'Feature',
                properties: null,
                geometry: b
              }]
          });
          done();
        });
      })

      it('generated GeometryCollection when none of the layers have attribute data', function(done) {
        var a = {
          type: 'LineString',
          coordinates: [[0, 0], [1, 1]]
        };
        var b = {
          type: 'Polygon',
          coordinates: [[[2, 2], [2, 3], [3, 2], [2, 2]]]
        };
        api.applyCommands('-i a.json b.json combine-files -o gj2008 combine-layers', {'a.json': a, 'b.json': b}, function(err, output) {
          assert.deepEqual(JSON.parse(output['output.json']), {
            type: 'GeometryCollection',
            geometries: [a, b]
          });
          done();
        });
      })

      it('respects -o target= option', function(done) {
        var a = {
          type: 'LineString',
          coordinates: [[0, 0], [1, 1]]
        };
        var b = {
          type: 'Polygon',
          coordinates: [[[2, 2], [2, 3], [3, 2], [2, 2]]]
        };
        api.applyCommands('-i a.json b.json combine-files -o target=a combine-layers', {'a.json': a, 'b.json': b}, function(err, output) {
          assert.deepEqual(JSON.parse(output['a.json']), {
            type: 'GeometryCollection',
            geometries: [a]
          });
          done();
        });

      })

    })

    it('default file extension is .json', function(done) {
      api.applyCommands('-i test/data/two_states.json -o', {}, function(err, output) {
        assert('two_states.json' in output);
        done();
      })

    })

    it('-o extension= overrides default file extension', function(done) {
      api.applyCommands('-i test/data/two_states.json -o extension=geojson', {}, function(err, output) {
        assert('two_states.geojson' in output);
        done();
      })

    })

    it('export FeatureCollection with null geometries if no shapes are present', function() {
      var lyr = {
        data: new DataTable([{foo: 'a'}])
      }
      var dataset = {
        layers: [lyr]
      };
      var target = {type: "FeatureCollection", features: [
        {type: 'Feature', geometry: null, properties: {foo: 'a'}}
      ]};

      assert.deepEqual(api.internal.exportDatasetAsGeoJSON(dataset, {}), target);
    })

    it('collapsed polygon exported as null geometry', function () {
      var arcs = new api.internal.ArcCollection([[[1, 1], [2, 3], [1, 1]]]);
      var lyr = {
            geometry_type: "polygon",
            data: new DataTable([{ID: 1}]),
            shapes: [[[0]]]
          };
      var dataset = {
        arcs: arcs,
        layers: [lyr]
      };

      var target = {"type":"FeatureCollection","features":[
        {type: 'Feature', properties: {ID: 1}, geometry: null}
      ]};

      assert.deepEqual(api.internal.exportDatasetAsGeoJSON(dataset, {}), target);
    })

    it('use cut_table option', function () {
      var arcs = new api.internal.ArcCollection([[[1, 1], [1, 3], [2, 3], [1, 1]]]);
      var lyr = {
            geometry_type: "polygon",
            data: new DataTable([{ID: 1}]),
            shapes: [[[0]]]
          };

      var geojson = {"type":"GeometryCollection","geometries":[
        { type: 'Polygon',
          coordinates: [[[1, 1], [1, 3], [2, 3], [1, 1]]]
          }
        ]};
      var table = [{
        ID: 1
      }];
      var opts = {
        cut_table: true,
        format: 'geojson',
        gj2008: true
      };
      var files = api.internal.exportFileContent({layers:[lyr], arcs:arcs}, opts);
      assert.deepEqual(JSON.parse(files[0].content), geojson);
      assert.deepEqual(JSON.parse(files[1].content), table);
    })

    it('use drop_table and id_field options', function () {
      var arcs = new api.internal.ArcCollection([[[1, 1], [1, 3], [2, 3], [1, 1]]]);
      var lyr = {
            geometry_type: "polygon",
            data: new DataTable([{FID: 1}]),
            shapes: [[[0]]]
          };

      var geojson = {"type":"FeatureCollection", "features":[{
            type: "Feature",
            properties: null,
            id: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [[[1, 1], [1, 3], [2, 3], [1, 1]]]
            }
          }]};

      var opts = {
        drop_table: true,
        id_field: 'FID',
        format: 'geojson',
        gj2008: true
      };
      var files = api.internal.exportFileContent({layers:[lyr], arcs:arcs}, opts);
      assert.deepEqual(JSON.parse(files[0].content), geojson);
    })

    it('export points with bbox', function() {
      var lyr = {
        geometry_type: 'point',
        shapes: [[[0, 1]], [[2, 3], [1, 4]]]
      },
      dataset = {
        layers: [lyr]
      };

      var target = {
        type: "GeometryCollection",
        geometries: [{
          type: "Point",
          coordinates: [0,1]
        }, {
          type: "MultiPoint",
          coordinates: [[2, 3], [1, 4]]
        }],
        bbox: [0, 1, 2, 4]
      };

      var result = api.internal.exportDatasetAsGeoJSON(dataset, {bbox: true});
      assert.deepEqual(result, target);
    })

    it('export polygons with bbox', function() {
      var arcs = new api.internal.ArcCollection(
            [[[1, 1], [1, 3], [2, 3], [1, 1]],
            [[-1, 1], [0, 0], [0, 1], [-1, 1]]]),
          lyr = {
            geometry_type: "polygon",
            shapes: [[[0]], [[~1]]]
          },
          dataset = {
            arcs: arcs,
            layers: [lyr]
          };

      var target = {"type":"GeometryCollection","geometries":[
        { type: 'Polygon',
          coordinates: [[[1, 1], [1, 3], [2, 3], [1, 1]]]
          }, { type: 'Polygon',
          coordinates: [[[-1, 1], [0, 1], [0, 0], [-1, 1]]]
          }
        ]
        , bbox: [-1, 0, 2, 3]
      };
      var result = api.internal.exportDatasetAsGeoJSON(dataset, {bbox: true});
      assert.deepEqual(result, target);
    })

    it('export feature with id property', function() {
      var lyr = {
            geometry_type: "point",
            shapes: [[[1, 1]]],
            data: new DataTable([{FID: 1}])
          },
          dataset = {
            layers: [lyr]
          };

      var target = {"type":"FeatureCollection","features":[{
          type: 'Feature',
          properties: null,
          id: 1,
          geometry: { type: 'Point',
            coordinates: [1, 1]
          }
        }]
      };
      var result = api.internal.exportDatasetAsGeoJSON(dataset, {id_field: 'FID'});
      assert.deepEqual(result, target);
    })

  })

  describe('Import/Export roundtrip tests', function () {

    it('empty GeometryCollection', function () {
      var empty = {"type":"GeometryCollection","geometries":[]};
      assert.deepEqual(empty, importExport(empty));
    })

    it('preserve object data properties', function() {
      var input = {type:"FeatureCollection", features: [{
        type: "Feature",
        properties: {
          foo: {"a": 3},
          bar: [2, 3, 4]
        },
        geometry: null
      }]};
      assert.deepEqual(input, importExport(input));
    })

    it('preserve top-level crs', function(done) {
      var crs = {
        "type": "name",
        "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
      };
      var input = {
        crs: crs,
        type: 'Point',
        coordinates: [0, 0]
      };
      api.applyCommands('-o gj2008', input, function(err, data) {
        var output = JSON.parse(data);
        assert.deepEqual(output.crs, crs);
        done();
      })
    });

    // REMOVING obsolete crs test
    // it('preserve null crs', function(done) {
    //   var input = {
    //     crs: null,
    //     type: 'Point',
    //     coordinates: [0, 0]
    //   };
    //   api.applyCommands('', input, function(err, data) {
    //     var output = JSON.parse(data);
    //     assert.strictEqual(output.crs, null);
    //     done();
    //   })
    // });

    // REMOVING obsolete crs test
    // it('set crs to null if data is projected', function(done) {
    //   var crs = {
    //     "type": "name",
    //     "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
    //   };
    //   var input = {
    //     crs: crs,
    //     type: 'Point',
    //     coordinates: [0, 0]
    //   };
    //   api.applyCommands('-proj +proj=merc', input, function(err, data) {
    //     var output = JSON.parse(data);
    //     assert.strictEqual(output.crs, null);
    //     done();
    //   })
    // });

    it('do not set crs to null if coords were transformed to latlong', function(done) {
      var input = {
        type: 'Point',
        coordinates: [0, 0]
      };
      api.applyCommands('-proj wgs84 from="merc"', input, function(err, data) {
        var output = JSON.parse(data);
        assert.strictEqual(output.crs, undefined);
        done();
      })
    });

    it('preserve ids with no properties', function() {
      var input = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: null,
          id: 'A',
          geometry: {
            type: "Point",
            coordinates: [1, 1]
          }
        }]
      };
      assert.deepEqual(input, importExport(input));
    })

    it('preserve ids with properties', function() {
      var input = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {foo: 'B', bar: 'C'},
          id: 'A',
          geometry: {
            type: "Point",
            coordinates: [1, 1]
          }
        }]
      };
      assert.deepEqual(input, importExport(input));
    })


    it('null geom, one property', function () {
      var geom = {"type":"FeatureCollection", "features":[
        { type: "Feature",
          geometry: null,
          properties: {ID: 0}
        }
      ]};
      assert.deepEqual(geom, importExport(geom));
    })

    it('collapsed polygon converted to null geometry', function() {
      var geom = {"type":"FeatureCollection", "features":[
        { type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[100.0, 0.0], [100.0, 1.0], [100.0, 0.0]]]
          },
          properties: {ID: 0}
        }
      ]};

      var target = {"type":"FeatureCollection", "features":[
        { type: "Feature",
          geometry: null,
          properties: {ID: 0}
        }
      ]};

      assert.deepEqual(target, importExport(geom));
    })

    it('ccw polygon and cw hole are reversed', function() {
      var onePoly = {
        type:"GeometryCollection",
        geometries:[{
          type: "Polygon",
          coordinates: [[[100.0, 0.0], [110.0, 0.0], [110.0, 10.0], [100.0, 10.0], [100.0, 0.0]],
            [[101.0, 1.0], [101.0, 9.0], [109.0, 9.0], [109.0, 1.0], [101.0, 1.0]]]
        }]};
      var output = importExport(onePoly);
      var target = {
        type:"GeometryCollection",
        // bbox: [100, 0, 110, 10],
        geometries:[{
          type: "Polygon",
          coordinates: [[[100.0, 0.0], [100.0, 10.0], [110.0, 10.0], [110.0, 0.0], [100.0, 0.0]],
            [[101.0, 1.0], [109.0, 1.0], [109.0, 9.0], [101.0, 9.0], [101.0, 1.0]]
          ]
        }]};
      assert.deepEqual(target, output);
    })

    it('reversed ring with duplicate points is not removed (#42)', function() {
      var geoStr = api.cli.readFile(fixPath("data/ccw_polygon.json"), 'utf8'),
          outputObj = importExport(geoStr);
      assert.ok(outputObj.features[0].geometry != null);
    })


    it('GeometryCollection with a Point and a MultiPoint', function() {
      var json = {
        type: "GeometryCollection",
        geometries:[{
          type: "Point",
          coordinates: [2, 1]
        }, {
          type: "MultiPoint",
          coordinates: [[1, 0], [1, 0]]
        }]
      };

      assert.deepEqual(importExport(json), json);
    })


    it('FeatureCollection with two points and a null geometry', function() {
      var json = {
        type: "FeatureCollection",
        features:[{
          type: "Feature",
          properties: {id: 'pdx'},
          geometry: {
            type: "Point",
            coordinates: [0, 0]
          }
        }, {
          type: "Feature",
          properties: {id: 'sfo'},
          geometry: {
            type: "Point",
            coordinates: [-1, 1]
          }
        }, {
          type: "Feature",
          properties: {id: ''},
          geometry: null
        }]
      };

      assert.deepEqual(importExport(json), json);
    })

  })

  describe('Export/Import roundtrip tests', function () {

    it('two states', function () {
      geoJSONRoundTrip('data/two_states.json');
    })

    it('six counties, two null geometries', function () {
      geoJSONRoundTrip('data/six_counties_three_null.json');
    })

    it('Internal state borders (polyline)', function () {
      geoJSONRoundTrip('data/ne/ne_110m_admin_1_states_provinces_lines.json');
    })
    /* */
  })
})

function geoJSONRoundTrip(fname) {
  var data = api.internal.importFile(fixPath(fname));
  var files = api.internal.exportFileContent(data, {format:'geojson'});
  var json = files[0].content.toString();
  var data2 = api.internal.importFileContent(json, 'json');
  var files2 = api.internal.exportFileContent(data2, {format:'geojson'});
  var json2 = files2[0].content.toString();
  assert.equal(json, json2);
}

function importExport(obj, noTopo) {
  var json = Utils.isString(obj) ? obj : JSON.stringify(obj);
  var geom = api.internal.importFileContent(json, 'json', {no_topology: noTopo});
  return api.internal.exportDatasetAsGeoJSON(geom, {});
}
