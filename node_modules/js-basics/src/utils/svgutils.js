/* @requires core */

Utils.parseSVG = function(svg) {
  // if (!(/^\s*<svg/i).test(svg)) {
  if (!(/<svg/i).test(svg)) {
   trace("[Utils.parseSVG()] Received an SVG fragment, wrapping in <svg> tag -- not ideal.");
    svg = '<svg height="14pt" width="28pt" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
      + svg + '</svg>';
  }
  var svgDoc = new DOMParser().parseFromString(svg, 'application/xml');
  var el = document.importNode(svgDoc.documentElement, true);
  return el;
};

