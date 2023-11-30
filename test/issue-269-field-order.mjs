import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue 269 - dbf output should preserve field order', function () {

  it ('joined fields appear after local fields', function(done) {
    var a = 'id,N,M\n1,n,m';
    var b = 'id,Z,Y,X,A,B,C\n1,z,y,x,a,b,c';
    var cmd = '-i a.csv -join b.csv keys=id,id -o format=dbf';
    api.applyCommands(cmd, {'a.csv': a, 'b.csv': b}, function(err, output) {
      var dbf = new api.internal.DbfReader(output['a.dbf']);
      assert.deepEqual(dbf.getFields(), 'id,N,M,Z,Y,X,A,B,C'.split(','));
      done();
    });
  });

  it ('created fields appear after original fields', function(done) {
    var a = 'A,Z,B,Y\na,z,b,y';
    var cmd = '-i a.csv -each \'C = "c", X = "x"\' -o format=dbf';
    api.applyCommands(cmd, {'a.csv': a}, function(err, output) {
      var dbf = new api.internal.DbfReader(output['a.dbf']);
      assert.deepEqual(dbf.getFields(), 'A,Z,B,Y,C,X'.split(','));
      done();
    });
  });

});
