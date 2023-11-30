import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';

describe('Issue #166: .prj lost after combine-files', function () {
  it ('.prj is preserved after -merge-layers', function(done) {
    var path = 'test/data/issues/166/';
    var i = '-i ' + path + 'a_utm.shp ' + path + 'b_utm.shp combine-files';
    var prj = fs.readFileSync(path + 'a_utm.prj', 'utf8');
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert.equal(output['out.prj'], prj);
      done();
    });
  });

  it ('.prj is preserved if only first of two input Shapefiles has a .prj', function(done) {
    var path = 'test/data/issues/166/';
    var i = '-i ' + path + 'a_utm.shp ' + path + 'c_utm.shp combine-files';
    var prj = fs.readFileSync(path + 'a_utm.prj', 'utf8');
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert.equal(output['out.prj'], prj);
      done();
    });
  });

  it ('.prj is preserved if only second of two input Shapefiles has a .prj', function(done) {
    var path = 'test/data/issues/166/';
    var i = '-i ' + path + 'c_utm.shp ' + path + 'a_utm.shp combine-files';
    var prj = fs.readFileSync(path + 'a_utm.prj', 'utf8');
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert.equal(output['out.prj'], prj);
      done();
    });
  });

  it ('error if projected and unprojected Shapefiles are merged', function(done) {
    var path = 'test/data/issues/166/';
    var i = '-i ' + path + 'a_utm.shp ' + path + 'd_geo.shp combine-files';
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert.equal(err.name, 'UserError');
      done();
    });
  });

  it ('if incompatible projected Shapefiles are merged, .prj of first dataset is used', function(done) {
    var path = 'test/data/issues/166/';
    var i = '-i ' + path + 'a_utm.shp ' + path + 'e_merc.shp combine-files';
    api.applyCommands(i + ' -merge-layers -o out.shp', {}, function(err, output) {
      assert(/NAD_1983_UTM_Zone_18N/.test(output['out.prj']));
      done();
    });
  });

});
