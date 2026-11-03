import assert from 'assert';
import {
  buildGeocodeUrl,
  parseGeocodeResponse,
  getPlaceBBox,
  getPlaceZoom,
  getSearchLanguage,
  zoomToMetersPerPixel
} from '../src/gui/gui-place-search-utils';

describe('gui-place-search-utils', function() {

  describe('buildGeocodeUrl()', function() {
    it('encodes the query and token and limits results to places', function() {
      var url = buildGeocodeUrl({query: 'São Paulo & co', token: 'pk.abc'});
      assert(url.startsWith('https://api.mapbox.com/search/geocode/v6/forward?'));
      assert(url.includes('q=S%C3%A3o%20Paulo%20%26%20co'));
      assert(url.includes('access_token=pk.abc'));
      assert(url.includes('autocomplete=true'));
      assert(url.includes('limit=5'));
      assert(url.includes('types=country,region,district,place,locality,neighborhood'));
      assert(!url.includes('proximity'));
    });

    it('adds a rounded proximity point', function() {
      var url = buildGeocodeUrl({query: 'x', token: 't', proximity: [-73.987654321, 40.123456789]});
      assert(url.includes('proximity=-73.9877,40.1235'));
    });

    it('skips an invalid proximity point', function() {
      var url = buildGeocodeUrl({query: 'x', token: 't', proximity: [NaN, 3]});
      assert(!url.includes('proximity'));
    });

    it('adds a language if given', function() {
      assert(buildGeocodeUrl({query: 'x', token: 't', language: 'zh-Hans'}).includes('&language=zh-Hans'));
      assert(!buildGeocodeUrl({query: 'x', token: 't', language: null}).includes('language'));
    });
  });

  describe('getSearchLanguage()', function() {
    it('scripts of a single language give that language', function() {
      assert.equal(getSearchLanguage('とうきょう', ['en-US']), 'ja');
      assert.equal(getSearchLanguage('東京タワー', ['zh-CN']), 'ja'); // kana with kanji
      assert.equal(getSearchLanguage('서울', ['en-US']), 'ko');
      assert.equal(getSearchLanguage('กรุงเทพ', ['en-US']), 'th');
      assert.equal(getSearchLanguage('Αθήνα', ['de']), 'el');
      assert.equal(getSearchLanguage('ירושלים', ['en']), 'he');
    });

    it('Chinese characters are Simplified Chinese, unless the browser prefers Japanese or Traditional Chinese', function() {
      assert.equal(getSearchLanguage('中国', ['en-US']), 'zh-Hans');
      assert.equal(getSearchLanguage('中国', ['zh-CN', 'en']), 'zh-Hans');
      assert.equal(getSearchLanguage('台北', ['zh-TW']), 'zh-Hant');
      assert.equal(getSearchLanguage('香港', ['zh-HK']), 'zh-Hant');
      assert.equal(getSearchLanguage('台北', ['zh-Hant-TW']), 'zh-Hant');
      assert.equal(getSearchLanguage('東京', ['ja-JP', 'en']), 'ja');
      assert.equal(getSearchLanguage('東京', ['en', 'ja']), 'ja');
    });

    it('Cyrillic and Arabic scripts take a browser language written in them', function() {
      assert.equal(getSearchLanguage('Москва', ['en-US']), 'ru');
      assert.equal(getSearchLanguage('Київ', ['uk-UA', 'en']), 'uk');
      assert.equal(getSearchLanguage('София', ['en', 'bg']), 'bg');
      assert.equal(getSearchLanguage('القاهرة', ['en']), 'ar');
      assert.equal(getSearchLanguage('تهران', ['fa-IR']), 'fa');
    });

    it('Latin letters take the first browser language written in Latin letters', function() {
      assert.equal(getSearchLanguage('Paris', ['fr-FR', 'en']), 'fr-FR');
      assert.equal(getSearchLanguage('Paris', ['zh-CN', 'de']), 'de');
      assert.equal(getSearchLanguage('Paris', ['ja-JP']), 'en');
      assert.equal(getSearchLanguage('Paris', []), 'en');
      assert.equal(getSearchLanguage('Paris', null), 'en');
    });
  });

  describe('parseGeocodeResponse()', function() {
    it('reads v6 features', function() {
      var json = {features: [{
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [2.35, 48.85]},
        properties: {
          name: 'Paris',
          place_formatted: 'Île-de-France, France',
          feature_type: 'place',
          coordinates: {longitude: 2.3483, latitude: 48.8534},
          bbox: [2.22, 48.81, 2.47, 48.9]
        }
      }, {
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [-95.55, 33.66]},
        properties: {name: 'Paris', place_formatted: 'Texas, United States', feature_type: 'place'}
      }]};
      assert.deepStrictEqual(parseGeocodeResponse(json), [{
        name: 'Paris',
        detail: 'Île-de-France, France',
        type: 'place',
        center: [2.3483, 48.8534],
        bbox: [2.22, 48.81, 2.47, 48.9]
      }, {
        name: 'Paris',
        detail: 'Texas, United States',
        type: 'place',
        center: [-95.55, 33.66],
        bbox: null
      }]);
    });

    it('drops features without coordinates and tolerates bad input', function() {
      assert.deepStrictEqual(parseGeocodeResponse({features: [{properties: {name: 'x'}}]}), []);
      assert.deepStrictEqual(parseGeocodeResponse(null), []);
      assert.deepStrictEqual(parseGeocodeResponse({message: 'Not Authorized'}), []);
    });
  });

  describe('getPlaceBBox()', function() {
    it('returns null for a place without a box', function() {
      assert.strictEqual(getPlaceBBox({bbox: null}), null);
    });

    it('unwraps a box that crosses the antimeridian', function() {
      assert.deepStrictEqual(getPlaceBBox({bbox: [177, -21, -178, -12]}), [177, -21, 182, -12]);
    });

    it('clamps latitudes to the basemap', function() {
      assert.deepStrictEqual(getPlaceBBox({bbox: [-180, -90, 180, 90]}), [-180, -84, 180, 84]);
    });

    it('returns null for a box with no area', function() {
      assert.strictEqual(getPlaceBBox({bbox: [10, 10, 10, 10]}), null);
    });
  });

  describe('getPlaceZoom()', function() {
    it('zooms in further on smaller kinds of place', function() {
      assert(getPlaceZoom({type: 'country'}) < getPlaceZoom({type: 'place'}));
      assert(getPlaceZoom({type: 'place'}) < getPlaceZoom({type: 'neighborhood'}));
      assert.strictEqual(getPlaceZoom({type: 'unknown'}), 12);
    });
  });

  describe('zoomToMetersPerPixel()', function() {
    it('halves with each zoom level', function() {
      assert.strictEqual(zoomToMetersPerPixel(0), 40075017 / 512);
      assert.strictEqual(zoomToMetersPerPixel(3) * 2, zoomToMetersPerPixel(2));
    });
  });
});
