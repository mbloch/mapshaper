import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';

describe('kml i/o', function () {

  it('kmz -> kml -> .geojson', async function() {
    var file = 'test/data/kml/Albania.kmz';
    var cmd = `-i ${file} -o points.kml`;
    var out = await api.applyCommands(cmd);
    var cmd2 = '-i points.kml -o format=geojson';
    var out2 = await api.applyCommands(cmd2, {'points.kml': out['points.kml']});
    var geojson = JSON.parse(out2['points.json']);
    assert.equal(geojson.features[0].geometry.type, 'Point');
  })

  it('-o format=kml syntax', async function() {
    var file = 'test/data/kml/Albania.kmz';
    var cmd = `-i ${file} -filter-fields -o format=kml`;
    var out = await api.applyCommands(cmd);
    assert(/^<kml/.test(out['Albania.kml']));
  })

});
