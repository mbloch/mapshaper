import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';

describe('zip i/o', function () {
  it('zipped shapefile roundtrip', async function() {
    // .zip -> files -> .zip -> files
    var file = 'test/data/features/zip/points.zip';
    var cmd = `-i ${file} -o`;
    var out = await api.applyCommands(cmd); // unzipped
    var cmd2 = `-i points.shp -o out.zip`;
    // use copy of the data as input (data is deleted from inputs object, for gc)
    var out2 = await api.applyCommands(cmd2, Object.assign({}, out));
    var cmd3 = `-i out.zip -o`;
    var out3 = await api.applyCommands(cmd3, out2); // unzipped
    assert.equal(Buffer.compare(out['points.shp'], out3['points.shp']), 0);
    assert.equal(Buffer.compare(out['points.dbf'], out3['points.dbf']), 0);
    assert.equal(Buffer.compare(out['points.shx'], out3['points.shx']), 0);
    assert(typeof out['points.prj'] == 'string');
    assert.equal(out['points.prj'], out3['points.prj']);
  });

  it('multiple CSV in .zip', async function() {
    var file = 'test/data/text/states.csv';
    var cmd = `-i string-fields=STATE_FIPS,POP10_SQMI ${file} -split STATE_ABBR -o zip`;
    var out = await api.applyCommands(cmd);
    var cmd2 = '-i string-fields=STATE_FIPS,POP10_SQMI output.zip -o';
    var out2 = await api.applyCommands(cmd2, out);
    var target = 'STATE_NAME,STATE_FIPS,SUB_REGION,STATE_ABBR,POP2010,POP10_SQMI\nAlaska,02,Pacific,AK,710231,1.20';
    assert.equal(out2['AK.csv'], target)
  });

  it('GeoJSON roundtrip', async function() {
    var file = 'test/data/three_points.geojson';
    var cmd = `-i ${file} -o data.zip`;
    var out = await api.applyCommands(cmd);
    var cmd2 = '-i data.zip -o data.geojson';
    var out2 = await api.applyCommands(cmd2, out);
    var data = JSON.parse(out2['data.geojson']);
    var target = JSON.parse(fs.readFileSync(file));
    assert.deepEqual(data, target);
  });

  it('Unable to import zip in zip', async function() {
    var file = 'test/data/features/zip/zip-in-zip.zip';
    var cmd = `-i ${file} -o data.zip`;
    try {
      await api.applyCommands(cmd);
    } catch(e) {
      assert.equal(e.name, 'UserError');
    }
  })

});
