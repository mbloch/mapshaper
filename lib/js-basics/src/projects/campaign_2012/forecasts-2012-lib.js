/* @requires colorutils, core, arrayutils */
/* ==old==  state-names, state-fips, html-popup, textutils, albersusa-special, core.dev, dateutils, toggle-buttons, map-core-flash, map-core-notiles, canvas-bubble-optimizations, shapes.mshp, notiles-labels, loading.jsonp  */



var ratingIndex = {
  "Solid Democratic" : 0,
  "Leaning Democratic" : 1,
  "Tossup" : 2,
  "Leaning Republican" : 3,
  "Solid Republican" : 4
};



var ratingsLabels = ["Solid Obama", "Leaning Obama", "Tossup", "Leaning Romney", "Solid Romney"];

//var ratingColors = [0x2d6594, 0x4779a6, 0xf4daa2, 0xE05B58, 0xd24432];CC4444
var ratingColors = [0x2C658C, 0x4779a6, 0xf4daa2, 0xDD6666, 0xCC4242];

var ratingHatches = [undefined, 0x9fc6e8, 0xFFF4D7, 0xFCB6B6, undefined];
var ratingAlpha = [1, 1, 1, 1, 1];
var useAlphaAdjustment = !Browser.ie || Browser.ieVersion > 8;
var bgCol = 0xf5f5f4; // 0xffffff;
if (useAlphaAdjustment) {
  Utils.forEach(ratingColors, function(rgb, i) {
    var col = Color.getOverlayColor(rgb, bgCol, 0);
    ratingColors[i] = col.rgb;
    var alpha = col.alpha;;
    ratingAlpha[i] = alpha > 0.7 ? 0.7 : alpha;
    if (ratingHatches[i]) {
      col = Color.getOverlayColor(ratingHatches[i], bgCol, 0.9);
      //ratingHatches[i] = col.rgb;
    }
  });
}

var noDataCol = 0xe3e3e3;
var noDataHatch = null;

function getRatingLabel(rating) {
  var idx = ratingIndex[rating];
  return idx === undefined ? "" : ratingsLabels[idx];
}

function calcNoRating(rec) {
  return !(rec.get('rating') in ratingIndex);
}

function calcHatchColor(rec) {
  //var rating = rec.id % 5 + 1;
  //return ratingHatches[ratingIndex[rating]];
  var rating = rec.get('rating');
  var idx = ratingIndex[rating];
  return idx == null ? noDataHatch : ratingHatches[idx];
}

function calcFillColor(rec) {
  //var rating = rec.id % 5 + 1;
  var rating = rec.get('rating');
  var idx = ratingIndex[rating];
  return idx === undefined ? noDataCol : ratingColors[idx];
}

function calcFillAlpha(rec) {
  var rating = rec.get('rating');
  var idx = ratingIndex[rating];
  var alpha = idx === undefined ? 0 : ratingAlpha[idx];
  return alpha; 
}