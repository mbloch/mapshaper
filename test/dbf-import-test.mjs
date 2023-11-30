import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';

describe('dbf-import.js', function () {

  describe('if possible, dbf binary data is not unpacked', function () {
    it('e.g. if no commands are run', function (done) {
      var buf = fs.readFileSync('test/data/two_states_mercator.dbf');
      api.applyCommands('-i file.dbf -o a.dbf -each true -o b.dbf', {'file.dbf': buf}, function(err, output) {
        var a = output['a.dbf'];
        var b = output['b.dbf']
        var aa = api.internal.importDbfTable(a, {}).getRecords();
        var bb = api.internal.importDbfTable(b, {}).getRecords();
        // after -each command, dbf is regenerated (with a new date in the header)
        assert.equal(String(buf), String(a));
        assert.notEqual(String(buf), String(b));
        assert.deepEqual(aa, bb);
        done();
      });
    })
  })



})