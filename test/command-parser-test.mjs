import api from '../mapshaper.js';
import assert from 'assert';

function parse(str) {
  return api.internal.parseCommands(str);
}

describe('mapshaper-command-parser.js', function () {

  describe('name=value options', function () {

    // A value written as part of the token is a value, even when it looks like
    // a command name. Without this, the value was pushed back onto the token
    // list and then mistaken for the next command.
    it('accept a value that starts with a dash and a letter', function () {
      var cmd = parse('-symbols type=pie hole=-size')[0];
      assert.equal(cmd.options.hole, '-size');
    })

    it('accept a negative number', function () {
      var cmd = parse('-symbols type=pie hole=-5')[0];
      assert.equal(cmd.options.hole, '-5');
    })

    it('accept a negated expression', function () {
      var cmd = parse('-style dx=-OFFSET')[0];
      assert.equal(cmd.options.dx, '-OFFSET');
    })

    it('do not consume the following command', function () {
      var commands = parse('-symbols type=pie hole=-size -o out.svg');
      assert.deepEqual(commands.map(function(cmd) {return cmd.name;}), ['symbols', 'o']);
    })

    it('still report a missing value in the space-delimited form', function () {
      assert.throws(function() {
        parse('-symbols type=pie hole -o out.svg');
      }, /Missing value for hole option/);
    })
  })
})
