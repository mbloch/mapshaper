import api from '../mapshaper.js';
import assert from 'assert';

describe('mapshaper-run-script.js', function() {

  it('runs a .txt script supplied via the input cache', async function() {
    var script = [
      'mapshaper',
      '-i data.csv',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': script,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-i commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('runs the script even without the magic word? (no, falls back to DSV)', async function() {
    // Without the "mapshaper" magic word, a .txt file is treated as DSV input.
    // The DSV importer accepts a single column "a" with one row.
    var input = {
      'commands.txt': 'a\nfoo\nbar\n'
    };
    var out = await api.applyCommands('-i commands.txt -o', input);
    // exported with default name based on input name
    assert.ok(out['commands.csv']);
  });

  it('strips end-of-line "#" comments', async function() {
    var script = [
      'mapshaper # this is a script',
      '-i data.csv # load some data',
      '-rename-layers points # rename it',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': script,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-i commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('joins lines that do not begin with "-" onto the previous command', async function() {
    var script = [
      'mapshaper',
      '-i',
      '  data.csv',
      '-o',
      '  out.csv'
    ].join('\n');
    var input = {
      'commands.txt': script,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-i commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('accepts shell-style trailing-backslash continuations', async function() {
    var script = [
      'mapshaper \\',
      '-i data.csv \\',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': script,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-i commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('preserves "#" inside quoted strings', async function() {
    var script = [
      'mapshaper',
      '-i data.csv',
      '-each \'d.color = "#fff"\'',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': script,
      'data.csv': 'a\n1\n'
    };
    var out = await api.applyCommands('-i commands.txt', input);
    assert.equal(out['out.csv'], 'a,color\n1,#fff');
  });

  it('supports nested script files', async function() {
    var inner = [
      'mapshaper',
      '-i data.csv',
      '-o out.csv'
    ].join('\n');
    var outer = [
      'mapshaper',
      '-i inner.txt'
    ].join('\n');
    var input = {
      'outer.txt': outer,
      'inner.txt': inner,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-i outer.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('rejects scripts combined with other files via -i combine-files', async function() {
    var input = {
      'commands.txt': 'mapshaper\n-i data.csv\n-o out.csv',
      'data.csv': 'a,b\n1,2\n'
    };
    var err;
    try {
      await api.applyCommands('-i commands.txt data.csv combine-files', input);
    } catch(e) { err = e; }
    assert.ok(err, 'expected an error when combining a script with another file');
    assert.ok(/script files cannot be combined/i.test(err.message),
      'error mentions the conflict');
  });

  it('multi-file -i runs scripts as a separate group from data files', async function() {
    // -i a b is split into two separate import groups by divideImportCommand,
    // so a script + a data file in the same -i is allowed and processes each
    // independently.
    var input = {
      'commands.txt': 'mapshaper\n-i data.csv\n-o out.csv',
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-i commands.txt data.csv', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('attributes parse errors to the script file', async function() {
    var script = [
      'mapshaper',
      '-each \'unterminated quote',
      '-o'
    ].join('\n');
    var input = {
      'commands.txt': script
    };
    var err;
    try {
      await api.applyCommands('-i commands.txt', input);
    } catch(e) { err = e; }
    assert.ok(err);
    assert.ok(/commands\.txt/.test(err.message),
      'error message references the script file');
  });

  it('treats a leading bare token as an implicit -i', async function() {
    // Mirrors CLI: "mapshaper foo.csv" implies "-i foo.csv".
    var script = [
      'mapshaper data.csv',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': script,
      'data.csv': 'a,b\n1,2\n'
    };
    var out = await api.applyCommands('-i commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n1,2');
  });

  it('ignores empty scripts (only comments)', async function() {
    var script = [
      'mapshaper',
      '# nothing to do here',
      '# really'
    ].join('\n');
    var input = {
      'commands.txt': script
    };
    // No -o command was issued, so output should be empty
    var out = await api.applyCommands('-i commands.txt', input);
    assert.deepEqual(out, {});
  });

  it('script can run multiple commands in sequence', async function() {
    var script = [
      'mapshaper',
      '-i data.csv',
      '-filter \'a > 1\'',
      '-o out.csv'
    ].join('\n');
    var input = {
      'commands.txt': script,
      'data.csv': 'a,b\n1,x\n2,y\n3,z\n'
    };
    var out = await api.applyCommands('-i commands.txt', input);
    assert.equal(out['out.csv'], 'a,b\n2,y\n3,z');
  });

});
