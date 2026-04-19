import assert from 'assert';
import { parseConsoleCommands, parseScriptContent } from '../src/cli/mapshaper-parse-commands';
import { stringLooksLikeScript, isPotentialScriptFile } from '../src/io/mapshaper-file-types';


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

  describe('parseScriptContent()', function() {

    it('returns a single command joined string', function() {
      var str = parseScriptContent('-i foo.shp\n-o out.shp');
      assert.equal(str, '-i foo.shp -o out.shp');
    })

    it('strips leading "mapshaper" magic word', function() {
      var str = parseScriptContent('mapshaper\n-i foo.shp\n-o out.shp');
      assert.equal(str, '-i foo.shp -o out.shp');
    })

    it('strips "mapshaper" magic word followed by inline command', function() {
      var str = parseScriptContent('mapshaper -i foo.shp\n-o');
      assert.equal(str, '-i foo.shp -o');
    })

    it('strips full-line "#" comments', function() {
      var str = parseScriptContent([
        '# this is a comment',
        '-i foo.shp',
        '   # indented comment',
        '-o out.shp'
      ].join('\n'));
      assert.equal(str, '-i foo.shp -o out.shp');
    })

    it('strips end-of-line "#" comments', function() {
      var str = parseScriptContent('-i foo.shp # load file\n-o # save it');
      assert.equal(str, '-i foo.shp -o');
    })

    it('preserves "#" inside double-quoted strings', function() {
      var str = parseScriptContent('-each \'d.color = "#fff"\'');
      assert.equal(str, '-each \'d.color = "#fff"\'');
    })

    it('preserves "#" inside single-quoted strings', function() {
      var str = parseScriptContent("-each 'd.tag = \"#a\"'");
      assert.equal(str, "-each 'd.tag = \"#a\"'");
    })

    it('joins continuation lines that do not start with "-"', function() {
      var str = parseScriptContent('-i\n  foo.shp\n  encoding=utf8\n-o');
      assert.equal(str, '-i foo.shp encoding=utf8 -o');
    })

    it('strips trailing backslash line continuation', function() {
      var str = parseScriptContent('-i foo.shp \\\n  encoding=utf8 \\\n-o');
      assert.equal(str, '-i foo.shp encoding=utf8 -o');
    })

    it('preserves embedded newlines inside quoted strings', function() {
      var script = '-each \'\n  d.x = 1\n\'';
      var str = parseScriptContent(script);
      assert.ok(str.includes('\n'));
      assert.ok(str.includes('d.x = 1'));
    })

    it('treats unquoted * as bareword', function() {
      var str = parseScriptContent('-target *');
      assert.equal(str, '-target *');
    })

    it('strips a leading BOM', function() {
      var str = parseScriptContent('\uFEFFmapshaper\n-i foo.shp\n-o');
      assert.equal(str, '-i foo.shp -o');
    })

    it('returns empty string when input is empty', function() {
      assert.equal(parseScriptContent(''), '');
      assert.equal(parseScriptContent('# only comments\n# more\n'), '');
    })

    it('implicit -i for first bare token (mirrors CLI)', function() {
      var str = parseScriptContent('mapshaper sources/foo.json');
      assert.equal(str, '-i sources/foo.json');
    })

    it('implicit -i for first bare token on its own line', function() {
      var str = parseScriptContent('mapshaper\nsources/foo.json\n-target *');
      assert.equal(str, '-i sources/foo.json -target *');
    })

    it('implicit -i without the "mapshaper" magic word', function() {
      // Even without the magic word (e.g. content fed in directly), the
      // first bare line is treated as an implicit -i.
      var str = parseScriptContent('foo.shp\n-o');
      assert.equal(str, '-i foo.shp -o');
    })

    it('multiple bare lines after implicit -i join as continuations', function() {
      var str = parseScriptContent('mapshaper\na.json\nb.json\n-o');
      assert.equal(str, '-i a.json b.json -o');
    })

    it('throws on an unterminated quoted string', function() {
      assert.throws(function() {
        parseScriptContent('-each \'unterminated');
      });
    })

    it('does not treat "mapshaper" as magic word past the first non-blank line', function() {
      var str = parseScriptContent('-i foo.shp\nmapshaper-bare-word');
      // second line is a continuation, "mapshaper" not stripped
      assert.equal(str, '-i foo.shp mapshaper-bare-word');
    })

  })

  describe('stringLooksLikeScript()', function() {
    it('matches files starting with "mapshaper"', function() {
      assert.ok(stringLooksLikeScript('mapshaper\n-i foo.shp'));
      assert.ok(stringLooksLikeScript('mapshaper -i foo.shp -o'));
    })

    it('matches when "mapshaper" is preceded by blank lines and comments', function() {
      assert.ok(stringLooksLikeScript('\n\n# a comment\n  # another\nmapshaper\n-i foo'));
    })

    it('rejects files that do not begin with the magic word', function() {
      assert.ok(!stringLooksLikeScript('foo,bar,baz\n1,2,3\n'));
      assert.ok(!stringLooksLikeScript('-i foo.shp\n'));
      assert.ok(!stringLooksLikeScript('mapshaper-data,1,2\n'));
    })

    it('handles a leading BOM', function() {
      assert.ok(stringLooksLikeScript('\uFEFFmapshaper\n-i foo'));
    })
  })

  describe('isPotentialScriptFile()', function() {
    it('matches .txt files', function() {
      assert.ok(isPotentialScriptFile('commands.txt'));
      assert.ok(isPotentialScriptFile('a/b/commands.TXT'));
    })

    it('does not match other extensions', function() {
      assert.ok(!isPotentialScriptFile('foo.csv'));
      assert.ok(!isPotentialScriptFile('foo.shp'));
      assert.ok(!isPotentialScriptFile('foo.json'));
      assert.ok(!isPotentialScriptFile('foo'));
    })
  })
})
