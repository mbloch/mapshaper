import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #339 (no .prj output after -proj +proj=stere)', function () {

  it ('.prj is generated', async function() {
    var cmd = '-i test/data/three_points.shp -proj +proj=stere -o';
    var output = await api.applyCommands(cmd, {});
    var prj = output['three_points.prj']
    assert(prj.indexOf('Stereographic') > -1);
  });

});
