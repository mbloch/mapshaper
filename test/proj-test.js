
var assert = require('assert');
var api = require("..");

describe('mapshaper-proj.js', function() {
  describe('-proj <alias>', function() {
    it('webmercator alias', function(done) {
      api.applyCommands('-i test/test_data/three_points.shp -proj webmercator -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('robinson alias', function(done) {
      api.applyCommands('-i test/test_data/three_points.shp -proj robinson -o',
          {}, function(err, output) {
        assert(/Robinson/.test(output['three_points.prj']));
        done();
      })
    })
  })


  describe('-proj source= tests', function () {
    it('source can be a .prj file', function(done) {
      api.applyCommands('-i test/test_data/three_points.shp -proj source=test/test_data/two_states_mercator.prj -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('source can be a layer name', function() {
      api.applyCommands('-i test/test_data/two_states_mercator.shp name=states -i test/test_data/three_points.shp -proj source=states -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })
  })
});
