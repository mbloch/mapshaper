/* @requires core */

Utils.getOrdinalSuffix = function(val) {
  val = parseInt(val); // make sure we have an integer or NaN
  var oneD = val % 10,
      twoD = val % 100,
      suff;
  if (isNaN(val) || val < 0) {
    var suff = "";
  }
  else if (twoD == 11 || twoD == 12 || twoD == 13) { // handle 11, 12, 13, 111, 112, 113 ...
    suff = "th";
  }
  else if (oneD == 1) { // handle 1, 21, 31, 41. ..
    suff = "st";
  }
  else if (oneD == 2) { // handle 2, 22, 32, ... , 102, 122 ...
    suff = "nd";
  }
  else if (oneD == 3) { // handle 3, 23 33, ...
    suff = "rd";
  }
  else {
    suff = "th"; // handle 0, 4, ...
  }

  return suff;
}

// Returns strings like: "1st" "2nd" "40th" "152nd"
//
Utils.formatOrdinal = function(val) {
  var i = parseInt(val);
  return i + Utils.getOrdinalSuffix(i);
}


