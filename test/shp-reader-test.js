var api = require('../'),
  assert = require('assert');

var Node = api.Node,
    ShpReader = api.ShpReader;

function filePath(file) {
  var path = Node.path.join(__dirname, "test_data", file);
  return path;
}

function testShapeBounds(shp) {
  if (shp.hasBounds()) {
    var data = shp.read();
    var bounds = shp.getBounds();
  }
}


function testCounts(file) {
  it('matching object counts in: ' + file, function() {
    var reader = new ShpReader(filePath(file)),
        hasParts = reader.hasParts(),
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
      } else {
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

var files = [
  "two_states.shp",
  "six_counties.shp",
  "shplib/polygon.shp",
  "shplib/pline.shp",
  "shplib/masspntz.shp",
  "shplib/brklinz.shp",
  "shplib/anno.shp"
]

describe('shp-reader.js', function () {

  describe('#getCounts() output matches numbers of objects found', function () {
    files.forEach(testCounts);
  })
})