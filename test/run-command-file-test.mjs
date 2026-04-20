import api from '../mapshaper.js';
import assert from 'assert';

describe('mapshaper-run-command-file.js', function() {

  it('runs a .txt command file supplied via the input cache', async function() {
    var content = [
      'mapshaper',
      '-i data.csv',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': content,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-run commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('bare-token CLI form routes a .txt file to -run', async function() {
    // Mirrors `mapshaper commands.txt` on the shell.
    var content = [
      'mapshaper',
      '-i data.csv',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': content,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('bare-token CLI form routes a .csv file to -i', async function() {
    // Mirrors `mapshaper data.csv -o out.csv` on the shell.
    var input = { 'data.csv': 'a,b\n1,2\n' };
    var out = await api.applyCommands('data.csv -o out.csv', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('-run errors when given a .txt file that is not a mapshaper command file', async function() {
    // .txt with no "mapshaper" magic word -> not recognised as a command file.
    var input = {
      'notes.txt': 'just some text\nnot a command file\n'
    };
    var err;
    try {
      await api.applyCommands('-run notes.txt', input);
    } catch(e) { err = e; }
    assert.ok(err);
    assert.ok(/Not a mapshaper command file/i.test(err.message),
      'helpful error mentions the file is not a command file');
  });

  it('-i no longer treats .txt command files as command files (data only)', async function() {
    // After the -i / -run split, -i parses .txt as DSV regardless of
    // the leading "mapshaper" magic word.
    var input = {
      'commands.txt': 'a\nfoo\nbar\n'
    };
    var out = await api.applyCommands('-i commands.txt -o', input);
    // exported with default name based on input name
    assert.ok(out['commands.csv']);
  });

  it('strips end-of-line "#" comments', async function() {
    var content = [
      'mapshaper # this is a command file',
      '-i data.csv # load some data',
      '-rename-layers points # rename it',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': content,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-run commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('joins lines that do not begin with "-" onto the previous command', async function() {
    var content = [
      'mapshaper',
      '-i',
      '  data.csv',
      '-o',
      '  out.csv'
    ].join('\n');
    var input = {
      'commands.txt': content,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-run commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('accepts shell-style trailing-backslash continuations', async function() {
    var content = [
      'mapshaper \\',
      '-i data.csv \\',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': content,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-run commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('preserves "#" inside quoted strings', async function() {
    var content = [
      'mapshaper',
      '-i data.csv',
      '-each \'d.color = "#fff"\'',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': content,
      'data.csv': 'a\n1\n'
    };
    var out = await api.applyCommands('-run commands.txt', input);
    assert.equal(out['out.csv'], 'a,color\n1,#fff');
  });

  it('supports nested command files via -run', async function() {
    var inner = [
      'mapshaper',
      '-i data.csv',
      '-o out.csv'
    ].join('\n');
    var outer = [
      'mapshaper',
      '-run inner.txt'
    ].join('\n');
    var input = {
      'outer.txt': outer,
      'inner.txt': inner,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-run outer.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('supports nested command files via implicit-bare-token form', async function() {
    // Inside a command file, "mapshaper inner.txt" implies "-run inner.txt"
    // (matching the CLI bare-token routing).
    var inner = [
      'mapshaper',
      '-i data.csv',
      '-o out.csv'
    ].join('\n');
    var outer = [
      'mapshaper inner.txt'
    ].join('\n');
    var input = {
      'outer.txt': outer,
      'inner.txt': inner,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-run outer.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('attributes parse errors to the command file', async function() {
    var content = [
      'mapshaper',
      '-each \'unterminated quote',
      '-o'
    ].join('\n');
    var input = {
      'commands.txt': content
    };
    var err;
    try {
      await api.applyCommands('-run commands.txt', input);
    } catch(e) { err = e; }
    assert.ok(err);
    assert.ok(/commands\.txt/.test(err.message),
      'error message references the command file');
  });

  it('treats a leading bare data-file token in a command file as implicit -i', async function() {
    // Mirrors CLI: "mapshaper foo.csv" implies "-i foo.csv".
    var content = [
      'mapshaper data.csv',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': content,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-run commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('ignores empty command files (only comments)', async function() {
    var content = [
      'mapshaper',
      '# nothing to do here',
      '# really'
    ].join('\n');
    var input = {
      'commands.txt': content
    };
    var out = await api.applyCommands('-run commands.txt', input);
    assert.deepEqual(out, {});
  });

  it('command file can run multiple commands in sequence', async function() {
    var content = [
      'mapshaper',
      '-i data.csv',
      '-filter \'a > 1\'',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': content,
      'data.csv': 'a,b\n1,x\n2,y\n3,z\n'
    };
    var out = await api.applyCommands('-run commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n2,y\n3,z');
  });

  it('-run still accepts a JS template expression (no breaking change)', async function() {
    // Auto-detect: a non-.txt argument is treated as a JS expression, the
    // original -run behavior. Here the expression is a JS function call
    // that returns a command (a -rename-layers, applied inside -run);
    // the outer -o then exports under the new layer name.
    var include = '{ getCmd: function() { return "-rename-layers renamed"; } }';
    var input = { 'data.csv': 'a,b\n1,2\n', 'helpers.js': include };
    var out = await api.applyCommands(
      '-i data.csv -include helpers.js -run getCmd() -o renamed.csv', input);
    assert.equal(out['renamed.csv'], 'a,b\n1,2');
  });

  describe('variable interpolation', function() {

    it('-vars command supplies variables to a command file', async function() {
      var content = 'mapshaper\n-i {{INPUT}}\n-o {{OUTPUT}}';
      var input = {
        'commands.txt': content,
        'data.csv': 'a,b\n1,2\n'
      };
      var out = await api.applyCommands(
        '-vars INPUT=data.csv OUTPUT=out.csv -run commands.txt', input);
      assert.equal(out['out.csv'], 'a,b\n1,2');
    });

    it('-vars JSON file supplies variables', async function() {
      var content = 'mapshaper\n-i {{INPUT}}\n-o {{OUTPUT}}';
      var input = {
        'commands.txt': content,
        'data.csv': 'a,b\n1,2\n',
        'vars.json': JSON.stringify({INPUT: 'data.csv', OUTPUT: 'out.csv'})
      };
      var out = await api.applyCommands(
        '-vars vars.json -run commands.txt', input);
      assert.equal(out['out.csv'], 'a,b\n1,2');
    });

    it('command-file-internal -vars defines variables', async function() {
      var content = [
        'mapshaper',
        '-vars INPUT=data.csv OUTPUT=out.csv',
        '-i {{INPUT}}',
        '-o {{OUTPUT}}'
      ].join('\n');
      var input = {
        'commands.txt': content,
        'data.csv': 'a,b\n1,2\n'
      };
      var out = await api.applyCommands('-run commands.txt', input);
      assert.equal(out['out.csv'], 'a,b\n1,2');
    });

    it('command file -vars overwrites a value set by CLI -vars (late-binding)', async function() {
      var content = [
        'mapshaper',
        '-vars INPUT=data.csv OUTPUT=out.csv',
        '-i {{INPUT}}',
        '-o {{OUTPUT}}'
      ].join('\n');
      var input = {
        'commands.txt': content,
        'data.csv': 'a,b\n1,2\n'
      };
      var out = await api.applyCommands(
        '-vars INPUT=wrong.csv OUTPUT=wrong.csv -run commands.txt', input);
      assert.equal(out['out.csv'], 'a,b\n1,2');
    });

    it('CLI -vars overrides command file -defaults', async function() {
      var content = [
        'mapshaper',
        '-defaults INPUT=wrong.csv OUTPUT=wrong.csv',
        '-i {{INPUT}}',
        '-o {{OUTPUT}}'
      ].join('\n');
      var input = {
        'commands.txt': content,
        'data.csv': 'a,b\n1,2\n'
      };
      var out = await api.applyCommands(
        '-vars INPUT=data.csv OUTPUT=out.csv -run commands.txt', input);
      assert.equal(out['out.csv'], 'a,b\n1,2');
    });

    it('command file -defaults supplies a value when CLI -vars is absent', async function() {
      var content = [
        'mapshaper',
        '-defaults INPUT=data.csv OUTPUT=out.csv',
        '-i {{INPUT}}',
        '-o {{OUTPUT}}'
      ].join('\n');
      var input = {
        'commands.txt': content,
        'data.csv': 'a,b\n1,2\n'
      };
      var out = await api.applyCommands('-run commands.txt', input);
      assert.equal(out['out.csv'], 'a,b\n1,2');
    });

    it('errors if a referenced variable is undefined', async function() {
      var content = [
        'mapshaper',
        '-i data.csv',
        '-o {{MISSING}}'
      ].join('\n');
      var input = {
        'commands.txt': content,
        'data.csv': 'a,b\n1,2\n'
      };
      var err;
      try {
        await api.applyCommands('-run commands.txt', input);
      } catch(e) { err = e; }
      assert.ok(err);
      assert.ok(/Undefined variable: MISSING/.test(err.message),
        err && err.message);
    });

    it('-vars JSON values can be numbers/booleans (coerced to strings)', async function() {
      var content = [
        'mapshaper',
        '-i data.csv',
        '-filter \'a >= {{MIN}}\'',
        '-o out.csv'
      ].join('\n');
      var input = {
        'commands.txt': content,
        'data.csv': 'a,b\n1,x\n2,y\n3,z\n',
        'vars.json': JSON.stringify({MIN: 2})
      };
      var out = await api.applyCommands(
        '-vars vars.json -run commands.txt', input);
      assert.equal(out['out.csv'], 'a,b\n2,y\n3,z');
    });

  });

  describe('late-binding interpolation', function() {

    it('CLI command line accepts {{VAR}} placeholders', async function() {
      var input = { 'data.csv': 'a,b\n1,2\n' };
      var out = await api.applyCommands(
        '-vars INPUT=data.csv -i {{INPUT}} -o out.csv', input);
      assert.equal(out['out.csv'], 'a,b\n1,2');
    });

    it('{{X}} resolves against a value set by -define earlier', async function() {
      var input = { 'data.csv': 'a,b\n1,x\n2,y\n3,z\n' };
      var out = await api.applyCommands(
        "-i data.csv -define MIN=2 -filter 'a >= {{MIN}}' -o out.csv",
        input);
      assert.equal(out['out.csv'], 'a,b\n2,y\n3,z');
    });

    it('-defaults is a no-op when defs.X is already set', async function() {
      var input = { 'data.csv': 'a,b\n1,2\n' };
      var out = await api.applyCommands(
        '-vars X=keep -defaults X=overwrite -i data.csv -o {{X}}.csv',
        input);
      assert.ok(out['keep.csv']);
      assert.ok(!out['overwrite.csv']);
    });

    it('-vars always overwrites', async function() {
      var input = { 'data.csv': 'a,b\n1,2\n' };
      var out = await api.applyCommands(
        '-vars X=first -vars X=second -i data.csv -o {{X}}.csv',
        input);
      assert.ok(out['second.csv']);
    });

    it('-vars inside an inactive -if branch does not take effect', async function() {
      var input = { 'data.csv': 'a,b\n1,2\n' };
      var out = await api.applyCommands(
        '-vars X=outer -i data.csv -if false -vars X=inner -endif -o {{X}}.csv',
        input);
      assert.ok(out['outer.csv']);
    });

    it('{{X}} inside an inactive -if branch does not error if X is unset', async function() {
      var input = { 'data.csv': 'a,b\n1,2\n' };
      var out = await api.applyCommands(
        '-i data.csv -if false -o {{MISSING}}.csv -endif -o ok.csv',
        input);
      assert.ok(out['ok.csv']);
    });

    it('errors with a useful message when {{X}} resolves to a non-primitive', async function() {
      var input = { 'data.csv': 'a,b\n1,2\n' };
      var err;
      try {
        await api.applyCommands(
          '-i data.csv -define X={a:1} -o {{X}}.csv',
          input);
      } catch(e) { err = e; }
      assert.ok(err);
      assert.ok(/not a primitive/.test(err.message), err && err.message);
    });

    it('placeholder values containing spaces stay as one token', async function() {
      var input = { 'data.csv': 'a,b\n1,2\n' };
      await api.applyCommands(
        '-vars MSG="hello world" -i data.csv -print {{MSG}}',
        input);
    });

  });

});
