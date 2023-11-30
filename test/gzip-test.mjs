import api from '../mapshaper.js';
import assert from 'assert';
import { gunzipSync } from 'zlib';
import * as fs from 'fs';

describe('gzip i/o', function () {

  it('KML roundtrip', async function() {
    var file = 'test/data/three_points.geojson';
    var cmd = `-i ${file} -o points.kml.gz`;
    var out = await api.applyCommands(cmd);
    var cmd2 = `-i input.kml.gz -o points.geojson`;
    var out2 = await api.applyCommands(cmd2, {'input.kml.gz': out['points.kml.gz']});
    var output = JSON.parse(out2['points.geojson']);
    var input = JSON.parse(fs.readFileSync(file));
    assert.deepEqual(input, output);
  })

  it('import gzipped GeoJSON', async function() {
    var file = 'test/data/features/gzip/world_land.json.gz';
    var cmd = `-i ${file} -o`;
    var out = await api.applyCommands(cmd);
    var geojson = JSON.parse(out['world_land.json']);
    assert.equal(geojson.geometries[0].type, 'MultiPolygon');
  })

  it('import gzipped CSV with BOM', async function() {
    var file = 'test/data/features/gzip/utf8_bom.csv.gz';
    var cmd = `-i ${file} -o out.json format=json`;
    var out = await api.applyCommands(cmd);
    var records = JSON.parse(out['out.json']);
    assert.equal(records[0].polling_place_name, "ALAMANCE CIVITAN CLUB HOUSE");
  })

  it('export gzipped file', async function() {
    var input = [{foo: 'bar'}];
    var cmd = '-i data.json -o gzip';
    var out = await api.applyCommands(cmd, {'data.json': input});
    var buf = gunzipSync(out['data.json.gz']);
    var json = JSON.parse(buf);
    assert.deepEqual(json, [{foo: 'bar'}]);
  })

  it('support for inferring output type and gzip from -o file.ext.gz', async function() {
    var input = [{foo: 'bar'}];
    var cmd = '-i data.json -o output.csv.gz';
    var out = await api.applyCommands(cmd, {'data.json': input});
    var buf = gunzipSync(out['output.csv.gz']);
    var str = buf.toString();
    assert.equal(str, 'foo\nbar');
  })


})
