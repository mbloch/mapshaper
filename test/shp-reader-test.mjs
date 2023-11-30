import api from '../mapshaper.js';
import assert from 'assert';
import path from 'path';
import helpers from './helpers';

var ShpReader = api.internal.ShpReader,
    ShpType = api.internal.ShpType,
    Utils = api.utils,
    Bounds = api.internal.Bounds;

function filePath(file) {
  return path.join(helpers.__dirname, "data", file);
}

// Compare the bounds reported in .shp file and record headers
// with bounds calculated from the points returned by ShapeRecord#read()
//
function testBounds(file) {
  var reader = new ShpReader(filePath(file)),
      shpType = reader.type();

  it(file + " (type " + reader.type()+ ")", function() {
    var bigBox = new Bounds();

    reader.forEachShape(function(shp) {
      if (shp.isNull) return;
      var bounds,
          bbox = new Bounds();
      // check bounds of polygon, polyline and multipoint shapes
      if (ShpType.hasBounds(shpType)) {
        bounds = shp.readBounds(); // bounds from shape header
        shp.readPoints().forEach(function(p) {
          bbox.mergePoint(p[0], p[1]);
        });
        // test if bounds from shape header match observed bounds
        if (bounds[0] != bbox.xmin || bounds[1] != bbox.ymin || bounds[2] != bbox.xmax || bounds[3] != bbox.ymax) {
          assert.ok(false, "Bounds in shape " + shp.id + " header don't match observed bounds");
        }
        bigBox.mergeBounds(bbox);
      }
      // read single-point shape
      else {
        var p = shp.read();
        bigBox.mergePoint(p[0], p[1]);
      }
    });
    var shpBounds = reader.header().bounds;
    if (shpBounds[0] != bigBox.xmin || shpBounds[1] != bigBox.ymin || shpBounds[2] != bigBox.xmax || shpBounds[3] != bigBox.ymax) {
      assert.ok(false, "Bounds in file header don't match observed bounds");
    }
  })
}

function getCounts(file) {
  var reader = new ShpReader(filePath(file));
  var counts = {
    nullCount: 0,
    partCount: 0,
    shapeCount: 0,
    pointCount: 0
  };
  reader.forEachShape(function(shp) {
    if (shp.isNull) counts.nullCount++;
    counts.pointCount += shp.pointCount;
    counts.partCount += shp.partCount;
    counts.shapeCount++;
  });
  return counts;
}

// get counts of shapes, parts, points and nulls using the ShpReader#getCounts() method
// compare to counts of objects returned by ShapeRecord#read()
//
function testCounts(file) {
  var reader = new ShpReader(filePath(file));
  it(file + " (type " + reader.type()+ ")", function() {
    var shpType = reader.type();
    var counts = getCounts(file);
    var parts = 0,
        points = 0,
        nulls = 0,
        shapes = 0;

    reader.forEachShape(function(shp) {
      var pointsInShape = 0,
          partsInShape = 0;
      if (shp.isNull) {
        nulls++;
        pointsInShape = 0;
        partsInShape = 0;
      }
      else {
        var shapeData = shp.read();
        if (!ShpType.hasBounds(shpType)) { // i.e. single point
          partsInShape = 1;
          pointsInShape = 1;
        } else if (ShpType.isMultiPartType(shpType)) {
          partsInShape = shapeData.length;
          shapeData.forEach(function(part) {
            pointsInShape += part.length;
          });
        } else {
          pointsInShape = shapeData.length;
          partsInShape = 1;
        }
      }

      if (pointsInShape != shp.pointCount)
        assert.ok(false, "Point count in shape " + shp.id + " doesn't match record header; " + pointsInShape + " vs. " + shp.pointCount)
      if (partsInShape != shp.partCount)
        assert.ok(false, "Part count in shape " + shp.id + " doesn't match record header")

      points += pointsInShape;
      parts += partsInShape;
      shapes++;
   });

    if (counts.shapeCount != shapes)
      // assert.ok(false, "Shape counts don't match");
      assert.equal(counts.shapeCount, shapes);

    if (parts != counts.partCount)
      assert.ok(false, "Part counts don't match");

    if (points != counts.pointCount)
      assert.ok(false, "Point counts don't match; " + points + " vs. " + counts.pointCount);

    if (nulls != counts.nullCount)
      assert.ok(false, "Null counts don't match");
  })
}

var countTestFiles = [
  "two_states.shp",
  "six_counties.shp",
  "shplib/polygon.shp",
  "shplib/pline.shp",
  "shplib/masspntz.shp",
  "shplib/brklinz.shp",
  "shplib/anno.shp",
  "shplib/3dpoints.shp",
  "shplib/multipnt.shp"];

var boundsTestFiles = [
  "two_states.shp",
  "six_counties.shp",
  "shplib/polygon.shp",
  "shplib/pline.shp",
  "shplib/masspntz.shp",
  "shplib/brklinz.shp",
  "shplib/anno.shp",
  // "shplib/3dpoints.shp", // bounds in header seem to be incorrect
  "shplib/multipnt.shp"];


describe('shp-reader.js', function () {
  describe('#getCounts() output matches numbers of objects found', function () {
    countTestFiles.forEach(testCounts);
  })

  describe('#readBounds() observed bounds match bounds from headers', function () {
    boundsTestFiles.forEach(testBounds);
  })
})