import { Bounds } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { toWebMercator, fromWebMercator } from './gui-dynamic-crs';
import {
  buildGeocodeUrl, parseGeocodeResponse, getPlaceBBox, getPlaceZoom,
  getSearchLanguage, zoomToMetersPerPixel, clampLat
} from './gui-place-search-utils';

var SEARCH_ICON = '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round"><circle cx="5.8" cy="5.8" r="4.3"/><line x1="9" y1="9" x2="12.6" y2="12.6"/></svg>';

var MIN_CHARS = 2;
var DEBOUNCE_MS = 250;

// A place-name search box in the basemap buttons in the lower right. It is only
// shown while a basemap is on: the map is in Web Mercator then, and the results
// are shown on a Mapbox map, as Mapbox's terms ask.
//   parent: the basemap buttons
//   getToken: returns the Mapbox access token
export function PlaceSearch(gui, parent, getToken) {
  var wrapper = El('div').addClass('place-search').hide();
  var btn = El('div').addClass('place-search-btn').attr('title', 'Search for a place')
    .html(SEARCH_ICON).appendTo(wrapper);
  var input = El('input').addClass('place-search-input')
    .attr('type', 'text')
    .attr('placeholder', 'Search for a place')
    .attr('spellcheck', 'false')
    .attr('autocomplete', 'off')
    .appendTo(wrapper);
  var list = El('div').addClass('place-search-results').appendTo(wrapper).hide();
  var enabled = false;
  var open = false;
  var places = [];
  var selected = -1;
  var timer = null;
  var requestId = 0;
  var controller = null;
  var selectWhenReady = false;
  // ?search-language=ja sets the language of results, in place of detecting it
  // from the query (for debugging)
  var languageOverride = getLanguageOverride();
  var unsupportedLanguages = {};

  parent.node().insertBefore(wrapper.node(), parent.node().firstChild);

  btn.on('click', function() {
    if (open) {
      collapse();
    } else {
      expand();
    }
  });

  // While an input method is composing (e.g. "tai bei" on the way to 台北), the
  // box holds unfinished text: search for what is committed when it's done
  input.on('input', function(e) {
    if (e.isComposing) return;
    scheduleSearch();
  });
  input.on('compositionstart', function() {
    cancelPending();
  });
  input.on('compositionend', function() {
    scheduleSearch();
  });

  // Keystrokes in the box are the box's, not the map's shortcuts
  input.on('keydown', function(e) {
    e.stopPropagation();
    // the input method's own keys, such as the Enter that picks a candidate
    // (Safari reports that Enter with keyCode 229 rather than isComposing)
    if (e.isComposing || e.keyCode == 229) return;
    if (e.key == 'ArrowDown' || e.key == 'ArrowUp') {
      e.preventDefault();
      moveSelection(e.key == 'ArrowDown' ? 1 : -1);
    } else if (e.key == 'Enter') {
      e.preventDefault();
      onEnter();
    } else if (e.key == 'Escape') {
      e.preventDefault();
      if (input.node().value) {
        input.node().value = '';
        clearResults();
      } else {
        collapse();
      }
    }
  });
  input.on('keyup', function(e) {
    e.stopPropagation();
  });

  // Picking a result shouldn't take focus from the box first
  list.on('mousedown', function(e) {
    e.preventDefault();
  });

  gui.on('map_click', function() {
    if (open) collapse();
  });

  function setEnabled(on) {
    if (on == enabled) return;
    enabled = on;
    if (on) {
      wrapper.show();
    } else {
      collapse();
      wrapper.hide();
    }
  }

  function expand() {
    open = true;
    wrapper.addClass('open');
    input.node().focus();
    input.node().select();
  }

  function collapse() {
    if (!open) return;
    open = false;
    wrapper.removeClass('open');
    clearResults();
    input.node().blur();
  }

  function cancelPending() {
    clearTimeout(timer);
    timer = null;
    selectWhenReady = false;
    if (controller) {
      controller.abort();
      controller = null;
    }
    requestId++;
  }

  function clearResults() {
    cancelPending();
    places = [];
    selected = -1;
    list.empty().hide();
  }

  function getQuery() {
    return input.node().value.trim();
  }

  function scheduleSearch() {
    cancelPending();
    if (getQuery().length < MIN_CHARS) {
      places = [];
      selected = -1;
      list.empty().hide();
      return;
    }
    timer = setTimeout(runSearch, DEBOUNCE_MS);
  }

  function getLanguageOverride() {
    var val = GUI.getUrlVars()['search-language'];
    return typeof val == 'string' && val ? val : null;
  }

  function getLanguage(query) {
    var lang;
    if (languageOverride) return languageOverride;
    lang = getSearchLanguage(query, navigator.languages || [navigator.language]);
    return unsupportedLanguages[lang] ? null : lang;
  }

  function fetchPlaces(opts) {
    return fetch(buildGeocodeUrl(opts), controller ? {signal: controller.signal} : undefined);
  }

  async function runSearch() {
    var query = getQuery();
    var id = ++requestId;
    var language = getLanguage(query);
    var opts, json, resp;
    timer = null;
    if (query.length < MIN_CHARS) return;
    opts = {query, token: getToken(), proximity: getMapCenter(), language: language};
    controller = typeof AbortController == 'function' ? new AbortController() : null;
    try {
      resp = await fetchPlaces(opts);
      // Mapbox rejects language codes it doesn't know (422), which a browser's
      // languages can include
      if (resp.status == 422 && language && !languageOverride) {
        unsupportedLanguages[language] = true;
        resp = await fetchPlaces(Object.assign({}, opts, {language: null}));
      }
      if (!resp.ok) throw Error('HTTP ' + resp.status);
      json = await resp.json();
    } catch(e) {
      if (id != requestId) return;
      controller = null;
      showMessage('Search is not available right now');
      return;
    }
    if (id != requestId || !open) return;
    controller = null;
    places = parseGeocodeResponse(json);
    selected = places.length > 0 ? 0 : -1;
    if (selectWhenReady) {
      selectWhenReady = false;
      if (places.length > 0) {
        choose(places[0]);
        return;
      }
    }
    renderResults();
  }

  function onEnter() {
    if (places.length > 0) {
      choose(places[Math.max(selected, 0)]);
    } else if (getQuery().length >= MIN_CHARS) {
      // results haven't arrived yet; search now and take the first one
      if (timer || !controller) {
        cancelPending();
        runSearch();
      }
      selectWhenReady = true;
    }
  }

  function showMessage(msg) {
    places = [];
    selected = -1;
    list.empty().show();
    El('div').addClass('place-search-message').text(msg).appendTo(list);
  }

  function renderResults() {
    list.empty();
    if (places.length === 0) {
      showMessage('No places found');
      return;
    }
    places.forEach(function(place, i) {
      var row = El('div').addClass('place-search-result').appendTo(list);
      El('span').addClass('place-search-name').text(place.name).appendTo(row);
      if (place.detail) {
        El('span').addClass('place-search-detail').text(place.detail).appendTo(row);
      }
      row.on('mouseenter', function() {
        selected = i;
        updateSelection();
      });
      row.on('click', function() {
        choose(place);
      });
    });
    list.show();
    updateSelection();
  }

  function moveSelection(d) {
    if (places.length === 0) return;
    selected = (selected + d + places.length) % places.length;
    updateSelection();
  }

  function updateSelection() {
    list.findChildren('.place-search-result').forEach(function(el, i) {
      el.classed('selected', i == selected);
    });
  }

  function choose(place) {
    input.node().value = place.name;
    clearResults();
    input.node().blur();
    zoomToPlace(place);
  }

  function zoomToPlace(place) {
    var ext = gui.map.getExtent();
    var bbox = getPlaceBBox(place);
    var bounds, p1, p2, c, w, h;
    if (bbox) {
      p1 = toWebMercator(bbox[0], bbox[1]);
      p2 = toWebMercator(bbox[2], bbox[3]);
      bounds = new Bounds(p1[0], p1[1], p2[0], p2[1]);
      bounds.scale(1.1); // a little margin around the place
    } else {
      c = toWebMercator(place.center[0], clampLat(place.center[1]));
      w = zoomToMetersPerPixel(getPlaceZoom(place)) * ext.width() / 2;
      h = w * ext.height() / ext.width();
      bounds = new Bounds(c[0] - w, c[1] - h, c[0] + w, c[1] + h);
    }
    ext.zoomToBounds(bounds);
  }

  function getMapCenter() {
    var b = gui.map.getExtent().getBounds();
    if (!b.hasBounds()) return null;
    var p = fromWebMercator(b.centerX(), b.centerY());
    p[0] = ((p[0] + 180) % 360 + 360) % 360 - 180; // the view may be over a world copy
    return p;
  }

  return {setEnabled};
}
