import assert from 'assert';
import api from '../mapshaper.js';
// testing version
import { segmentIntersection2 } from '../src/geom/mapshaper-segment-geom2';

var a = [-74.01840544613368, 40.678442220061875];
var b = [-74.01840544611017, 40.67844222056485];
var c = [-74.01840544641863, 40.67844222100413];
var d = [-74.01840544611002, 40.67844222006226];

describe('geometry ex1', function () {

  it('segments intersect', function() {
    var out = api.geom.segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1], 0);
    assert.equal(out?.length, 2)
  });

});
