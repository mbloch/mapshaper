import utils from '../utils/mapshaper-utils';

export function stringify(obj) {
  var svg, joinStr;
  if (!obj || !obj.tag) return '';
  svg = '<' + obj.tag;
  // w.s. is significant in text elements
  if (obj.properties) {
    svg += stringifyProperties(obj.properties);
  }
  if (obj.children || obj.value) {
    joinStr = obj.tag == 'text' || obj.tag == 'tspan' ? '' : '\n';
    svg += '>' + joinStr;
    if (obj.value) {
      svg += stringEscape(obj.value);
    }
    if (obj.children) {
      svg += obj.children.map(stringify).join(joinStr);
    }
    svg += joinStr + '</' + obj.tag + '>';
  } else {
    svg += '/>';
  }
  return svg;
}

// Replace some chars with XML "predefined entities" to avoid parsing errors
// https://en.wikipedia.org/wiki/List_of_XML_and_HTML_character_entity_references#Predefined_entities_in_XML
var rxp = /[&<>"']/g,
    map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    };
export function stringEscape(s) {
  return String(s).replace(rxp, function(match, i) {
    var entity = map[match];
    // don't replace &amp; with &amp;amp;
    if (match == '&' && s.substr(i, entity.length) == entity) {
      return '&';
    }
    return entity;
  });
}

export function stringifyProperties(o) {
  return Object.keys(o).reduce(function(memo, key) {
    var val = o[key],
        strval;
    if (!val && val !== 0) return memo; // omit undefined / empty / null values
    strval = utils.isString(val) ? val : JSON.stringify(val);
    if (key == 'href') {
      key = 'xlink:href';
    }
    if (key == 'css') {
      key = 'style'; // inline style
    }
    return memo + ' ' + key + '="' + stringEscape(strval) + '"';
  }, '');
}
