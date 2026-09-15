// State of a label curve being drawn, and the operations the curvature tool
// performs on it.
//
// Knots are held in the map's display coordinates, not in pixels, so that a
// half-drawn curve stays where the user put it across a pan or a zoom. They are
// converted to the layer's own coordinates once, when the command is emitted,
// and nothing is written until then: an abandoned curve leaves no data
// mutation, no undo entry and no session history entry.
//
// The distance thresholds are therefore the caller's to supply, in the same
// space as the knots -- the tool scales its pixel thresholds by the current
// pixel size. The defaults below are the pixel values, for callers working in
// screen space.
//
// Written as functions over a plain object rather than as a class, so that
// every transition can be tested without a map, a layer or a DOM.
//
// See docs/development/label-tool-design.md.

// A click closer than this to the previous knot is treated as a stray rather
// than a new knot. It also absorbs the second click of a double-click, which is
// how a curve is finished.
export var MIN_KNOT_DISTANCE = 4;

// How close the pointer has to be to a placed knot to grab it.
export var KNOT_HIT_THRESHOLD = 8;

export function createCurveState() {
  // justPlaced is the knot the current pointer gesture placed, or -1. A
  // double-click arrives as clicks first, so the knot under the pointer during
  // the dblclick is usually one that the same gesture just created; the two
  // cases mean opposite things and this is what tells them apart.
  return {knots: [], justPlaced: -1};
}

// Returns true if the knot was added. A click too close to the previous knot is
// rejected rather than producing a zero-length curve segment.
export function addKnot(state, p, minDistance) {
  var min = minDistance === undefined ? MIN_KNOT_DISTANCE : minDistance;
  var last = lastKnot(state);
  if (!isValidPoint(p)) return false;
  if (last && distance(last, p) < min) return false;
  state.knots.push([p[0], p[1]]);
  return true;
}

export function moveKnot(state, i, p) {
  if (!isValidPoint(p) || !(i >= 0 && i < state.knots.length)) return false;
  state.knots[i] = [p[0], p[1]];
  return true;
}

export function removeLastKnot(state) {
  if (state.knots.length === 0) return false;
  state.knots.pop();
  return true;
}

// Index of the placed knot nearest @p within @threshold, or -1. Searches from
// the end, so the most recently placed of two overlapping knots wins.
export function findKnotNear(state, p, threshold) {
  var limit = threshold === undefined ? KNOT_HIT_THRESHOLD : threshold;
  var best = -1;
  var bestDist = limit;
  var d, i;
  if (!isValidPoint(p)) return -1;
  for (i = state.knots.length - 1; i >= 0; i--) {
    d = distance(state.knots[i], p);
    if (d <= bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// Two knots make a straight label; one makes nothing worth keeping.
export function curveIsComplete(state) {
  return state.knots.length >= 2;
}

// What a click at @p does to the curve, and does to it here: 'added' if it
// placed a knot, 'ignored' if it landed on a knot that is already there or too
// close to the last one.
//
// A click on a placed knot must not leave a duplicate knot behind: the curve
// fitter would have a zero-length chord to find a direction along.
export function handleClick(state, p, hitThreshold, minDistance) {
  var near = findKnotNear(state, p, hitThreshold);
  if (near > -1) {
    // Clicking a knot this gesture did not place ends the gesture's claim on
    // whatever it placed before, so that a double-click on an already-placed
    // knot is not read as finishing.
    if (near !== state.justPlaced) state.justPlaced = -1;
    return 'ignored';
  }
  if (!addKnot(state, p, minDistance)) {
    state.justPlaced = -1;
    return 'ignored';
  }
  state.justPlaced = state.knots.length - 1;
  return 'added';
}

// What a double-click at @p means: 'finish' to end the curve here, or 'none'.
//
// Double-clicking empty map finishes, and the knot the opening click placed
// counts as empty map -- that click is how the ordinary finishing gesture
// starts, so without the exception it would land on a knot every time.
//
// A double-click on a knot that was already there does nothing. It cannot add
// one, since the knot is in the way, and finishing on it would end the curve
// somewhere other than where the pointer was when the gesture began.
export function getDblclickAction(state, p, hitThreshold) {
  var near = findKnotNear(state, p, hitThreshold);
  if (state.knots.length === 0) return {action: 'none'};
  if (near > -1 && near !== state.justPlaced) return {action: 'none'};
  return {action: 'finish'};
}

// Forgets which knot the current gesture placed, e.g. after a knot is removed
// and the indexes no longer line up.
export function clearGesture(state) {
  state.justPlaced = -1;
}

function lastKnot(state) {
  return state.knots.length > 0 ? state.knots[state.knots.length - 1] : null;
}

function distance(a, b) {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
}

function isValidPoint(p) {
  return !!p && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]);
}
