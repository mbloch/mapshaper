
import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-buffer.js', function () {

  describe('-buffer command', function () {
    it('converts line to polygon', function (done) {
      var line = {
        type: 'LineString',
        coordinates: [[0, 0], [2, 0]]
      };
      api.applyCommands('-i line.json -buffer 2km -o buffer.json', {'line.json': line}, function(err, output) {
        var json = JSON.parse(output['buffer.json']);
        var poly = json.geometries[0];
        assert.equal(json.geometries.length, 1);
        assert.equal(poly.type, 'Polygon');
        done();
      })
    })
  })

})

