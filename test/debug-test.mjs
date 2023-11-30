import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;


describe('debug', function () {

    good("file.shp name='a b'", {files:['file.shp'], name: 'a b'});

});

function good(str, reference) {
  it(str, function() {
    var parsed = internal.parseCommands(str);
    var target = parsed[0].options;
    assert.deepEqual(target, reference);
  })
}