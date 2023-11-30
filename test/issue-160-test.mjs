import api from '../mapshaper.js';
import assert from 'assert';


describe('issue 160', function () {
  // stack trace:
  // TypeError: Cannot read property '1' of null
  //     at ArcCollection.forEachArcSegment (/Users/199000/mb4/mapshaperjs/mapshaper.js:2429:28)
  //     at ArcCollection.forEachSegment (/Users/199000/mb4/mapshaperjs/mapshaper.js:2442:21)
  //     at Object.MapShaper.getAvgSegment2 (/Users/199000/mb4/mapshaperjs/mapshaper.js:2926:20)
  //     at Object.MapShaper.calcSegmentIntersectionStripeCount (/Users/199000/mb4/mapshaperjs/mapshaper.js:4673:26)
  //     at Object.findSegmentIntersections (/Users/199000/mb4/mapshaperjs/mapshaper.js:4584:33)
  //     at Object.MapShaper.findClippingPoints (/Users/199000/mb4/mapshaperjs/mapshaper.js:5207:33)
  //     at Object.MapShaper.divideArcs (/Users/199000/mb4/mapshaperjs/mapshaper.js:5072:26)
  //     at Object.MapShaper.addIntersectionCuts (/Users/199000/mb4/mapshaperjs/mapshaper.js:5052:23)
  //     at Object.MapShaper.setCoordinatePrecision (/Users/199000/mb4/mapshaperjs/mapshaper.js:12292:23)
  //     at Object.MapShaper.transformCoordsForSVG (/Users/199000/mb4/mapshaperjs/mapshaper.js:12237:13)

  // cause: simplification data was removed by topology function, but simplification
  //    threshold in ArcCollection was not reset.
  it ('svg output after simplification works', function(done) {
    api.applyCommands('-i test/data/two_states_mercator.shp -simplify 10% -o precision=100 format=svg final', null, function(err, output) {
      assert(!err);
      done();
    });
  });
})
