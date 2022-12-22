import api from '../';
import assert from 'assert';
var internal = api.internal;


describe('mapshaper-parse-commands.js', function () {

  describe('parseConsoleCommands()', function () {
    // // Removed this test (now, -i command is blocked in browser by
    // // checking the execution environment).
    // it('should block input commands', function () {
    //   function bad(cmd) {
    //     assert.throws(function() {
    //       internal.parseConsoleCommands(cmd);
    //     });
    //   }
    //   bad("mapshaper foo.shp")
    //   bad("-i foo");
    // })

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
