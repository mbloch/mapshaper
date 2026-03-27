import assert from 'assert';
import { parseConsoleCommands } from '../src/cli/mapshaper-parse-commands';


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
})
