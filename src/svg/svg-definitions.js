import { sha1 } from '../utils/mapshaper-sha1';
import { runningInBrowser } from '../mapshaper-state';
import { convertFillHatch } from '../svg/svg-hatch';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

// convert object properties to definitions for images and hatch fills
export function convertPropertiesToDefinitions(obj, symbols) {
  procNode(obj);

  function procNode(obj) {
    if (obj.tag == 'path' && obj.properties['fill-hatch']) {
      convertFillHatch(obj.properties, symbols);
    }
    if (obj.tag == 'image' && !runningInBrowser()) {
      // Same-origin policy prevents embedding images in the web UI
      if (/\.svg/.test(obj.properties.href || '')) {
        convertSvgImage(obj, symbols);
      }
    } else if (obj.children) {
      obj.children.forEach(procNode);
    }
  }
}

function convertSvgImage(obj, symbols) {
  var href = obj.properties.href;
  var item = utils.find(symbols, function(item) {return item.href == href;});
  if (!item) {
    item = {
      href: href,
      id: urlToId(href) // generating id from href, to try to support multiple inline svgs on page
    };
    item.svg = convertSvg(getSvgFile(href), item.id) + '\n';
    symbols.push(item);
  }
  obj.tag = 'use';
  obj.properties.href = '#' + item.id;
}

// TODO: download SVG files asynchronously
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

function urlToId(url) {
  return sha1(url).substr(0, 12);
}