import api from '../mapshaper.js';
import assert from 'assert';
import { captureLogCallsAsync } from './helpers';

// These tests exercise the warning emitted by writeFiles() when more than
// one -o invocation in a single run resolves to the same output path.
// The warning is meant to catch silent overwrites that previously left users
// puzzling over why "their" output file didn't contain what they expected.
describe('-o output filename collision warning', function() {

  function runAndCapture(cmd, input) {
    return captureLogCallsAsync(function() {
      return api.applyCommands(cmd, input || {});
    }).then(function(captured) {
      return {output: captured.result, log: captured.log};
    });
  }

  function collisionLines(log) {
    return log.filter(function(line) {
      return line.indexOf('was written more than once') !== -1;
    });
  }

  it('warns when two -o commands in one chain target the same explicit filename', function() {
    var cmd = '-i a.json -rename-layers a -o out.json -o out.json';
    return runAndCapture(cmd, {'a.json': [{x: 1}]}).then(function(res) {
      var hits = collisionLines(res.log);
      assert.equal(hits.length, 1);
      assert.match(hits[0], /Output file out\.json was written more than once/);
    });
  });

  it('warns when two -o commands implicitly resolve to the same default filename', function() {
    // Both -o commands derive their filename from the (same) target layer,
    // so they both end up writing to "shared.json" without anyone naming it.
    var cmd = '-i a.json -rename-layers shared -o format=geojson -o format=geojson';
    return runAndCapture(cmd, {'a.json': [{x: 1}]}).then(function(res) {
      var hits = collisionLines(res.log);
      assert.equal(hits.length, 1);
      assert.match(hits[0], /shared\.json was written more than once/);
    });
  });

  it('warns once per overwriting -o (e.g. three writes -> two warnings)', function() {
    var cmd = '-i a.json -rename-layers a -o out.json -o out.json -o out.json';
    return runAndCapture(cmd, {'a.json': [{x: 1}]}).then(function(res) {
      var hits = collisionLines(res.log);
      assert.equal(hits.length, 2);
    });
  });

  it('does not warn when each -o writes a distinct file', function() {
    var cmd = '-i a.json -rename-layers a -o first.json -o second.json';
    return runAndCapture(cmd, {'a.json': [{x: 1}]}).then(function(res) {
      assert.equal(collisionLines(res.log).length, 0);
    });
  });

  it('warns across batches when batch-mode runs the same -o for each input', function() {
    var cmd = '-i a.json b.json batch-mode -o output.json';
    var inputs = {'a.json': [{x: 1}], 'b.json': [{y: 2}]};
    return runAndCapture(cmd, inputs).then(function(res) {
      var hits = collisionLines(res.log);
      // Two inputs -> the second batch's write collides with the first.
      assert.equal(hits.length, 1);
      assert.match(hits[0], /output\.json was written more than once/);
    });
  });

  it('does not warn for the multi-file Shapefile bundle from a single -o', function() {
    // Shapefile output emits .shp, .shx, .dbf, .prj together but they are
    // distinct paths -- not a collision.
    var cmd = '-i a.json -rename-layers shape -o format=shapefile';
    return runAndCapture(cmd, {'a.json': {
      type: 'FeatureCollection',
      features: [{type: 'Feature', properties: {x: 1}, geometry: {
        type: 'Point', coordinates: [0, 0]
      }}]
    }}).then(function(res) {
      assert.equal(collisionLines(res.log).length, 0);
    });
  });

  it('warns for a re-export of the same Shapefile bundle', function() {
    // Two -o calls writing the same .shp/.dbf/.shx/.prj quartet should each
    // trigger the collision warning, so the user sees that *every* part of
    // the bundle is being overwritten -- not just one mystery member.
    var cmd = '-i a.json -rename-layers shape -o format=shapefile -o format=shapefile';
    return runAndCapture(cmd, {'a.json': {
      type: 'FeatureCollection',
      features: [{type: 'Feature', properties: {x: 1}, geometry: {
        type: 'Point', coordinates: [0, 0]
      }}]
    }}).then(function(res) {
      var hits = collisionLines(res.log);
      // shp, shx, dbf, prj
      assert.equal(hits.length, 4);
    });
  });

  it('does not warn for -o dry-run', function() {
    var cmd = '-i a.json -rename-layers a -o dry-run -o dry-run';
    return runAndCapture(cmd, {'a.json': [{x: 1}]}).then(function(res) {
      assert.equal(collisionLines(res.log).length, 0);
    });
  });

  it('respects the per-Job tracking lifetime (a fresh applyCommands run starts clean)', function() {
    var cmd = '-i a.json -rename-layers a -o out.json';
    var inputs = {'a.json': [{x: 1}]};
    return runAndCapture(cmd, inputs).then(function(first) {
      assert.equal(collisionLines(first.log).length, 0);
      return runAndCapture(cmd, inputs);
    }).then(function(second) {
      assert.equal(collisionLines(second.log).length, 0,
        'collision tracking must not leak across separate applyCommands runs');
    });
  });

  it('drops obj.content after writing in CLI mode (memory hygiene)', function() {
    // We can't poke at the internal exports[] array directly, but we *can*
    // verify that the new `obj.content = null` line doesn't break anything
    // when applyCommands is given an output sink (programmatic mode keeps the
    // content alive via opts.output, so the content survives there).
    var cmd = '-i a.json -rename-layers a -o out.json';
    return api.applyCommands(cmd, {'a.json': [{x: 1}]}).then(function(out) {
      assert.ok(out['out.json']);
      var parsed = JSON.parse(out['out.json']);
      assert.deepEqual(parsed, [{x: 1}]);
    });
  });
});
