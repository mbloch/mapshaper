/* @requires dateutils */

(function() {
  var fmt1 = "%Y-%m-%d %H:%M";
  var fmt2 = "%m/%d/%Y";

  test(fmt1 + " (String -> Date -> String)", testFormatOne );
  test(fmt1 + " (S->D->S invalid input)", testFormatOnePartTwo );

  test(fmt2 + " (String -> Date -> String)", testFormatTwo );


  function backDate( dateStr, fmt ) {
    var d = DateString.parseDate( dateStr, fmt );
    return DateString.formatDate( d, fmt );
  }

  function testFormatOnePartTwo() {
    var d1 = "2010-01-01 0:00";
    equal( backDate( d1, fmt1), "2010-01-01 00:00", "input: " + d1 );
    var d3 = "2010-12-31 24:00";
    equal( backDate( d3, fmt1), "", "Invalid input: " + d3 ); // dies
  }

  function testFormatOne() {
    var d1 = "2010-01-01 00:00";
    equal( backDate( d1, fmt1), d1, "input: " + d1 );

    var d2 = "2010-12-31 23:59";
    equal( backDate( d2, fmt1), d2,   "input: " + d2 );

    var d4 = "1987-02-11 20:00";
    equal( backDate( d4, fmt1), d4,  "input: " + d4 );
  }

  function testFormatTwo() {
    var d10 = "1/31/1989";
    equal( backDate( d10, fmt2), d10,  "input: " + d10 );
    var d11 = "2/1/2000";// Jan. 23, 2010";
    equal( backDate( d11, fmt2), d11,  "input: " + d11 );
    var d12 = "12/31/2011";
    equal( backDate( d12, fmt2), d12,  "input: " + d12 );
  }

})();
