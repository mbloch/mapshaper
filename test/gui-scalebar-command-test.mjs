import assert from 'assert';
import { getScalebarCommand } from '../src/gui/gui-scalebar-command';
import { parseCommands } from '../src/cli/mapshaper-parse-commands';

describe('gui-scalebar-command.mjs', function() {
  it('default settings give a bare command', function() {
    assert.equal(getScalebarCommand({type: 'scalebar'}), '-scalebar');
    assert.equal(getScalebarCommand(null), '-scalebar');
  });

  it('writes every setting, skipping empty values', function() {
    var cmd = getScalebarCommand({
      type: 'scalebar',
      label: '100 km',
      units: 'km',
      style: 'b',
      position: 'bottom-right',
      font_size: 11,
      font_family: 'Helvetica Neue',
      color: '#333333',
      margin: '',
      dual_units: true
    });
    assert.equal(cmd, "-scalebar '100 km' units=km style=b position=bottom-right " +
      "font-size=11 font-family='Helvetica Neue' color=#333333 dual-units");
  });

  it('round-trips through the command parser', function() {
    var settings = {
      label: "5 miles",
      position: 'top-center',
      label_position: 'bottom',
      font_family: "Gill Sans, sans-serif",
      font_weight: 'bold',
      bar_width: 2,
      margin: 20,
      dual_units: true
    };
    var opts = parseCommands(getScalebarCommand(settings))[0].options;
    assert.deepEqual(opts, {
      label: '5 miles',
      position: 'top-center',
      label_position: 'bottom',
      font_family: 'Gill Sans, sans-serif',
      font_weight: 'bold',
      bar_width: 2,
      margin: 20,
      dual_units: true
    });
  });
});
