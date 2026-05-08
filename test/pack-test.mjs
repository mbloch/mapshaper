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
    var cmd = '-i test/data/geojson/two_states.json -o a.msx -simplify 50% -o b.msx';
    var out = await api.applyCommands(cmd);
    assert(out['a.msx'].length > out['b.msx'].length);

  });

  it('CLI .msx export pins targeted layers and assigns menu_order from -target order', async function() {
    // Three layers in a single dataset, all targeted in the order c,a,b.
    // Layer-array order is preserved (a,b,c, the import order), but
    // menu_order encodes the -target stack: c=1 (bottom), a=2, b=3 (top).
    // All three layers should be pinned visible.
    var cmd = '-i a.json b.json c.json combine-files ' +
              '-o target=c,a,b out.msx';
    var inputs = {
      'a.json': [{name: 'a'}],
      'b.json': [{name: 'b'}],
      'c.json': [{name: 'c'}]
    };
    var out = await api.applyCommands(cmd, inputs);
    var obj = await unpackSessionData(out['out.msx']);
    var layers = obj.datasets[0].layers;
    assert.deepEqual(layers.map(function(l) { return l.name; }), ['a', 'b', 'c']);
    var byName = Object.fromEntries(layers.map(function(l) { return [l.name, l]; }));
    assert.equal(byName.c.menu_order, 1, 'c was targeted first -> bottom of stack');
    assert.equal(byName.a.menu_order, 2);
    assert.equal(byName.b.menu_order, 3, 'b was targeted last -> top of stack');
    layers.forEach(function(lyr) {
      assert.equal(lyr.pinned, true,
        'targeted layer "' + lyr.name + '" should be pinned visible');
    });
  });

  it('CLI .msx export keeps untargeted layers, unpinned, ranked below targeted', async function() {
    // The whole catalog ships in the snapshot, not just the -target subset.
    // Untargeted "extras" come along hidden and parked at the bottom of the
    // GUI stack so they don't get in the way.
    var cmd = '-i a.json b.json c.json combine-files ' +
              '-o target=a,b out.msx';
    var inputs = {
      'a.json': [{name: 'a'}],
      'b.json': [{name: 'b'}],
      'c.json': [{name: 'c'}]
    };
    var out = await api.applyCommands(cmd, inputs);
    var obj = await unpackSessionData(out['out.msx']);
    var layers = obj.datasets[0].layers;
    assert.equal(layers.length, 3, 'all three layers preserved (not just targeted)');
    var byName = Object.fromEntries(layers.map(function(l) { return [l.name, l]; }));
    assert.equal(byName.a.pinned, true, 'targeted -> pinned');
    assert.equal(byName.b.pinned, true, 'targeted -> pinned');
    assert.equal(byName.c.pinned, false, 'untargeted -> hidden');
    // 1 untargeted layer, so targeted layers occupy menu_order 2..3
    // and untargeted gets menu_order 1.
    assert.equal(byName.c.menu_order, 1, 'untargeted layer slots below targeted ones');
    assert.equal(byName.a.menu_order, 2, 'first targeted -> just above untargeted block');
    assert.equal(byName.b.menu_order, 3, 'last targeted -> top');
  });

  it('CLI .msx export preserves untargeted *datasets*, not just untargeted layers', async function() {
    // Multi-dataset case: -target a only -> dataset b should still appear
    // in the snapshot (hidden), with its layer ranked below targeted a.
    var cmd = '-i a.json -i b.json -o target=a out.msx';
    var inputs = {
      'a.json': [{name: 'a'}],
      'b.json': [{name: 'b'}]
    };
    var out = await api.applyCommands(cmd, inputs);
    var obj = await unpackSessionData(out['out.msx']);
    assert.equal(obj.datasets.length, 2, 'both datasets preserved in snapshot');
    var allLayers = obj.datasets.flatMap(function(d) { return d.layers; });
    var byName = Object.fromEntries(allLayers.map(function(l) { return [l.name, l]; }));
    assert.equal(byName.a.pinned, true);
    assert.equal(byName.b.pinned, false);
    assert.equal(byName.b.menu_order, 1, 'untargeted layer at bottom');
    assert.equal(byName.a.menu_order, 2, 'targeted layer above untargeted block');
  });

  it('CLI .msx export menu_order follows -target list when it interleaves datasets', async function() {
    // Regression: snapshot writer groups layers by source dataset, so a
    // -target list like a1,b1,a2,b2 (alternating across two datasets) ends
    // up clumped as [[a1,a2],[b1,b2]]. menu_order must still reflect the
    // *linear* target order so the GUI restacks them as the user asked,
    // not in dataset-grouping order.
    var cmd = '-i a1.json a2.json combine-files ' +
              '-i b1.json b2.json combine-files ' +
              '-o target=a1,b1,a2,b2 out.msx';
    var inputs = {
      'a1.json': [{val: 1}],
      'a2.json': [{val: 2}],
      'b1.json': [{val: 3}],
      'b2.json': [{val: 4}]
    };
    var out = await api.applyCommands(cmd, inputs);
    var obj = await unpackSessionData(out['out.msx']);
    var pairs = obj.datasets.flatMap(function(d) {
      return d.layers.map(function(l) { return [l.name, l.menu_order]; });
    });
    var byName = Object.fromEntries(pairs);
    assert.equal(byName.a1, 1, 'a1 -> menu_order 1 (bottom)');
    assert.equal(byName.b1, 2, 'b1 -> menu_order 2');
    assert.equal(byName.a2, 3, 'a2 -> menu_order 3');
    assert.equal(byName.b2, 4, 'b2 -> menu_order 4 (top)');
  });

  it('CLI .msx export with no explicit target pins every layer (default-target case)', async function() {
    // The common `mapshaper input.shp -o foo.msx` case: no explicit
    // -target, so the default target matches every layer. Result: every
    // layer is pinned visible, behaviour identical to the old "only
    // targeted layers, all visible" UX before the all-layers change.
    var cmd = '-i a.json b.json combine-files -o out.msx';
    var inputs = {
      'a.json': [{name: 'a'}],
      'b.json': [{name: 'b'}]
    };
    var out = await api.applyCommands(cmd, inputs);
    var obj = await unpackSessionData(out['out.msx']);
    var layers = obj.datasets[0].layers;
    assert.equal(layers.length, 2);
    layers.forEach(function(lyr) {
      assert.equal(lyr.pinned, true,
        'default target should pin layer "' + lyr.name + '" visible');
    });
  });

  it('round-trips a Shapefile-sourced wkt1 and reconstitutes info.crs', function(done) {
    // Shapefile imports populate info.wkt1 but not info.crs_string. Snapshot
    // writers don't auto-fill crs_string when wkt1 is present, so the reader
    // has to rebuild info.crs from wkt1 directly to support code that reads
    // info.crs without going through getDatasetCrsInfo() (e.g. the GUI).
    var tmpPath = path.join(os.tmpdir(), 'mapshaper-pack-wkt1-' + process.pid + '-' + Date.now() + '.msx');
    api.applyCommands('-i test/data/shapefile/two_states.shp -o snap.msx', function(err, out) {
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
