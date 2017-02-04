var api = require('../'),
    assert = require('assert');

describe('Issue #165: .prj lost after combine-files', function () {
  it ('.prj is preserved after -merge-layers', function(done) {
    var path = 'test/test_data/issues/166/';
    var i = '-i ' + path + 'a_utm.shp ' + path + 'b_utm.shp combine-files';
    var prj = require('fs').readFileSync(path + 'a_utm.prj', 'utf8');
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert.equal(output['out.prj'], prj);
      done();
    });
  });

  it ('.prj is preserved if only first of two input Shapefiles has a .prj', function(done) {
    var path = 'test/test_data/issues/166/';
    var i = '-i ' + path + 'a_utm.shp ' + path + 'c_utm.shp combine-files';
    var prj = require('fs').readFileSync(path + 'a_utm.prj', 'utf8');
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert.equal(output['out.prj'], prj);
      done();
    });
  });

  it ('.prj is preserved if only second of two input Shapefiles has a .prj', function(done) {
    var path = 'test/test_data/issues/166/';
    var i = '-i ' + path + 'c_utm.shp ' + path + 'a_utm.shp combine-files';
    var prj = require('fs').readFileSync(path + 'a_utm.prj', 'utf8');
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert.equal(output['out.prj'], prj);
      done();
    });
  });

  it ('error if projected and unprojected Shapefiles are merged', function(done) {
    var path = 'test/test_data/issues/166/';
    var i = '-i ' + path + 'a_utm.shp ' + path + 'd.shp combine-files';
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert.equal(err.name, 'APIError');
      done();
    });
  });

  // TODO: generate .prj
  it ('.prj is not generated after reprojection', function(done) {
    var path = 'test/test_data/issues/166/a_utm.shp';
    api.applyCommands('-i ' + path + ' -proj wgs84 -o out.shp', {}, function(err, output) {
      assert(!err && !!output);
      assert.equal(output['out.prj'], undefined);
      done();
    });
  });

});
