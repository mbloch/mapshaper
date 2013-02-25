/* @requires core */

Utils.getOrdinalSuffix = getOrdinalSuffix;

function getOrdinalSuffix(val) {
  val = parseInt(val, 10); // make sure we have an integer or NaN
  var oneD = val % 10;
  var twoD = val % 100;
  if ( isNaN(val) || val < 0 ) {
    var suff = "";
  }
  else if ( twoD == 11 || twoD == 12 || twoD == 13 ) { // handle 11, 12, 13, 111, 112, 113, ...
    suff = "th";
  }
  else if ( oneD == 1) { // handle 1, 21, 31, 41, etc
    suff = "st";
  }
  else if ( oneD == 2 ) { // handle 2, 22, 32, ... , 102, 122, ...
    suff = "nd";
  }
  else if (oneD == 3 ) { // handle 3, 23, 
    suff = "rd";
  }
  else {
    suff = "th"; // handle 0, 4, 5, 6, ...
  }

  return suff;
}

/*
var Ordinal = {
  ones: "zeroth,first,second,third,fourth,fifth,sixth,seventh,eighth,ninth,tenth,eleventh,twelfth,thirteenth,fourteenth,fifteenth,sixteenth,seventeenth,eighteenth,nineteenth".split(','),
  tenths: "tenth,twentieth,thirtieth,fourtieth,fiftieth,sixtieth,seventieth,eightieth,ninetieth".split(','),
  tens: "ten,twenty,thirty,forty,fifty,sixty,seventy,eighty,ninety".split(',')
};

function getOrdinalText(val) {  

}
*/


