import assert from 'assert';
import { parseCommands } from '../src/cli/mapshaper-parse-commands';


describe('debug', function () {

    good("file.shp name='a b'", {files:['file.shp'], name: 'a b'});

});

function good(str, reference) {
  it(str, function() {
    var parsed = parseCommands(str);
    var target = parsed[0].options;
    assert.deepEqual(target, reference);
  })
}