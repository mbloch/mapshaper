
export function getMode(values) {
  var data = getModeData(values);
  return data.modes[0];
}

function getValueCountData(values) {
  var uniqValues = [],
      uniqIndex = {},
      counts = [];
  var i, val;
  for (i=0; i<values.length; i++) {
    val = values[i];
    if (val in uniqIndex === false) {
      uniqIndex[val] = uniqValues.length;
      uniqValues.push(val);
      counts.push(1);
    } else {
      counts[uniqIndex[val]]++;
    }
  }
  return {
    values: uniqValues,
    counts: counts
  };
}

function getMaxValue(values) {
  var max = -Infinity;
  var i;
  for (i=0; i<values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  return max;
}

function getCountDataSummary(o) {
  var counts = o.counts;
  var values = o.values;
  var maxCount = counts.length > 0 ? getMaxValue(counts) : 0;
  var nextCount = 0;
  var modes = [];
  var i, count;
  for (i=0; i<counts.length; i++) {
    count = counts[i];
    if (count === maxCount) {
      modes.push(values[i]);
    } else if (count > nextCount) {
      nextCount = count;
    }
  }
  return {
    modes: modes,
    margin: modes.length > 1 ? 0 : maxCount - nextCount,
    count: maxCount
  };
}

export function getModeData(values, verbose) {
  var counts = getValueCountData(values);
  var modes = getCountDataSummary(counts);
  if (verbose) {
    modes.counts = counts.counts;
    modes.values = counts.values;
  }
  return modes;
}
