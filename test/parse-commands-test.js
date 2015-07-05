var api = require('../'),
  internal = api.internal,
  assert = require('assert');

describe('mapshaper-console.js', function () {

  describe('parseConsoleCommands()', function () {
    it('should block some commands', function () {

      function bad(cmd) {
        assert.throws(function() {
          internal.parseConsoleCommands(cmd);
        });
      }

      bad("-o out.shp");
      bad("mapshaper foo.shp")
      bad("mapshaper -clip bar");
      bad('clip bar');
      bad("join foo keys=a,b");
      bad("erase bar");
      bad("o format=geojson");
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

  })


})
