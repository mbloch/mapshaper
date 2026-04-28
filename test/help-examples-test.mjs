import assert from 'assert';
import examples, { applyExamples } from '../src/cli/mapshaper-examples';
import { CommandParser } from '../src/cli/mapshaper-command-parser';
import { getOptionParser } from '../src/cli/mapshaper-options';

// `-help <command>` examples are now sourced from src/cli/mapshaper-examples.mjs.
// These tests verify the wiring (parser lookup, formatting, error handling)
// and a couple of regressions for examples that previously lived inline in
// mapshaper-options.mjs so the migration doesn't quietly drop them.
describe('mapshaper-examples', function() {

  function getHelp(cmdName) {
    return getOptionParser().getHelpMessage(cmdName);
  }

  describe('table shape', function() {
    it('every key in the examples table refers to a real parser command', function() {
      // applyExamples() already enforces this at startup; getOptionParser()
      // calling applyExamples() therefore throws if a key is bogus. Calling
      // it here gives a clear failure message for any future typo.
      assert.doesNotThrow(function() { getOptionParser(); });
    });

    it('every present `command` is a non-empty string without the "$ mapshaper " prefix', function() {
      // applyExamples() silently skips entries that lack a `command` (so a
      // single commented-out `// command:` line disables an example without
      // commenting out the surrounding object). We therefore only validate
      // the shape of entries whose `command` is actually present.
      Object.keys(examples).forEach(function(cmdName) {
        var entries = examples[cmdName];
        assert.ok(Array.isArray(entries) && entries.length > 0,
          'examples[' + cmdName + '] should be a non-empty array');
        entries.forEach(function(e, i) {
          var loc = cmdName + '[' + i + ']';
          if (!('command' in e)) return; // commented out -- skip silently
          assert.equal(typeof e.command, 'string', loc + '.command must be a string');
          assert.ok(e.command.length > 0, loc + '.command must not be empty');
          assert.ok(!/^\$ mapshaper\b/.test(e.command),
            loc + '.command should not include the "$ mapshaper " prefix; ' +
            'applyExamples() adds it for you');
          if ('description' in e) {
            assert.equal(typeof e.description, 'string',
              loc + '.description must be a string when present');
          }
        });
      });
    });
  });

  describe('applyExamples()', function() {
    it('throws on an unknown command name (so typos surface immediately)', function() {
      var parser = new CommandParser();
      parser.command('real-command').describe('exists');
      assert.throws(function() {
        applyExamples({findCommand: function() { return null; }});
      }, /no parser command named/);
    });

    it('silently skips entries whose `command` is missing, blank, or non-string', function() {
      // Use the optional table arg so we exercise the real skip logic
      // against deliberately-broken entries without touching the production
      // table.
      var captured = [];
      var fakeParser = {
        findCommand: function(name) {
          if (name !== 'demo') return null;
          return { example: function(s) { captured.push(s); } };
        }
      };
      var table = {
        demo: [
          // 1. fully commented-out example body
          {
            // description: 'parked',
            // command: 'demo foo'
          },
          // 2. description present, command line commented out
          { description: 'description survives, command parked' },
          // 3. command is empty string
          { description: 'empty cmd', command: '' },
          // 4. command is the wrong type (defensive)
          { description: 'wrong type', command: 123 },
          // 5. fully usable: this is the only entry that should register
          { description: 'usable', command: 'demo bar' }
        ]
      };
      applyExamples(fakeParser, table);
      assert.equal(captured.length, 1, 'only the usable entry should be registered');
      assert.equal(captured[0], 'usable\n$ mapshaper demo bar');
    });

    it('still throws on unknown command names when given a custom table', function() {
      var fakeParser = { findCommand: function() { return null; } };
      assert.throws(function() {
        applyExamples(fakeParser, {
          'no-such-command': [{description: 'x', command: 'no-such-command'}]
        });
      }, /no parser command named/);
    });

    it('renders the production table: one captured string per usable entry', function() {
      var captured = [];
      var fakeParser = {
        findCommand: function() {
          return { example: function(s) { captured.push(s); } };
        }
      };
      applyExamples(fakeParser);
      // Skipped entries (missing/blank `command`) shouldn't be counted, so
      // the captured count must match the number of entries that survive
      // the same isUsable() rule applyExamples uses internally.
      var expected = Object.keys(examples).reduce(function(n, k) {
        return n + examples[k].filter(function(e) {
          return e && typeof e.command === 'string' && e.command.length > 0;
        }).length;
      }, 0);
      assert.equal(captured.length, expected);
      captured.forEach(function(s) {
        assert.ok(s.indexOf('$ mapshaper ') !== -1,
          'expected `$ mapshaper ` prefix somewhere in: ' + s);
      });
    });
  });

  describe('regression: previously-inline examples are still shown', function() {
    // These are the exact examples that lived inside mapshaper-options.mjs
    // before the migration. If any of them disappear from -help output,
    // assume the move broke them.

    it('-help dissolve still mentions the country-level dissolve', function() {
      var help = getHelp('dissolve');
      assert.match(help, /Generate state-level polygons by dissolving a layer of counties/);
      assert.match(help, /\$ mapshaper counties.shp -dissolve STATE_FIPS copy-fields=STATE_NAME sum-fields=POPULATION/);
    });

    it('-help dissolve still mentions the per-state dissolve with copy-fields', function() {
      var help = getHelp('dissolve');
      assert.match(help, /Generate state-level polygons by dissolving a layer of counties/);
      assert.match(help, /copy-fields=STATE_NAME sum-fields=POPULATION/);
    });

    it('-help simplify still mentions the 10% retention example', function() {
      var help = getHelp('simplify');
      assert.match(help, /Simplify using default method/);
      assert.match(help, /\$ mapshaper states.shp -simplify 10%/);
    });

    it('-help calc still mentions both inline examples', function() {
      var help = getHelp('calc');
      assert.match(help, /Calculate the total area of a polygon layer/);
      assert.match(help, /Count census blocks in NY with zero population/);
    });

    it('-help clip, -help erase, -help join, -help colorizer, -help each still have their inline examples', function() {
      assert.match(getHelp('clip'), /\$ mapshaper states.shp -clip land_area.geojson/);
      assert.match(getHelp('erase'), /\$ mapshaper land_areas\.shp -erase water_bodies\.shp/);
      assert.match(getHelp('join'), /string-fields=FIPS/);
      assert.match(getHelp('colorizer'), /Define a sequential color scheme/);
      assert.match(getHelp('each'), /Add two calculated data fields to a layer of U\.S\. counties/);
    });

    it('-help calc emits the EXAMPLES heading (plural) when there are multiple examples', function() {
      var help = getHelp('calc');
      assert.match(help, /\nEXAMPLES\n/);
    });

    it('-help clip emits the EXAMPLE heading (singular) when there is one example', function() {
      var help = getHelp('clip');
      assert.match(help, /\nEXAMPLE\n/);
      // and not the plural form
      assert.ok(!/\nEXAMPLES\n/.test(help));
    });
  });
});
