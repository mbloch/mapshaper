import {MixedProjection} from '../crs/mapshaper-mixed-projection';
import utils from '../utils/mapshaper-utils';

// str: a custom projection string, e.g.: "albersusa +PR"
export function parseCustomProjection(str) {
  var parts = str.trim().split(/ +/);
  var params = [];
  var names = parts.filter(function(part) {
    if (/^\+/.test(part)) {
      params.push(part.substr(1)); // strip '+'
      return false;
    }
    return true;
  });
  var name = names[0];
  var opts = parseCustomParams(params);
  if (names.length != 1) return null; // parse error if other than one name found
  return getCustomProjection(name, opts);
}

// returns a custom projection object
function getCustomProjection(name, opts) {
  if (name == 'albersusa') {
    return new AlbersUSA(opts);
  }
  return null;
}

export function AlbersUSA(optsArg) {
  var opts = optsArg || {};
  var main = {
    proj: '+proj=aea +lon_0=-96 +lat_0=37.5 +lat_1=29.5 +lat_2=45.5',
    bbox: [-129,23,-62,52]
  };
  var AK = {
    name: 'AK',
    proj: '+proj=aea +lat_1=55 +lat_2=70 +lat_0=65 +lon_0=-148 +x_0=0 +y_0=0',
    bbox: [-172.26,50.89,-127.00,73.21],
    origin: [-152, 63],
    placement: [-1882782,-969242],
    scale: 0.37
  };
  var HI = {
    name: 'HI',
    proj: '+proj=aea +lat_1=19 +lat_2=24 +lat_0=20.9 +lon_0=-156.5 +x_0=0 +y_0=0',
    bbox: [-160.50,18.72,-154.57,22.58],
    origin: [-157, 21],
    placement: [-1050326,-1055362]
  };
  var PR = {
    name: 'PR',
    proj: '+proj=aea +lat_1=18 +lat_2=18.43 +lat_0=17.83 +lon_0=-66.43 +x_0=0 +y_0=0',
    bbox: [-68.092,17.824,-65.151,18.787],
    origin: [-66.431, 18.228],
    placement: [1993101,-1254517]
  };
  var VI = {
    name: 'VI',
    // same projection and origin as PR, so they maintain their true geographical relationship
    proj: '+proj=aea +lat_1=18 +lat_2=18.43 +lat_0=17.83 +lon_0=-66.43 +x_0=0 +y_0=0',
    bbox: [-65.104,17.665,-64.454,18.505],
    origin: [-66.431, 18.228],
    placement: [1993101,-1254517]
  };
  var mixed = new MixedProjection(main, opts)
    .addFrame(AK)
    .addFrame(HI);
  if (opts.PR) {
    mixed.addFrame(PR);
  }
  if (opts.VI) {
    mixed.addFrame(VI);
  }
  return mixed;
}


export function parseCustomParams(arr) {
  var opts = {};
  arr.forEach(function(str) {
    parseCustomParam(str, opts);
  });
  return opts;
}

function parseCustomParam(str, opts) {
  var parts = str.split('=');
  var path = parts[0].split('.');
  var key = path.pop();
  var obj = path.reduce(function(memo, name) {
    if (name in memo === false) {
      memo[name] = {};
    } else if (!utils.isObject(memo[name])) {
      return {};// error condition, could display a warning
    }
    return memo[name];
  }, opts);
  if (parts.length > 1) {
    obj[key] = parseCustomParamValue(parts[1]);
  } else if (key in obj === false && !path.length) {
    // e.g. convert string 'PR' into {PR: {}} (empty object),
    // to show PR with default properties
    obj[key] = {};
  }
}

function parseCustomParamValue(str) {
  var val;
  if (str.indexOf(',') > 0) {
    val = str.split(',').map(parseFloat);
    // TODO: validate
    return val;
  }
  val = utils.parseNumber(str);
  if (val === null) {
    val = str;
  }
  return val;
}
