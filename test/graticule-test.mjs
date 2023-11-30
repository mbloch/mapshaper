import api from '../mapshaper.js';
import assert from 'assert';


function hasOutline(json) {
  return json.features.some(feat => {
    return feat.properties.type == 'outline';
  });
}

function hasOnePolygon(json) {
  return json.geometries && json.geometries.length == 1 &&
    json.geometries[0] && json.geometries[0].type == 'Polygon';
}

function hasMeridians(arr) {
  return function(json) {
    arr.every(lon => {
      return json.features.some(feat => {
        return feat.properties.type == 'meridian' && feat.properties.value == lon;
      });
    });
  }
}

function polygonTest(str) {
  var path = 'test/data/world_land.json';
  it(str, function(done) {
    var cmd = `-i ${path} -proj ${str} densify -graticule polygon -o graticule.json`;
    api.applyCommands(cmd, {}, function(err, out) {
      var json = JSON.parse(out['graticule.json']);
      assert(hasOnePolygon(json));
      done();
    });
  });
}

function projTest(str, test) {
  var path = 'test/data/world_land.json';
  it(str, function(done) {
    var cmd = `-i ${path} -proj ${str} densify -graticule -o graticule.json`;
    api.applyCommands(cmd, {}, function(err, out) {
      var json = JSON.parse(out['graticule.json']);
      test(json);
      done();
    });
  });
}

describe('mapshaper-graticule.js', function () {
  // Test of graticule outlines and edge meridians
  // ... also should catch some projection failures
  describe('proj tests', function () {
    projTest('+proj=merc', hasMeridians([-180, 180]));
    projTest('wgs84', hasMeridians([-180, 180]));
    projTest('aea', hasMeridians([-180, 180]));
    projTest('+proj=aea +lat_1=30 +lat_2=55', hasMeridians([-180, 180]));
    projTest('+proj=bertin1953', hasOutline);
    projTest('+proj=cupola', hasMeridians([168.977, 180]));
    projTest('+proj=ortho', hasOutline);
    projTest('+proj=ortho +lat_0=60 +lon_0=-120', hasOutline);
    projTest('+proj=nsper +lat_0=30 +lon_0=80 +h=1e8', hasOutline);
  });

  describe('-graticule polygon tests', function() {


  })

  it('create latlong graticule if no data has been loaded', function(done) {

    api.internal.testCommands('-graticule', function(err, dataset) {
      assert.equal(dataset.layers[0].name, 'graticule');
      assert(api.internal.getDatasetCRS(dataset).is_latlong);
      done();
    });
  });

  it('reproject to match dataset with known projection', function(done) {

    api.internal.testCommands('-i test/data/three_points.shp -proj +proj=robin -graticule', function(err, dataset) {
      var graticule = dataset.layers[0];
      var bbox = api.internal.getLayerBounds(graticule, dataset.arcs);
      assert.equal(graticule.name, 'graticule');
      assert(!api.internal.probablyDecimalDegreeBounds(bbox));
      done();
    });
  })
});

