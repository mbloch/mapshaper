import { sha1 } from '../utils/mapshaper-sha1';
import { convertFillPattern } from '../svg/svg-hatch';
import { convertFillEffect } from '../svg/svg-effect';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { fetchFileSync } from '../svg/svg-fetch';
import require from '../mapshaper-require';

// convert object properties to definitions for images and hatch fills
export function convertPropertiesToDefinitions(obj, defs) {
  procNode(obj);

  function procNode(obj) {
    if (obj.tag == 'path' && obj.properties['fill-pattern']) {
      convertFillPattern(obj.properties, defs);
    }
    if (obj.tag == 'path' && obj.properties['fill-effect']) {
      convertFillEffect(obj.properties, defs);
    }
    if (obj.tag == 'image') {
      if (/\.svg/.test(obj.properties.href || '')) {
        convertSvgImage(obj, defs);
      }
    } else if (obj.children) {
      obj.children.forEach(procNode);
    }
  }
}

function convertSvgImage(obj, defs) {
  // Same-origin policy prevents embedding images in the web UI
  var href = obj.properties.href;
  // look for a previously added definition to use
  // (assumes that images that share the same href can also use the same defn)
  var item = utils.find(defs, function(item) {return item.href == href;});
  if (!item) {
    item = {
      href: href,
      id: urlToId(href) // generating id from href, to try to support multiple inline svgs on page
    };
    item.svg = serializeSvgImage(href, item.id);
    defs.push(item);
  }
  if (item.svg) {
    obj.tag = 'use';
    obj.properties.href = '#' + item.id;
  } else {
    // no svg property means the image was not able to be converted to a defn
    // -- it will be serialized as a regular inline image
  }
}

// Returns the content of an SVG file from a local path or URL
// Returns '' if unable to get the content (e.g. due to cross-domain security rules)
function serializeSvgImage(href, id) {
  var svg = '';
  try {
    // try to download the SVG content and use that
    svg = convertSvgToDefn(getSvgContent(href), id) + '\n';
    svg = '<!-- ' + href + '-->\n' + svg; // add href as a comment, to aid in debugging
  } catch(e) {
    // tried creating a symbol as a fallback... encounted problems with icon
    // size and placement, giving up on this for now
    // svg = `<symbol><image xlink:href="${obj.properties.href}" id="${id}"></image></symbol>`;
  }
  return svg;
}

// href: A URL or a local path
// TODO: download SVG files asynchronously
// (currently, files are downloaded synchronously, which is obviously undesirable)
//
function getSvgContent(href) {
  var content;
  if (href.indexOf('http') === 0) {
    content = fetchFileSync(href);
  } else if (require('fs').existsSync(href)) {
    content = require('fs').readFileSync(href, 'utf8');
  } else {
    stop("Invalid SVG location:", href);
  }
  return content;
}

function convertSvgToDefn(svg, id) {
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
