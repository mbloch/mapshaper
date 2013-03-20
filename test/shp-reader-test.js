var api = require('../'),
  assert = require('assert');

var Node = api.Node,
    ShpReader = api.ShpReader,
    Utils = api.Utils,
    BoundingBox = api.BoundingBox;

function filePath(file) {
  var path = Node.path.join(__dirname, "test_data", file);
  return path;
}

// Compare the bounds reported in .shp file and record headers
// with bounds calculated from the points returned by ShapeRecord#read()
//
function testBounds(file) {
  var reader = new ShpReader(filePath(file));

  it(file + " (type " + reader.type()+ ")", function() {
    var minx = Infinity,
        miny = Infinity,
        maxx = -Infinity,
        maxy = -Infinity,
        hasBounds = reader.hasBounds(),
        bigBox = new BoundingBox();

    reader.forEachShape(function(shp) {
      if (shp.isNull) return;
      var bounds,
          bbox = new BoundingBox();
      // check bounds of polygon, polyline and multipoint shapes
      if (hasBounds) {
        bounds = shp.getBounds(); // bounds from shape header
        shp.getPoints().forEach(function(p) {
          bbox.mergePoint(p[0], p[1]);
        });

        // test if bounds from shape header match observed bounds
        if (bounds[0] != bbox.left || bounds[1] != bbox.bottom || bounds[2] != bbox.right || bounds[3] != bbox.top) {
          assert.ok(false, "Bounds in shape " + shp.id + " header don't match observed bounds");
        }
        bigBox.mergeBounds(bbox);
      } 
      // get bounds of single-point shapes
      else {
        var p = shp.read();
        bigBox.mergePoint(p[0], p[1]);
      }
    });
    var shpBounds = reader.header().bounds;
    if (shpBounds[0] != bigBox.left || shpBounds[1] != bigBox.bottom || shpBounds[2] != bigBox.right || shpBounds[3] != bigBox.top) {
      assert.ok(false, "Bounds in file header don't match observed bounds");
    }
  })
}


// Count shapes, parts, points and nulls using the ShpReader#getCounts() method
// and by counting objects returned by ShapeRecord#read(), check that the tallies match
//
function testCounts(file) {
  var reader = new ShpReader(filePath(file));

  it(file + " (type " + reader.type()+ ")", function() {

    var hasParts = reader.hasParts(),
        hasBounds = reader.hasBounds();
    var counts = reader.getCounts();
    var data = reader.read();

    if (counts.shapeCount != data.length)
      assert.ok(false, "Shape counts don't match");

    var parts = 0,
        points = 0,
        nulls = 0;

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
        if (!hasBounds) { // i.e. single point
          partsInShape = 1;
          pointsInShape = 1;
        } else if (hasParts) {
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
    });

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
  "shplib/multipnt.shp",
  "shplib/mexico/cities.shp"
];

var boundsTestFiles = [
  "two_states.shp",
  "six_counties.shp",
  "shplib/polygon.shp",
  "shplib/pline.shp",
  "shplib/masspntz.shp",
  "shplib/brklinz.shp",
  "shplib/anno.shp",
  // "shplib/3dpoints.shp", // bounds in header seem to be incorrect
  "shplib/multipnt.shp",
  "shplib/mexico/cities.shp"
];


describe('shp-reader.js', function () {
  describe('#getCounts() output matches numbers of objects found', function () {
    countTestFiles.forEach(testCounts);
  })

  describe('#getBounds() measured bounds match bounds from headers', function () {
    boundsTestFiles.forEach(testBounds);
  })
})