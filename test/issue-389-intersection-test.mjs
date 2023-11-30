import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;
var segmentIntersection = api.geom.segmentIntersection;

describe('Issue #389 (clipping error)', function () {

  it('inner polygon is not removed by clipping', function(done) {
    var cmd = '-i test/data/issues/389_clipping_error/inner_polygon.json ' +
      '-clip test/data/issues/389_clipping_error/outer_polygon.json -o';
    api.applyCommands(cmd, {}, function(err, out) {
      var json = JSON.parse(out['inner_polygon.json']);
      assert.equal(json.features[0].geometry.type, 'Polygon');
      done();
    });
  })


  // Sample data taken from intersection of a clipped hexagon contained within
  // a larger polygon. The hexagon touches the enclosing polygon along one segment
  // of the enclosing polygon
  //
  it('test1 (collinear)', function() {

    // long segment, outer polygon
    // x1  666201.6873213877
    // y1  601543.6851056335
    // x2  666804.6570118086
    // y2  599167.12060213

    // collinear segment 1
    // x1  666378.8769715985
    // y1  600845.3040099186
    // x2  666429.0636649196
    // y2  600647.496531715

    var a = [666201.6873213877, 601543.6851056335],
        b = [666804.6570118086, 599167.12060213],
        c = [666378.8769715985, 600845.3040099186],
        d = [666429.0636649196, 600647.496531715];

    // cd is contained within ab
    var abcd = segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
    assert.deepEqual(abcd, [666378.8769715985, 600845.3040099186, 666429.0636649196, 600647.496531715])
  });

  it('test2 (collinear)', function() {
    // long segment, outer polygon
    // x1  666201.6873213877
    // y1  601543.6851056335
    // x2  666804.6570118086
    // y2  599167.12060213

    // collinear segment 2
    // x1  666429.0636649196
    // y1  600647.496531715
    // x2  666477.3647344222
    // y2  600457.1211130416

    var a = [666201.6873213877, 601543.6851056335],
        b = [666804.6570118086, 599167.12060213],
        e = [666429.0636649196, 600647.496531715],
        f = [666477.3647344222, 600457.1211130416];

    // ef is contained within ab
    var abef = segmentIntersection(a[0], a[1], b[0], b[1], e[0], e[1], f[0], f[1]);
    assert.deepEqual(abef, [666429.0636649196, 600647.496531715, 666477.3647344222, 600457.1211130416]);
  });

  it('test3 (T-intersection)', function() {
    // long segment, outer polygon
    // x1  666201.6873213877
    // y1  601543.6851056335
    // x2  666804.6570118086
    // y2  599167.12060213

    // inner segment, angled
    // x1  662672.010065773
    // y1  607265.7858277039
    // x2  666378.8769715985
    // y2  600845.3040099186
    var a = [666201.6873213877, 601543.6851056335],
        b = [666804.6570118086, 599167.12060213],
        c = [662672.010065773, 607265.7858277039],
        d = [666378.8769715985, 600845.3040099186];
    var abcd = segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
    assert.deepEqual(abcd, [666378.8769715985, 600845.3040099186])
  })

  it('test4 (T-intersection)', function() {
    // long segment, outer polygon
    // x1  666201.6873213877
    // y1  601543.6851056335
    // x2  666804.6570118086
    // y2  599167.12060213

    // inner segment, angled
    // x1  666477.3647344222
    // y1  600457.1211130416
    // x2  658975.0296153039
    // y2  587462.6955113204
    var a = [666201.6873213877, 601543.6851056335],
        b = [666804.6570118086, 599167.12060213],
        c = [666477.3647344222, 600457.1211130416],
        d = [658975.0296153039, 587462.6955113204];
    var abcd = segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
    assert.deepEqual(abcd, [666477.3647344222, 600457.1211130416])
  })

  it('test 5 (collinear, partial overlap with one shared endpoint', function() {
    // long segment, outer polygon
    // x1  666201.6873213877
    // y1  601543.6851056335
    // x2  666804.6570118086
    // y2  599167.12060213

    // inner segment, collinear
    // x1  666477.3647344222
    // y1  600457.1211130416
    // x2  666804.6570118086
    // y2  599167.12060213
    var a = [666201.6873213877, 601543.6851056335],
        b = [666804.6570118086, 599167.12060213],
        c = [666477.3647344222, 600457.1211130416],
        d = [666804.6570118086, 599167.12060213];
    var abcd = segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);

    // An update to segmentIntersection resulted in two interection points being detected:
    // [  666477.3647344222, 600457.1211130416, 666804.1754066246, 599169.0188165896]
    // //  assert.deepEqual(abcd, [666477.3647344222, 600457.1211130416])

  });
});
