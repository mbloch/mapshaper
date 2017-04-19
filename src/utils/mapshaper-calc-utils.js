/* @requires mapshaper-common */

internal.getMode = function(values) {
  var data = internal.getModeData(values);
  return data.modes[0];
};

internal.getModeData = function(values) {
  var maxCount = 0, nextCount = 0,
      uniq = [],
      modes = [],
      counts = {},
      val, i, count, margin;
  if (values.length == 1) {
    return {modes: values, margin: 1};
  }
  // get max count and array of uniq values
  for (i=0; i<values.length; i++) {
    val = values[i];
    if (val in counts === false) {
      count = 0;
      uniq.push(val);
    } else {
      count = counts[val];
    }
    counts[val] = ++count;
    if (count > maxCount) maxCount = count;
  }
  // get mode values (may be multiple) and margin
  margin = maxCount;
  for (i=0; i<uniq.length; i++) {
    count = counts[uniq[i]];
    if (count === maxCount) {
      modes.push(uniq[i]);
    } else if (count > nextCount) {
      nextCount = count;
    }
  }
  return {
    modes: modes,
    margin: modes.length > 1 ? 0 : maxCount - nextCount
  };
};
