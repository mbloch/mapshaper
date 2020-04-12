import utils from '../utils/mapshaper-utils';
import { sha1 } from '../utils/mapshaper-sha1';
import { stop } from '../utils/mapshaper-logging';
import { runningInBrowser } from '../mapshaper-state';

export function embedImages(obj, symbols) {
  // Same-origin policy is an obstacle to embedding images in web UI
  if (runningInBrowser()) return;
  procNode(obj);

  function procNode(obj) {
    if (obj.tag == 'image') {
      if (/\.svg/.test(obj.properties.href || '')) {
        embedSvgImage(obj);
      }
    } else if (obj.children) {
      obj.children.forEach(procNode);
    }
  }

  function embedSvgImage(obj) {
    var id = addImage(obj.properties.href);
    obj.tag = 'use';
    obj.properties.href = '#' + id;
  }

  function addImage(href) {
    var item = utils.find(symbols, function(item) {return item.href == href;});
    if (!item) {
      item = {
        href: href,
        id: urlToId(href) // generating id from href, to try to support multiple inline svgs on page
      };
      // item.svg = convertSvgToSymbol(getSvgFile(href), item.id) + '\n';
      item.svg = convertSvg(getSvgFile(href), item.id) + '\n';
      symbols.push(item);
    }
    return item.id;
  }

  function getSvgFile(href) {
    var res, content, fs;
    if (href.indexOf('http') === 0) {
      res  = require('sync-request')('GET', href, {timeout: 1000});
      content = res.getBody().toString();
    } else if (require('fs').existsSync(href)) { // assume href is a relative path
      content = require('fs').readFileSync(href, 'utf8');
    } else {
      stop("Invalid SVG location:", href);
    }
    return content;
  }

  /*
  function convertSvgToSymbol(svg, id) {
    svg = svg.replace(/[^]*<svg/, '<svg');
    // Remove inkscape tags (there were errors caused when namespaces were
    // stripped when converting <svg> to <symbol> ... this may be futile, may
    // have to go back to embedding entire SVG document instead of using symbols)
    svg = svg.replace(/<metadata[^]*?metadata>/, '');
    svg = svg.replace(/<sodipodi[^>]*>/, '');
    // convert <svg> to <symbol>
    svg = svg.replace(/^<svg[^>]*>/, function(a) {
      var viewBox = a.match(/viewBox=".*?"/)[0];
      return '<symbol id="' + id + '" ' + viewBox + '>';
    });
    svg = svg.replace('svg>', 'symbol>');
    return svg;
  }
  */

  function convertSvg(svg, id) {
    // Remove stuff before <svg> tag
    svg = svg.replace(/[^]*<svg/, '<svg');
    return svg.replace(/^<svg[^>]*>/, function(a) {
      // set id property of <svg>
      a = a.replace(/ id="[^"]*"/, '');
      a = a.replace(/<svg/, '<svg id="' + id + '"');
      return a;
    });
  }
}

function urlToId(url) {
  return sha1(url).substr(0, 12);
}

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
      svg += obj.value;
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
  return String(s).replace(rxp, function(s) {
    return map[s];
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
    return memo + ' ' + key + '="' + stringEscape(strval) + '"';
  }, '');
}
