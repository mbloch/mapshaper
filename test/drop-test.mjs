import assert from 'assert';
import api from '../mapshaper.js';

describe('mapshaper-drop.js', function () {

  describe('-drop removes target layer(s)', function () {

    it('removes layers from multiple datasets', function(done) {
      var a = 'a\na',
          b = 'b\nb',
          c = 'c\nc',
          d = 'd\nd',
          cmd = '-i combine-files a.csv b.csv -i c.csv -i d.csv -drop target=b,c -o target=*';
      api.applyCommands(cmd, {'a.csv':a, 'b.csv': b, 'c.csv': c, 'd.csv': d}, function(err, out) {
        assert.deepEqual(out, {'a.csv': 'a\na', 'd.csv': 'd\nd'});
        done();
      });
    });

    it('removes one of two layers', function (done) {
      var a = 'a,b,c,d\n1,2,3,4\n';
      var b = 'e\n5\n';
      api.applyCommands('-i a.csv b.csv combine-files -drop target=a -o', {'a.csv': a, 'b.csv': b}, function(err, output) {
        assert.deepEqual(Object.keys(output), ['b.csv']);
        assert.equal(output['b.csv'], 'e\n5');
        done();
      });
    })

    it('removes implicit target', function (done) {
      var a = 'a,b,c,d\n1,2,3,4\n';
      var b = 'e\n5\n';
      api.applyCommands('-i a.csv -i b.csv -drop -o', {'a.csv': a, 'b.csv': b}, function(err, output) {
        assert.deepEqual(Object.keys(output), ['a.csv']);
        assert.equal(output['a.csv'], 'a,b,c,d\n1,2,3,4');
        done();
      });
    })

    it('removes two of three layers', function (done) {
      var a = {
        type: 'LineString',
        coordinates: [[0, 0], [0, 1]]
      };
      var b = {
        type: 'LineString',
        coordinates: [[1, 0], [1, 1]]
      }
      var c = {
        type: 'LineString',
        coordinates: [[1, 0], [1, 1]]
      }
      api.applyCommands('-i a.json b.json c.json combine-files -drop target=a,c -o', {'a.json': a, 'b.json': b, 'c.json': c}, function(err, output) {
        var json = JSON.parse(output['b.json']);
        assert.deepEqual(Object.keys(output), ['b.json']);
        assert.deepEqual(json.geometries[0], b);
        done();
      });
    })


    it('Error if -o command is run after all layers are dropped', function (done) {
      var a = 'a,b,c,d\n1,2,3,4\n';
      var b = 'e\n5\n';
      api.applyCommands('-i a.csv b.csv combine-files -drop target=* -o', {'a.csv': a, 'b.csv': b}, function(err, output) {
        assert.equal(err.name, 'UserError');
        done();
      });
    })

    it('No error if -rectangle command is run after all layers are dropped', function (done) {
      var a = 'a,b,c,d\n1,2,3,4\n';
      var b = 'e\n5\n';
      api.applyCommands('-i a.csv b.csv combine-files -drop target=* -rectangle bbox=0,0,1,1 -o target=* format=geojson gj2008', {'a.csv': a, 'b.csv': b}, function(err, output) {
        var geo = JSON.parse(output['rectangle.json']);
        assert.deepEqual(Object.keys(output), ['rectangle.json'])
        assert.deepEqual(geo.geometries[0], {
          type: 'Polygon',
          coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
        });
        done();
      });
    })

  })

  describe('-drop geometry removes geometry', function () {
    it('removes geometry from a GeoJSON feature', function (done) {
      var input = {
        type: 'Feature',
        properties: {foo: 'a', bar: 'b'},
        geometry: {
          type: 'Point',
          coordinates: [0,0]
        }
      }
      api.applyCommands('-i in.json -drop geometry -o out.json', {'in.json': input}, function(err, output) {
        var json = JSON.parse(output['out.json']);
        var target = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: null,
            properties: {foo: 'a', bar: 'b'},
          }]
        };
        assert.deepEqual(json, target);
        done();
      });
    })
  })

  describe('-drop fields= removes a list of data fields', function () {

    it('fields=* removes all attributes', function (done) {
      var input = {
        type: 'Feature',
        properties: {foo: 'a', bar: 'b'},
        geometry: {
          type: 'Point',
          coordinates: [0,0]
        }
      }
      api.applyCommands('-i in.json -drop fields=* -o out.json', {'in.json': input}, function(err, output) {
        var json = JSON.parse(output['out.json']);
        var target = {
          type: 'GeometryCollection',
          geometries: [{
            type: 'Point',
            coordinates: [0,0]
          }]
        };
        assert.deepEqual(json, target);
        done();
      });
    })

    it('fields=<list> removes the listed fields', function (done) {
      var input = 'a,b,c,d\n1,2,3,4\n';
      api.applyCommands('-i in.csv -drop fields=b,d -o out.csv', {'in.csv': input}, function(err, output) {
        assert.equal(output['out.csv'], 'a,c\n1,3');
        done();
      });
    })
  })
})
