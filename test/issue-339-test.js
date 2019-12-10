var api = require('..'),
    assert = require('assert');

describe('Issue #339 (no .prj output after -proj +proj=stere)', function () {

  it ('.prj is generated', function(done) {
    var cmd = '-i test/data/three_points.shp -proj +proj=stere -o';
    api.applyCommands(cmd, {}, function(err, output) {
      var prj = output['three_points.prj']
      assert(prj.indexOf('Stereographic') > -1);
      done();
    });
  });

});
