
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

  describe('-proj from= tests', function () {
    it('Assign projection to bare .shp file', function (done) {
      var cmd = '-i test/test_data/two_states_merc_copy.shp -proj from="+proj=merc" +proj=robin -o robin.shp';
      api.applyCommands(cmd, null, function(err, output) {
        assert(/Robinson/.test(output['robin.prj']));
        done();
      })
    })

    it('from= sets CRS if no dest CRS is given', function (done) {
      var cmd = '-i test/test_data/two_states_merc_copy.shp -proj from="+proj=merc" -o merc.shp';
      api.applyCommands(cmd, null, function(err, output) {
        assert(/Mercator/.test(output['merc.prj']));
        done();
      })
    })

    it('Match a .prj file', function (done) {
      var cmd = '-i test/test_data/two_states_merc_copy.shp -proj from="test/test_data/two_states_mercator.prj" +proj=robin -o robin.shp';
      api.applyCommands(cmd, null, function(err, output) {
        assert(/Robinson/.test(output['robin.prj']));
        done();
      })
    })
  })


  describe('-proj match= tests', function () {
    it('match= argument can be a .prj file', function(done) {
      api.applyCommands('-i test/test_data/three_points.shp -proj match=test/test_data/two_states_mercator.prj -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('source= is an alias for match= (TODO: phase this out)', function(done) {
      api.applyCommands('-i test/test_data/three_points.shp -proj source=test/test_data/two_states_mercator.prj -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('match= argument can be a layer name', function(done) {
      api.applyCommands('-i test/test_data/two_states_mercator.shp name=states -i test/test_data/three_points.shp -proj match=states -o',
          {}, function(err, output) {
        assert(/Mercator/.test(output['three_points.prj']));
        done();
      })
    })

    it('output copies .prj string from match= source', function(done) {
      var prj = require('fs').readFileSync('test/test_data/two_states_mercator.prj', 'utf8');
      api.applyCommands('-i test/test_data/two_states_mercator.shp name=states -i test/test_data/three_points.shp -proj match=states -o',
          {}, function(err, output) {
        var prj2 = output['three_points.prj'];
        assert.equal(prj2, prj);
        done();
      })
    })

  })
});
