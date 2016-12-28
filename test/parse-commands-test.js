var api = require('../'),
  internal = api.internal,
  assert = require('assert');

describe('mapshaper-parse-commands.js', function () {

  describe('parseConsoleCommands()', function () {
    it('should block input commands', function () {

      function bad(cmd) {
        assert.throws(function() {
          internal.parseConsoleCommands(cmd);
        });
      }

      bad("mapshaper foo.shp")
      bad("-i foo");
    })

    it('mapshaper -filter true', function () {
      var commands = internal.parseConsoleCommands('mapshaper -filter true');
      assert.equal(commands[0].name, 'filter');
    })

    it('filter true', function () {
      var commands = internal.parseConsoleCommands('filter true');
      assert.equal(commands[0].name, 'filter');
    })

    it('-filter true', function () {
      var commands = internal.parseConsoleCommands('-filter true');
      assert.equal(commands[0].name, 'filter');
    })

    it('info', function () {
      var commands = internal.parseConsoleCommands('info');
      assert.equal(commands[0].name, 'info');
    })

    it('mapshaper \\ -info', function() {
      var commands = internal.parseConsoleCommands('mapshaper \\ -info');
      assert.equal(commands[0].name, 'info');
    })

  })
})
