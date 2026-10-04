import assert from 'assert';
import { cullCommandHistory } from '../src/gui/gui-session-history-cull';
import { parseCommands } from '../src/cli/mapshaper-parse-commands';
import { isSupportedSvgStyleProperty } from '../src/svg/svg-properties';

function cull(commands) {
  return cullCommandHistory(commands, parseCommands, isSupportedSvgStyleProperty);
}

describe('gui-session-history-cull', function() {
  it('culls style commands with overwritten properties', function() {
    var commands = [
      '-style fill=red',
      '-style fill=blue'
    ];
    assert.deepEqual(cull(commands), [
      '-style fill=blue'
    ]);
  });

  it('culls earlier style command when later command has a property superset', function() {
    var commands = [
      '-style fill=red',
      '-style fill=blue stroke=black'
    ];
    assert.deepEqual(cull(commands), [
      '-style fill=blue stroke=black'
    ]);
  });

  it('does not cull style commands when later properties are not a superset', function() {
    var commands = [
      '-style fill=red',
      '-style stroke=black'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('only culls style commands with the same ids', function() {
    var commands = [
      '-style ids=1,2 fill=red',
      '-style ids=2,3 fill=blue',
      '-style ids=1,2 fill=green'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('culls style commands with equivalent ids in different order', function() {
    var commands = [
      '-style ids=2,1 fill=red',
      '-style ids=1,2 fill=blue'
    ];
    assert.deepEqual(cull(commands), [
      '-style ids=1,2 fill=blue'
    ]);
  });

  it('does not cull style commands with where=', function() {
    var commands = [
      '-style where="id > 2" fill=red',
      '-style where="id > 2" fill=blue'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('does not cull style commands with different targets', function() {
    var commands = [
      '-style target=a fill=red',
      '-style target=b fill=blue'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('culls repeated random non-adjacent classify commands', function() {
    var commands = [
      '-classify colors=random non-adjacent',
      '-classify colors=random non-adjacent',
      '-classify colors=random non-adjacent'
    ];
    assert.deepEqual(cull(commands), [
      '-classify colors=random non-adjacent'
    ]);
  });

  it('a color classification supersedes an earlier one, or a random fill', function() {
    var commands = [
      '-classify colors=random non-adjacent',
      '-classify field=pop quantile colors=#000000,#ffffff',
      '-classify field=area equal-interval colors=#ff0000,#0000ff,#00ff00'
    ];
    assert.deepEqual(cull(commands), [
      '-classify field=area equal-interval colors=#ff0000,#0000ff,#00ff00'
    ]);
  });

  it('does not cull classify commands that write different fields', function() {
    var commands = [
      '-classify field=pop colors=#000000,#ffffff',
      '-classify field=pop colors=#000000,#ffffff save-as=fill2',
      '-classify field=pop values=1,2'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('does not cull a classify command that a later one reads', function() {
    var commands = [
      '-classify field=pop colors=#000000,#ffffff',
      '-classify field=fill method=categorical colors=#ff0000,#0000ff'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('does not cull a classify command that writes a key', function() {
    var commands = [
      '-classify field=pop colors=#000000,#ffffff key',
      '-classify field=pop colors=#ff0000,#0000ff'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('does not cull random classify commands with different targets', function() {
    var commands = [
      '-classify colors=random non-adjacent target=a',
      '-classify colors=random non-adjacent target=b'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('compacts adjacent cullable style commands repeatedly', function() {
    var commands = [
      '-style fill=red',
      '-style fill=blue stroke=black',
      '-style fill=green stroke=white'
    ];
    assert.deepEqual(cull(commands), [
      '-style fill=green stroke=white'
    ]);
  });

  it('culls -labels style edits, reading text= as label-text', function() {
    var commands = [
      "-labels text='Ren' ids=0",
      "-labels text='Reno' ids=0",
      "-style label-text='Reno!' ids=0"
    ];
    assert.deepEqual(cull(commands), [
      "-style label-text='Reno!' ids=0"
    ]);
  });

  it('does not cull a -labels command that adds a label', function() {
    var commands = [
      '-labels coordinates=0,0 text=a',
      '-labels text=b'
    ];
    assert.deepEqual(cull(commands), commands);
  });

  it('does not cull a -labels command that makes a copy', function() {
    var commands = [
      '-labels text=a + name=copy',
      '-labels text=b'
    ];
    assert.deepEqual(cull(commands), commands);
  });
});
