import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #193: Error parsing a .prj file with "Gauss_Kruger" projection', function () {
  it ('reproject to WGS84 without error', function(done) {

    var cmd = '-i test/data/issues/193/gauss_kruger.shp -proj wgs84 -o';

    api.applyCommands(cmd, {}, function(err, output) {
      assert(/WGS84/.test(output['gauss_kruger.prj']));
      done();
    });
  });

});
