// How an aspect ratio is read and written, in one place. The Add map frame
// dialog takes one typed into a field and the Frame properties panel shows the
// one a frame ended up with, so a ratio entered as 3:2 reads back as 3:2.

// Ratios common enough to be worth naming when one is shown.
var namedRatios = [
  [1, '1:1'],
  [4 / 3, '4:3'],
  [3 / 2, '3:2'],
  [16 / 9, '16:9']
];

// Accepts "5:4" or a bare number. Returns NaN for anything else, including a
// ratio with a zero or negative term.
export function parseFrameAspectRatio(value) {
  var parts = String(value).trim().split(':').map(Number);
  if (parts.length == 2) {
    return parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : NaN;
  }
  return parts.length == 1 ? parts[0] : NaN;
}

// "3:2" for a ratio that has a name, "1.62" for one that does not.
export function formatFrameAspectRatio(aspect) {
  var match = namedRatios.find(function(item) {
    return Math.abs(item[0] - aspect) < 1e-10;
  });
  return match ? match[1] : String(Math.round(aspect * 100) / 100);
}
