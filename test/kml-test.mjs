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

  it('-o foo.kmz produces zipped KML and round-trips', async function() {
    var file = 'test/data/kml/Albania.kmz';
    var cmd = `-i ${file} -o out.kmz`;
    var out = await api.applyCommands(cmd);
    var content = out['out.kmz'];
    // Output should be binary (Buffer or Uint8Array), not a KML string
    assert(content instanceof Uint8Array || Buffer.isBuffer(content),
      'KMZ output should be binary');
    // ZIP local file header magic: 0x50 0x4B 0x03 0x04 ("PK\x03\x04")
    assert.equal(content[0], 0x50);
    assert.equal(content[1], 0x4B);
    assert.equal(content[2], 0x03);
    assert.equal(content[3], 0x04);
    // Re-import the generated KMZ to confirm it's a valid round-trip
    var cmd2 = '-i out.kmz -o format=geojson';
    var out2 = await api.applyCommands(cmd2, {'out.kmz': content});
    var geojson = JSON.parse(out2['out.json']);
    assert.equal(geojson.features[0].geometry.type, 'Point');
  })

});
