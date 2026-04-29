import api from '../mapshaper.js';
import assert from 'assert';
import { captureLogCallsAsync } from './helpers';

// `-clip` / `-erase` between layers whose bounding boxes don't overlap is
// almost always an error: empty output for clip, no-op for erase, both
// usually caused by mixing layers in different coordinate systems. These
// tests cover the warning emitted up-front in clipLayers().
describe('-clip / -erase: non-overlapping bounds warning', function() {

  function runAndCapture(cmd, input) {
    return captureLogCallsAsync(function() {
      return api.applyCommands(cmd, input || {});
    }).then(function(captured) {
      return {output: captured.result, log: captured.log};
    });
  }

  function overlapWarnLines(log) {
    return log.filter(function(line) {
      return /does not overlap target/.test(line);
    });
  }

  // Use distinct layer names per test so warnOnce dedup across the suite
  // doesn't suppress legitimate warnings in later tests. (warnOnce keys
  // on full message text, which includes the layer names.)
  var seq = 0;
  function uniq(p) { seq += 1; return p + '_' + seq; }

  function eu(name) {
    // Small polygon in north-western Europe.
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', properties: {name: name},
        geometry: {type: 'Polygon', coordinates: [[
          [0, 40], [10, 40], [10, 50], [0, 50], [0, 40]
        ]]}
      }]
    };
  }

  function us(name) {
    // Small polygon in the central US -- doesn't overlap `eu()` at all.
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', properties: {name: name},
        geometry: {type: 'Polygon', coordinates: [[
          [-100, 30], [-90, 30], [-90, 40], [-100, 40], [-100, 30]
        ]]}
      }]
    };
  }

  function germany(name) {
    // Inside `eu()` -- definitely overlaps.
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', properties: {name: name},
        geometry: {type: 'Polygon', coordinates: [[
          [6, 47], [9, 47], [9, 50], [6, 50], [6, 47]
        ]]}
      }]
    };
  }

  describe('-clip', function() {

    it('warns when target and source layers do not overlap', function() {
      var t = uniq('clip_eu');
      var s = uniq('clip_us');
      var cmd =
        '-i target.json name=' + t + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + t + ' -clip source=' + s + ' -o format=json';
      var input = {'target.json': eu(t), 'source.json': us(s)};
      return runAndCapture(cmd, input).then(function(res) {
        var hits = overlapWarnLines(res.log);
        assert.equal(hits.length, 1);
        // mapshaper's logger prefixes warnings with `[<command>] `; assert
        // both the prefix and the body wording.
        assert.match(hits[0], /^\[clip\] -clip:/);
        assert.match(hits[0], new RegExp('source "' + s + '"'));
        assert.match(hits[0], new RegExp('target "' + t + '"'));
        assert.match(hits[0], /coordinate system mismatch/);
      });
    });

    it('does NOT warn when target and source overlap', function() {
      var t = uniq('clip_eu');
      var s = uniq('clip_de');
      var cmd =
        '-i target.json name=' + t + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + t + ' -clip source=' + s + ' -o format=json';
      var input = {'target.json': eu(t), 'source.json': germany(s)};
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(overlapWarnLines(res.log).length, 0);
      });
    });

    it('warns when -clip bbox= does not overlap target', function() {
      var t = uniq('clip_bbox_off');
      var cmd = '-i target.json name=' + t +
        ' -clip bbox=-100,30,-90,40 -o format=json';
      var input = {'target.json': eu(t)};
      return runAndCapture(cmd, input).then(function(res) {
        var hits = overlapWarnLines(res.log);
        assert.equal(hits.length, 1);
        assert.match(hits[0], /source "bbox"/);
        assert.match(hits[0], new RegExp('target "' + t + '"'));
      });
    });

    it('does NOT warn when -clip bbox= overlaps target', function() {
      var t = uniq('clip_bbox_ok');
      var cmd = '-i target.json name=' + t +
        ' -clip bbox=5,42,15,55 -o format=json';
      var input = {'target.json': eu(t)};
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(overlapWarnLines(res.log).length, 0);
      });
    });

    it('produces an empty output (existing behaviour) when warning fires', function() {
      var t = uniq('clip_empty');
      var s = uniq('clip_offset');
      var cmd =
        '-i target.json name=' + t + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + t + ' -clip source=' + s + ' -o format=json out.json';
      var input = {'target.json': eu(t), 'source.json': us(s)};
      return runAndCapture(cmd, input).then(function(res) {
        var out = JSON.parse(res.output['out.json']);
        // The empty-output is the existing behaviour we're flagging --
        // verify nothing changed about it.
        assert.deepEqual(out, []);
      });
    });

    it('warns once per (target, source) pair across repeated -clip commands', function() {
      // Two -clip commands, same source and target, should produce one
      // (deduped) warning -- not two.
      var t = uniq('clip_dedup_eu');
      var s = uniq('clip_dedup_us');
      var cmd =
        '-i target.json name=' + t + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + t + ' -clip source=' + s + ' ' +
        '-target ' + t + ' -clip source=' + s + ' -o format=json';
      var input = {'target.json': eu(t), 'source.json': us(s)};
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(overlapWarnLines(res.log).length, 1);
      });
    });
  });

  describe('-erase', function() {

    it('warns when target and erase source do not overlap', function() {
      var t = uniq('erase_eu');
      var s = uniq('erase_us');
      var cmd =
        '-i target.json name=' + t + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + t + ' -erase source=' + s + ' -o format=json out.json';
      var input = {'target.json': eu(t), 'source.json': us(s)};
      return runAndCapture(cmd, input).then(function(res) {
        var hits = overlapWarnLines(res.log);
        assert.equal(hits.length, 1);
        assert.match(hits[0], /^\[erase\] -erase:/);
        assert.match(hits[0], /will leave "/);
        assert.match(hits[0], /unchanged/);
        // Output is unchanged: the lone target feature is still there.
        var out = JSON.parse(res.output['out.json']);
        assert.equal(out.length, 1);
        assert.equal(out[0].name, t);
      });
    });

    it('does NOT warn when target and erase source overlap', function() {
      var t = uniq('erase_eu');
      var s = uniq('erase_de');
      var cmd =
        '-i target.json name=' + t + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + t + ' -erase source=' + s + ' -o format=json';
      var input = {'target.json': eu(t), 'source.json': germany(s)};
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(overlapWarnLines(res.log).length, 0);
      });
    });
  });

  describe('edge cases', function() {

    it('does not crash or warn for a target layer with no shapes', function() {
      // Empty target -> existing code returns the (still-empty) layer.
      // The warning should silently no-op rather than emitting "<unnamed>
      // is non-overlapping" noise.
      var t = uniq('empty_target');
      var s = uniq('us_src');
      var cmd =
        '-i target.json name=' + t + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + t + ' -clip source=' + s + ' -o format=json';
      var input = {
        'target.json': {type: 'FeatureCollection', features: []},
        'source.json': us(s)
      };
      return runAndCapture(cmd, input).then(function(res) {
        assert.equal(overlapWarnLines(res.log).length, 0);
      });
    });

    it('warns for point-layer targets too (not just polygons)', function() {
      var t = uniq('pts_eu');
      var s = uniq('pts_clip_us');
      var pointsInEU = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature', properties: {name: t},
          geometry: {type: 'Point', coordinates: [5, 45]}
        }]
      };
      var cmd =
        '-i target.json name=' + t + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + t + ' -clip source=' + s + ' -o format=json';
      var input = {'target.json': pointsInEU, 'source.json': us(s)};
      return runAndCapture(cmd, input).then(function(res) {
        var hits = overlapWarnLines(res.log);
        assert.equal(hits.length, 1);
        assert.match(hits[0], new RegExp('target "' + t + '"'));
      });
    });

    it('warns once per target when multiple targets share a non-overlapping source', function() {
      // Two target layers in the same dataset (combine-files), one source.
      // Both targets get their own warning (different target names ->
      // different message text -> warnOnce keeps both).
      var a = uniq('multi_a');
      var b = uniq('multi_b');
      var s = uniq('multi_src_us');
      var cmd =
        '-i a.json b.json combine-files ' +
        '-rename-layers ' + a + ',' + b + ' ' +
        '-i source.json name=' + s + ' ' +
        '-target ' + a + ',' + b + ' -clip source=' + s + ' -o format=json';
      var input = {
        'a.json': eu(a),
        'b.json': eu(b),
        'source.json': us(s)
      };
      return runAndCapture(cmd, input).then(function(res) {
        var hits = overlapWarnLines(res.log);
        assert.equal(hits.length, 2);
        assert.ok(hits.some(function(h) {
          return new RegExp('target "' + a + '"').test(h);
        }));
        assert.ok(hits.some(function(h) {
          return new RegExp('target "' + b + '"').test(h);
        }));
      });
    });
  });
});
