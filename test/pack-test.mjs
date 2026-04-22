import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { unpackSessionData } from '../src/pack/mapshaper-unpack';

describe('mapshaper-pack.mjs', function () {
  it('simple round trip', async function () {
    var data = [{foo: 'bar'}];
    var out = await api.applyCommands('-i data.json -o out.msx', {'data.json': data});
    var obj = await unpackSessionData(out['out.msx']);
    var timestamp = Date.parse(obj.created); // NaN if not a parsable ISO date
    assert(timestamp > 0);
    assert.equal(obj.version, 1);
    assert.deepEqual(obj.datasets[0].layers[0].data.getRecords(), [{foo: 'bar'}]);
  });

  it('read from a .msx snapshot file', async function() {
    var cmd = '-i test/data/msx/mapshaper_snapshot.msx -o format=geojson';
    var out = await api.applyCommands(cmd);
    var rectangle = JSON.parse(out['rectangle.json']);
    var points = JSON.parse(out['points.json']);
    var polygons = JSON.parse(out['polygons.json']);
    assert.equal(rectangle.geometries.length, 1);
    assert.equal(points.features.length, 6);
    assert.equal(polygons.features.length, 6);
  })

  it('read from a .msx snapshot file with compressed arcs', async function() {
    var cmd = '-i test/data/msx/mapshaper_snapshot.msx -o format=geojson';
    var out = await api.applyCommands(cmd);
    var cmd2 = '-i test/data/msx/mapshaper_snapshot_2.msx -o format=geojson';
    var out2 = await api.applyCommands(cmd);
    assert.deepEqual(JSON.parse(out['rectangle.json']), JSON.parse(out2['rectangle.json']))
    assert.deepEqual(JSON.parse(out['points.json']), JSON.parse(out2['points.json']))
    assert.deepEqual(JSON.parse(out['polygons.json']), JSON.parse(out2['polygons.json']))
  })

  it('read from a zipped .msx snapshot file', async function() {
    var cmd = '-i test/data/msx/mapshaper_snapshot.msx.zip -o format=geojson';
    var out = await api.applyCommands(cmd);
    var json = JSON.parse(out['rectangle.json']);
    assert.equal(json.geometries.length, 1);
  })

  it('simplification data is removed on export', async function() {
    var cmd = '-i test/data/two_states.json -o a.msx -simplify 50% -o b.msx';
    var out = await api.applyCommands(cmd);
    assert(out['a.msx'].length > out['b.msx'].length);

  });

  it('round-trips a Shapefile-sourced wkt1 and reconstitutes info.crs', function(done) {
    // Shapefile imports populate info.wkt1 but not info.crs_string. Snapshot
    // writers don't auto-fill crs_string when wkt1 is present, so the reader
    // has to rebuild info.crs from wkt1 directly to support code that reads
    // info.crs without going through getDatasetCrsInfo() (e.g. the GUI).
    var tmpPath = path.join(os.tmpdir(), 'mapshaper-pack-wkt1-' + process.pid + '-' + Date.now() + '.msx');
    api.applyCommands('-i test/data/two_states.shp -o snap.msx', function(err, out) {
      if (err) return done(err);
      try {
        fs.writeFileSync(tmpPath, Buffer.from(out['snap.msx']));
      } catch (e) { return done(e); }
      api.internal.testCommands('-i ' + tmpPath, function(err2, dataset) {
        try {
          if (err2) throw err2;
          var info = dataset.info;
          assert(info.wkt1 && /WGS_1984/.test(info.wkt1), 'wkt1 should be preserved');
          assert(!info.crs_string, 'crs_string was not set by the original Shapefile import and should not appear after round-trip');
          assert(info.crs, 'info.crs should be reconstituted from wkt1');
        } catch (e) {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          return done(e);
        }
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        done();
      });
    });
  });
})
