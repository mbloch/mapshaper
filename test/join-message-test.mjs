import api from '../mapshaper.js';
import assert from 'assert';
import { captureLogCallsAsync } from './helpers';

// Tests the consolidated `-join` summary message and warn-vs-message routing
// added when printJoinMessage() was rewritten to be a single, scannable
// log entry. Each test case exercises a different shape of join result.

function joinLines(log) {
  // The summary is a single message() / warn() call but contains embedded
  // newlines for the bullet detail lines; the captureLogCalls helper
  // serialises arguments with spaces, so each captured line corresponds
  // to one log call. We split on newlines to inspect every visible line.
  return log.reduce(function(memo, entry) {
    return memo.concat(entry.split('\n'));
  }, []);
}

function findSummary(log) {
  // The summary headline always starts with "[join] Join:".
  for (var i = 0; i < log.length; i++) {
    if (/^\[join\] Join:/.test(log[i])) return log[i];
  }
  return null;
}

describe('-join summary message', function() {

  it('perfect 1:1 join produces a single-line summary', async function() {
    var a = 'id\n1\n2\n3';
    var b = 'id,score\n1,10\n2,20\n3,30';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=id,id -o', {'a.csv': a, 'b.csv': b});
    });
    var summary = findSummary(capture.log);
    assert(summary, 'found a summary line');
    assert.equal(summary, "[join] Join: 3/3 targets matched, 3/3 sources used");
    // No bullet detail lines for the perfect case.
    var bullets = joinLines(capture.log).filter(function(l) { return /^  /.test(l); });
    assert.equal(bullets.length, 0);
  });

  it('partial join shows percentages and unmatched/unused detail', async function() {
    var a = 'id\n1\n2\n3\n4';
    var b = 'id,score\n1,10\n2,20\n9,90';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=id,id -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var head = lines.find(function(l) { return /^\[join\] Join:/.test(l); });
    assert(head);
    assert(head.includes('2/4 targets matched (50%)'), head);
    assert(head.includes('2/3 sources used (67%)'), head);
    var bullet = lines.find(function(l) { return /unmatched/.test(l); });
    assert(bullet, 'has gap detail');
    assert(bullet.includes('2 targets unmatched'));
    assert(bullet.includes('1 source unused'));
  });

  it('zero matches uses the no-records-joined headline (and is a warning)', async function() {
    var a = 'id\n1\n2\n3';
    var b = 'id,score\n10,10\n20,20';
    // CLI logging doesn't visually distinguish warn() from message(), so
    // here we just confirm the no-match headline shape; the warn-vs-message
    // routing is verified separately below by intercepting setLoggingFunctions.
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=id,id -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var headLine = lines.find(function(l) { return /^\[join\] Join:/.test(l); });
    assert.equal(headLine, '[join] Join: 0/3 targets matched (no records joined)');
    // With both sides full of orphans, samples and the flag hint also appear.
    assert(lines.some(function(l) { return /Sample unmatched target keys/.test(l); }),
      'sample target keys present (both sides have orphans)');
    assert(lines.some(function(l) { return /Sample unused source keys/.test(l); }),
      'sample source keys present');
  });

  it('zero matches and conflicting-value collisions go through warn(), normal joins through message()', async function() {
    var msgs = [];
    var warns = [];
    // Swap in instrumented logging functions for the duration of this test.
    api.internal.setLoggingFunctions(
      function() { msgs.push(Array.prototype.join.call(arguments, ' ')); },
      function() {},
      function(s) { throw new Error(s); },
      function() { warns.push(Array.prototype.join.call(arguments, ' ')); }
    );
    api.enableLogging();
    try {
      // Normal partial join → message()
      await api.applyCommands(
        'a.csv -join b.csv keys=id,id -o',
        {'a.csv': 'id\n1\n2', 'b.csv': 'id,v\n1,10\n9,90'});
      // Zero matches → warn()
      await api.applyCommands(
        'a.csv -join b.csv keys=id,id -o',
        {'a.csv': 'id\n1\n2', 'b.csv': 'id,v\n10,10\n20,20'});
      // Many-to-one with conflicting values → warn()
      await api.applyCommands(
        'a.csv -join b.csv keys=group,group -o',
        {'a.csv': 'group\nA', 'b.csv': 'group,v\nA,1\nA,2'});
    } finally {
      api.internal.setLoggingForCLI();
      api.internal.disableLogging();
    }
    assert.equal(msgs.filter(function(s) { return /Join:/.test(s); }).length, 1,
      'normal join used message(), got: ' + JSON.stringify(msgs));
    assert.equal(warns.filter(function(s) { return /Join:/.test(s); }).length, 2,
      'no-match and conflict joins used warn(), got: ' + JSON.stringify(warns));
  });

  it('many-to-one without conflicts shows multiple-match detail', async function() {
    var a = 'group\nA\nB';
    // Multiple source rows per group, but score values are identical for
    // each group so no conflict is reported.
    var b = 'group,score\nA,1\nA,1\nB,2\nB,2';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=group,group -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var bullet = lines.find(function(l) { return /multiple source matches/.test(l); });
    assert(bullet);
    assert(bullet.includes('2 targets had multiple source matches'));
    assert(!bullet.includes('conflicting'), 'no conflicts when values agree');
  });

  it('many-to-one with conflicting values reports the conflicting fields', async function() {
    var a = 'group\nA';
    var b = 'group,score,name\nA,1,foo\nA,2,bar';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=group,group -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var bullet = lines.find(function(l) { return /conflicting values/.test(l); });
    assert(bullet);
    assert(bullet.includes('conflicting values in [score,name]'));
    assert(bullet.includes('(kept first)'));
  });

  it('where= filtered records are reported', async function() {
    var a = 'id\n1\n2';
    var b = 'id,score\n1,10\n1,20\n2,30';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=id,id where="score > 15" -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var bullet = lines.find(function(l) { return /skipped by where=/.test(l); });
    assert(bullet);
    assert(bullet.includes('1 source skipped by where='));
  });

  it('shows sample keys from both sides when both have orphans', async function() {
    // Trailing whitespace on the target side: keys that look identical until
    // you see them quoted side-by-side.
    var a = 'name\nFoo \nBar \nBaz \nQux ';
    var b = 'name,score\nFoo,1\nBar,2\nBaz,3\nQux,4';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=name,name -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var targetLine = lines.find(function(l) { return /Sample unmatched target keys/.test(l); });
    var sourceLine = lines.find(function(l) { return /Sample unused source keys/.test(l); });
    assert(targetLine, 'has unmatched-target sample line');
    assert(sourceLine, 'has unused-source sample line');
    assert(targetLine.includes('(name):'), 'sample line includes field name');
    // Trailing whitespace must be visible (JSON-quoted).
    assert(targetLine.includes('"Foo "'), 'target sample shows trailing space');
    assert(sourceLine.includes('"Foo"'), 'source sample shows clean key');
    // Hint about the flags appears too (neither flag was passed).
    var hint = lines.find(function(l) { return /unmatched and\/or unjoined flag/.test(l); });
    assert(hint, 'flag hint present when both sides have orphans');
  });

  it('does not show sample keys when only one side has orphans (subset join)', async function() {
    // All source keys match into the target; some targets have no source.
    // This is a normal subset/superset join and should not get sample noise.
    var a = 'id\n1\n2\n3\n4\n5';
    var b = 'id,score\n1,10\n2,20\n3,30';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=id,id -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    assert(!lines.some(function(l) { return /Sample/.test(l); }),
      'no sample lines in subset case');
    // The flag hint specific to the unmatched side still appears.
    var hint = lines.find(function(l) { return /unmatched flag/.test(l); });
    assert(hint, 'flag hint present for the unmatched side');
    assert(!hint.includes('unjoined'), 'hint does not mention the flag we don\'t need');
  });

  it('omits sample keys for geometric joins (no opts.keys)', async function() {
    // Point-to-point spatial join uses proximity, not a key field, so no
    // sample line should appear even when both sides have orphans.
    var a = {
      type: 'FeatureCollection',
      features: [
        {type: 'Feature', properties: {id: 'A'}, geometry: {type: 'Point', coordinates: [0, 0]}},
        {type: 'Feature', properties: {id: 'B'}, geometry: {type: 'Point', coordinates: [100, 100]}}
      ]
    };
    var b = {
      type: 'FeatureCollection',
      features: [
        {type: 'Feature', properties: {score: 1}, geometry: {type: 'Point', coordinates: [0, 0]}},
        {type: 'Feature', properties: {score: 2}, geometry: {type: 'Point', coordinates: [50, 50]}}
      ]
    };
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands(
        '-i a.json -join b.json max-distance=1 -o',
        {'a.json': a, 'b.json': b});
    });
    var lines = joinLines(capture.log);
    assert(!lines.some(function(l) { return /Sample/.test(l); }),
      'no sample lines for geometric join');
  });

  it('flag hint is suppressed once the corresponding flag is set', async function() {
    var a = 'id\n1\n2\n3';
    var b = 'id,score\n1,10';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=id,id unmatched -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    assert(!lines.some(function(l) { return /unmatched flag/.test(l); }),
      'no flag hint when unmatched flag already set');
  });

  it('samples are alphabetically sorted so corresponding values align across sides', async function() {
    // Trailing-whitespace mismatch with intentionally jumbled input order.
    // After sorting, the same alphabetical positions on both sides should
    // hold the visually-corresponding (modulo whitespace) keys.
    var a = 'name\nQux \nFoo \nBar \nBaz \nFred ';
    var b = 'name,score\nWilma,5\nFoo,1\nBar,2\nBaz,3\nQux,4';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=name,name -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var targetLine = lines.find(function(l) { return /Sample unmatched target keys/.test(l); });
    var sourceLine = lines.find(function(l) { return /Sample unused source keys/.test(l); });
    assert(targetLine);
    assert(sourceLine);
    // Pull the post-colon value list out of each line and split by ", ".
    var targetVals = targetLine.split(': ').slice(1).join(': ').split(', ');
    var sourceVals = sourceLine.split(': ').slice(1).join(': ').split(', ');
    assert.deepEqual(targetVals, ['"Bar "', '"Baz "', '"Foo "', '"Fred "', '"Qux "']);
    assert.deepEqual(sourceVals, ['"Bar"', '"Baz"', '"Foo"', '"Qux"', '"Wilma"']);
    // First four positions align: "Bar"/"Baz"/"Foo" obvious-trailing-space
    // pairs are at indices 0/1/2 on both sides.
    for (var i = 0; i < 3; i++) {
      assert.equal(targetVals[i].slice(0, -2), sourceVals[i].slice(0, -1),
        'positions ' + i + ' align modulo trailing whitespace');
    }
  });

  it('with more than 5 unique orphans, samples are the alphabetically-first 5 (not encounter order)', async function() {
    // 8 orphans per side, intentionally jumbled so encounter-order would
    // pick a different 5 than alphabetical-first. The shared base names
    // (Apple/Bee/Cat/Dog) should appear at the same index on both sides
    // regardless of original ordering.
    var a = 'name\nMango \nApple \nZebra \nBee \nDog \nLemon \nCat \nKiwi ';
    var b = 'name,score\nZebra,1\nBee,2\nMango,3\nApple,4\nDog,5\nLemon,6\nCat,7\nKiwi,8';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=name,name -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var targetLine = lines.find(function(l) { return /Sample unmatched target keys/.test(l); });
    var sourceLine = lines.find(function(l) { return /Sample unused source keys/.test(l); });
    assert(targetLine);
    assert(sourceLine);
    var targetVals = targetLine.split(': ').slice(1).join(': ').split(', ');
    var sourceVals = sourceLine.split(': ').slice(1).join(': ').split(', ');
    // Capped at 5 even though 8 unique orphans exist on each side.
    assert.equal(targetVals.length, 5);
    assert.equal(sourceVals.length, 5);
    // The 5 alphabetically-first unique orphans on each side -- not
    // whichever 5 happened to be encountered first.
    assert.deepEqual(targetVals, ['"Apple "', '"Bee "', '"Cat "', '"Dog "', '"Kiwi "']);
    assert.deepEqual(sourceVals, ['"Apple"', '"Bee"', '"Cat"', '"Dog"', '"Kiwi"']);
  });

  it('numeric keys sort numerically, not lexicographically', async function() {
    var a = 'id\n1\n2\n10\n20\n100';
    var b = 'id,score\n3,3\n4,4\n40,40\n400,400\n4000,4000';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=id,id -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var targetLine = lines.find(function(l) { return /Sample unmatched target keys/.test(l); });
    assert(targetLine);
    var vals = targetLine.split(': ').slice(1).join(': ').split(', ');
    // Lexicographic sort would give 1,10,100,2,20 -- our comparator must
    // sort the numbers numerically.
    assert.deepEqual(vals, ['1', '2', '10', '20', '100']);
  });

  it('truncates very long key values in samples', async function() {
    var longKey = 'A'.repeat(80);
    var a = 'name\n' + longKey + '\nshort1';
    var b = 'name,score\n' + 'B'.repeat(80) + ',1\nshort2,2';
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=name,name -o', {'a.csv': a, 'b.csv': b});
    });
    var lines = joinLines(capture.log);
    var targetLine = lines.find(function(l) { return /Sample unmatched target keys/.test(l); });
    assert(targetLine);
    // Truncation marker present.
    assert(targetLine.includes('..."'), 'truncated string still ends with closing quote');
    // No bare 80-char run of As in the output (truncation happened).
    assert(!targetLine.includes('A'.repeat(60)), 'long key was actually shortened');
  });

  it('numbers are formatted with thousands separators', async function() {
    // Build 1500 records on each side with a perfect 1:1 join.
    var aLines = ['id'];
    var bLines = ['id,score'];
    for (var i = 0; i < 1500; i++) {
      aLines.push(String(i));
      bLines.push(i + ',' + i);
    }
    var capture = await captureLogCallsAsync(function() {
      return api.applyCommands('a.csv -join b.csv keys=id,id -o',
        {'a.csv': aLines.join('\n'), 'b.csv': bLines.join('\n')});
    });
    var head = findSummary(capture.log);
    assert(head);
    assert(head.includes("1,500/1,500 targets matched"), head);
    assert(head.includes("1,500/1,500 sources used"), head);
  });

});
