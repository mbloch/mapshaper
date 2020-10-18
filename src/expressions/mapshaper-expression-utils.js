import utils from '../utils/mapshaper-utils';
import { blend } from '../color/blending';

export function addUtils(env) {
  Object.assign(env, {
    round: function(val, dig) {
      var k = 1;
      dig = dig | 0;
      while(dig-- > 0) k *= 10;
      return Math.round(val * k) / k;
    },
    sprintf: utils.format,
    blend: blend
  });
}

export function addGetters(obj, getters) {
  Object.keys(getters).forEach(function(name) {
    var val = getters[name];
    var o = typeof val == 'function' ?
      {get: val} :
      {value: val, writable: false};
    Object.defineProperty(obj, name, o);
  });
}
