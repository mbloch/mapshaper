import api from '../mapshaper.js';
import assert from 'assert';

var format = api.utils.format;
var states_shp = "test/data/two_states.shp";

describe('mapshaper-filter-rename-fields.js', function () {

  describe('-filter-fields', function () {

    it("drop all fields", function (done) {
      var cmd = format("-i %s -filter-fields", states_shp);
      api.internal.testCommands(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getFields(), []);
        done();
      })
    })

    it("invert option", async function() {
      var csv = 'a,b,c,d,e\n1,2,3,4,5';
      var cmd = '-i csv.csv -filter-fields invert b,c,e -o';
      var out = await api.applyCommands(cmd, {'csv.csv': csv});
      assert.equal(out['csv.csv'], 'a,d\n1,4');
    })

    it("affects the sequence of CSV output fields", function(done) {
      var csv = 'a,b,c,d,e\n1,2,3,4,5\n6,7,8,9,10';
      var cmd = '-i csv.csv -filter-fields d,c -o';
      api.applyCommands(cmd, {'csv.csv': csv}, function(err, out) {
        assert.equal(out['csv.csv'], 'd,c\n4,3\n9,8');
        done();
      })

    })
  })

  describe('-rename-fields', function () {
    it("test 1: rename two fields", function (done) {
      var cmd = format("-i %s -rename-fields lat=LAT,lng=LONG", states_shp);
      api.internal.testCommands(cmd, function(err, data) {
        if (err) throw err;
        assert.deepEqual(data.layers[0].data.getFields(), ['lat', 'lng', 'STATE_NAME', 'FIPS', 'STATE']);
        done();
      })
    })

  });

});