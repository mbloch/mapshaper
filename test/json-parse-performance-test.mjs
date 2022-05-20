import assert from 'assert';
import { parse } from '../src/geojson/json-parser';

var runMe = false;
if (runMe) describe('json-parse.js performance', function () {
  var SIZE = 2000000
  var str = JSON.stringify(getTestCoordinates(SIZE));
  var buf = Buffer.from(str);
  var aa = timedParse(parse, buf, 'parse()');
  var bb = timedParse(referenceParse, buf, 'JSON.parse()');
  it('test', function() {
    aa.forEach((a, i) => {
      var b = bb[i];
      try {
        assert.deepEqual(a, b)
      } catch(e) {
        console.log("failed at:", i);
        throw e;
      }
    })
  })

  function referenceParse(buf) {
    return JSON.parse(buf);
  }

  function timedParse(parse, buf, name) {
    console.time(name);
    var parsed = parse(buf);
    console.timeEnd(name);
    return parsed;
  }

  function randomCoord() {
    return Math.random() * 100 - 50;
  }

  function getTestCoordinates(n) {
    var arr = [];
    while (n-- > 0) {
      arr.push([randomCoord(), randomCoord()]);
    }
    return arr;
  }

})
