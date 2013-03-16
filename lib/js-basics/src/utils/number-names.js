/* @require core */

Utils.intToWord = function(i, capitalise) {
  var units = "Zero,One,Two,Three,Four,Five,Six,Seven,Eight,Nine";
  var tens = "Ten,Twenty,Thirty,Forty,Fifty,Sixty,Seventy,Eighty,Ninety";
  var teens = "Ten,Eleven,Twelve,Thirteen,Fourteen,Fifteen,Sixteen,Seventeen,Eighteen,Nineteen";
  var str = "";
  if (i >= 10 && i < 20) {
    str = teens.split(',')[(i-10)%10]
  }
  else if (i >= 0 && i < 100) {
    var unit = i%10;
    var unitStr = units.split(',')[unit];
    if ( i >= 20) {
      str = tens.split(',')[Math.round(i / 10)] + (unit == 0 ? "" : " " + unitStr)
    }
    else {
      str = unitStr;
    }
  }

  if (!capitalise) {
    str = str.toLowerCase();
  }
  return str;
}
