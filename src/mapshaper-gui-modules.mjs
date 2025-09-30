
import iconvLite from 'iconv-lite';
import * as idbKeyval from 'idb-keyval';
import * as tokml from '@placemarkio/tokml';
import * as togeojson from '@tmcw/togeojson';
import mproj from 'mproj';
import flatbush from 'flatbush';
import kdbush from 'kdbush';
import * as buffer from 'buffer';
import GeographicLib from 'geographiclib-geodesic';

// Export modules for use with custom require() function
window.modules = {
  'iconv-lite': iconvLite,
  'idb-keyval': idbKeyval,
  '@placemarkio/tokml': tokml,
  '@tmcw/togeojson': togeojson,
  'geographiclib-geodesic': GeographicLib,
  mproj,
  flatbush,
  kdbush,
  buffer
};
