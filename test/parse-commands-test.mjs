import assert from 'assert';
import { parseConsoleCommands, parseCommandFileContent } from '../src/cli/mapshaper-parse-commands';
import { stringLooksLikeCommandFile, isPotentialCommandFile } from '../src/io/mapshaper-file-types';


describe('mapshaper-parse-commands.js', function () {

  describe('parseConsoleCommands()', function () {
    it('should block input commands', function () {
      function bad(cmd) {
        assert.throws(function() {
          parseConsoleCommands(cmd);
        });
      }
      bad("mapshaper foo.shp")
      bad("-i foo");
    })

    it('mapshaper -filter true', function () {
      var commands = parseConsoleCommands('mapshaper -filter true');
      assert.equal(commands[0].name, 'filter');
    })

    it('-each command with escaped quotes', function() {
      var commands = parseConsoleCommands('-each "id = [this.id].join(\\",\\")"');
      var target = [{name: 'each', _:['id = [this.id].join(",")'], options: {expression: 'id = [this.id].join(",")'}}];
      assert.deepEqual(commands, target);
    })

    it('filter true', function () {
      var commands = parseConsoleCommands('filter true');
      assert.equal(commands[0].name, 'filter');
    })

    it('-filter true', function () {
      var commands = parseConsoleCommands('-filter true');
      assert.equal(commands[0].name, 'filter');
    })

    it('info', function () {
      var commands = parseConsoleCommands('info');
      assert.equal(commands[0].name, 'info');
    })

    it('mapshaper \\ -info', function() {
      var commands = parseConsoleCommands('mapshaper \\ -info');
      assert.equal(commands[0].name, 'info');
    })

  })

  describe('parseCommandFileContent()', function() {

    it('returns a single command joined string', function() {
      var str = parseCommandFileContent('-i foo.shp\n-o out.shp');
      assert.equal(str, '-i foo.shp -o out.shp');
    })

    it('strips leading "mapshaper" magic word', function() {
      var str = parseCommandFileContent('mapshaper\n-i foo.shp\n-o out.shp');
      assert.equal(str, '-i foo.shp -o out.shp');
    })

    it('strips "mapshaper" magic word followed by inline command', function() {
      var str = parseCommandFileContent('mapshaper -i foo.shp\n-o');
      assert.equal(str, '-i foo.shp -o');
    })

    it('strips full-line "#" comments', function() {
      var str = parseCommandFileContent([
        '# this is a comment',
        '-i foo.shp',
        '   # indented comment',
        '-o out.shp'
      ].join('\n'));
      assert.equal(str, '-i foo.shp -o out.shp');
    })

    it('strips end-of-line "#" comments', function() {
      var str = parseCommandFileContent('-i foo.shp # load file\n-o # save it');
      assert.equal(str, '-i foo.shp -o');
    })

    it('preserves "#" inside double-quoted strings', function() {
      var str = parseCommandFileContent('-each \'d.color = "#fff"\'');
      assert.equal(str, '-each \'d.color = "#fff"\'');
    })

    it('preserves "#" inside single-quoted strings', function() {
      var str = parseCommandFileContent("-each 'd.tag = \"#a\"'");
      assert.equal(str, "-each 'd.tag = \"#a\"'");
    })

    it('joins continuation lines that do not start with "-"', function() {
      var str = parseCommandFileContent('-i\n  foo.shp\n  encoding=utf8\n-o');
      assert.equal(str, '-i foo.shp encoding=utf8 -o');
    })

    it('strips trailing backslash line continuation', function() {
      var str = parseCommandFileContent('-i foo.shp \\\n  encoding=utf8 \\\n-o');
      assert.equal(str, '-i foo.shp encoding=utf8 -o');
    })

    it('preserves embedded newlines inside quoted strings', function() {
      var content = '-each \'\n  d.x = 1\n\'';
      var str = parseCommandFileContent(content);
      assert.ok(str.includes('\n'));
      assert.ok(str.includes('d.x = 1'));
    })

    it('treats unquoted * as bareword', function() {
      var str = parseCommandFileContent('-target *');
      assert.equal(str, '-target *');
    })

    it('strips a leading BOM', function() {
      var str = parseCommandFileContent('\uFEFFmapshaper\n-i foo.shp\n-o');
      assert.equal(str, '-i foo.shp -o');
    })

    it('returns empty string when input is empty', function() {
      assert.equal(parseCommandFileContent(''), '');
      assert.equal(parseCommandFileContent('# only comments\n# more\n'), '');
    })

    it('implicit -i for first bare token (mirrors CLI)', function() {
      var str = parseCommandFileContent('mapshaper sources/foo.json');
      assert.equal(str, '-i sources/foo.json');
    })

    it('implicit -i for first bare token on its own line', function() {
      var str = parseCommandFileContent('mapshaper\nsources/foo.json\n-target *');
      assert.equal(str, '-i sources/foo.json -target *');
    })

    it('implicit -i without the "mapshaper" magic word', function() {
      // Even without the magic word (e.g. content fed in directly), the
      // first bare line is treated as an implicit -i.
      var str = parseCommandFileContent('foo.shp\n-o');
      assert.equal(str, '-i foo.shp -o');
    })

    it('multiple bare lines after implicit -i join as continuations', function() {
      var str = parseCommandFileContent('mapshaper\na.json\nb.json\n-o');
      assert.equal(str, '-i a.json b.json -o');
    })

    it('routes a leading bare .txt token to -run (matches CLI)', function() {
      var str = parseCommandFileContent('mapshaper inner.txt');
      assert.equal(str, '-run inner.txt');
    })

    it('routes a leading bare .txt token on its own line to -run', function() {
      var str = parseCommandFileContent('mapshaper\ninner.txt\n-o out.csv');
      assert.equal(str, '-run inner.txt -o out.csv');
    })

    it('throws on an unterminated quoted string', function() {
      assert.throws(function() {
        parseCommandFileContent('-each \'unterminated');
      });
    })

    it('does not treat "mapshaper" as magic word past the first non-blank line', function() {
      var str = parseCommandFileContent('-i foo.shp\nmapshaper-bare-word');
      // second line is a continuation, "mapshaper" not stripped
      assert.equal(str, '-i foo.shp mapshaper-bare-word');
    })

    describe('variable interpolation (late-binding)', function() {

      // Interpolation is now performed at execution time, against job.defs,
      // by the run loop in mapshaper-run-commands.mjs. The command-file
      // parser is just a tokenizer: it leaves {{...}} placeholders and
      // -vars commands intact for the executor to handle.

      it('preserves {{VAR}} placeholders verbatim', function() {
        var str = parseCommandFileContent('-i {{INPUT}} -o {{OUTPUT}}');
        assert.equal(str, '-i {{INPUT}} -o {{OUTPUT}}');
      })

      it('preserves -vars commands as ordinary commands', function() {
        var str = parseCommandFileContent('-vars YEAR=2024\n-i counties_{{YEAR}}.shp');
        assert.equal(str, '-vars YEAR=2024 -i counties_{{YEAR}}.shp');
      })

      it('preserves -defaults commands as ordinary commands', function() {
        var str = parseCommandFileContent('-defaults YEAR=2024\n-i counties_{{YEAR}}.shp');
        assert.equal(str, '-defaults YEAR=2024 -i counties_{{YEAR}}.shp');
      })

      it('does not throw on undefined placeholders at parse time', function() {
        // resolution happens at execution time
        assert.doesNotThrow(function() {
          parseCommandFileContent('-i {{MISSING}}.shp');
        });
      })

      it('preserves env.VAR placeholders', function() {
        var str = parseCommandFileContent('-i {{env.HOME}}/foo.shp');
        assert.equal(str, '-i {{env.HOME}}/foo.shp');
      })

    })

  })

  describe('stringLooksLikeCommandFile()', function() {
    it('matches files starting with "mapshaper"', function() {
      assert.ok(stringLooksLikeCommandFile('mapshaper\n-i foo.shp'));
      assert.ok(stringLooksLikeCommandFile('mapshaper -i foo.shp -o'));
    })

    it('matches when "mapshaper" is preceded by blank lines and comments', function() {
      assert.ok(stringLooksLikeCommandFile('\n\n# a comment\n  # another\nmapshaper\n-i foo'));
    })

    it('rejects files that do not begin with the magic word', function() {
      assert.ok(!stringLooksLikeCommandFile('foo,bar,baz\n1,2,3\n'));
      assert.ok(!stringLooksLikeCommandFile('-i foo.shp\n'));
      assert.ok(!stringLooksLikeCommandFile('mapshaper-data,1,2\n'));
    })

    it('handles a leading BOM', function() {
      assert.ok(stringLooksLikeCommandFile('\uFEFFmapshaper\n-i foo'));
    })
  })

  describe('isPotentialCommandFile()', function() {
    it('matches .txt files', function() {
      assert.ok(isPotentialCommandFile('commands.txt'));
      assert.ok(isPotentialCommandFile('a/b/commands.TXT'));
    })

    it('does not match other extensions', function() {
      assert.ok(!isPotentialCommandFile('foo.csv'));
      assert.ok(!isPotentialCommandFile('foo.shp'));
      assert.ok(!isPotentialCommandFile('foo.json'));
      assert.ok(!isPotentialCommandFile('foo'));
    })
  })
})
