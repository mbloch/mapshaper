/* @requires format */

(function() {
  //var fmt5 = "percentage: %.1d%, count:%i, change:%+.2f. %s %x ";

  test("Integer formatting", testIntegers);
  test("Float formatting", testFloats);
  test("Hex formatting", testHex);
  test("String formatting", testStrings);

  var minus = "\u2212";

  function testStrings() {
    var fmt1 = "%s";
    var fmt2 = "%9s";
    var fmt3 = "%04s";

    var val1 = "";
    var val2 = "abc";
    var val3 = " ";
    var val4 = "hello, world!";

  }

  function testHex() {
    var fmt1 = "%x";
    var fmt2 = "%X";
    var fmt3 = "%06x";

    var val1 = 0;
    var val2 = 0xfaacc;
    var val3 = 0x100;
    var val4 = 0xabcdef0;

    equal(Utils.format(fmt1, val1), "0");
    equal(Utils.format(fmt1, val2), "faacc");
    equal(Utils.format(fmt1, val3), "100");
    equal(Utils.format(fmt1, val4), "abcdef0");

    equal(Utils.format(fmt2, val1), "0");
    equal(Utils.format(fmt2, val2), "FAACC");
    equal(Utils.format(fmt2, val3), "100");
    equal(Utils.format(fmt2, val4), "ABCDEF0");

    equal(Utils.format(fmt3, val1), "000000");
    equal(Utils.format(fmt3, val2), "0faacc");
    equal(Utils.format(fmt3, val3), "000100");
    equal(Utils.format(fmt3, val4), "abcdef0");

  }

  function testFloats() {
    var fmt1 = "%f";
    var fmt2 = "%.3f";
    var fmt3 = "%5.1f";
    var fmt4 = "%07.3f";
    var fmt5 = "%'7f";
    
    var val1 = 0;
    var val2 = 99999;
    var val3 = 0.002;
    var val4 = 319.2;
    var val5 = 1.49999999;
    var val6 = -2.05;
    var val7 = 162.295;

    equal(Utils.format("%.2f", -0.002), "0.00");
    equal(Utils.format("%.2f", 162.295), "162.30");
    equal(Utils.format("%.2f", -162.295), minus + "162.30");

    equal(Utils.format("%'f", 999.66), "999.66");
    equal(Utils.format("%'f", 1000.1), "1,000.1");
    equal(Utils.format("%'f", 1000), "1,000");
    equal(Utils.format("%'f", 10000.1), "10,000.1");
    equal(Utils.format("%'f", 100000.1), "100,000.1");
    equal(Utils.format("%'f", 1000000.1), "1,000,000.1");

    equal(Utils.format(fmt1, val1), "0");
    equal(Utils.format(fmt1, val2), "99999");
    equal(Utils.format(fmt1, val3), "0.002");
    equal(Utils.format(fmt1, val4), "319.2");
    equal(Utils.format(fmt1, val5), "1.49999999");
    equal(Utils.format(fmt1, val6), minus + "2.05");

    equal(Utils.format(fmt2, val1), "0.000");
    equal(Utils.format(fmt2, val2), "99999.000");
    equal(Utils.format(fmt2, val3), "0.002");
    equal(Utils.format(fmt2, val4), "319.200");
    equal(Utils.format(fmt2, val5), "1.500");
    equal(Utils.format(fmt2, val6), minus + "2.050");

    equal(Utils.format(fmt3, val1), "  0.0");
    equal(Utils.format(fmt3, val2), "99999.0");
    equal(Utils.format(fmt3, val3), "  0.0");
    equal(Utils.format(fmt3, val4), "319.2");
    equal(Utils.format(fmt3, val5), "  1.5");
    equal(Utils.format(fmt3, val6), ' ' + minus + "2.1");

    equal(Utils.format(fmt4, val1), "000.000");
    equal(Utils.format(fmt4, val2), "99999.000");
    equal(Utils.format(fmt4, val3), "000.002");
    equal(Utils.format(fmt4, val4), "319.200");
    equal(Utils.format(fmt4, val5), "001.500");
    equal(Utils.format(fmt4, val6), minus + "02.050");

    equal(Utils.format(fmt5, val1), "      0");
    equal(Utils.format(fmt5, val2), " 99,999");
    equal(Utils.format(fmt5, val3), "  0.002");
    equal(Utils.format(fmt5, val4), "  319.2");
    equal(Utils.format(fmt5, val5), "1.49999999");
    equal(Utils.format(fmt5, val6), '  ' + minus + "2.05");

  }

  function testIntegers() {
    var fmt1 = "%d";
    var fmt2 = "%i";
    var fmt3 = "%+d";
    var fmt4 = "%'d";
    var fmt5 = "%6d";
    var fmt6 = "%06d";
    var fmt7 = "%+0'2.3d";
    var val1 = 0;
    var val2 = 1000;
    var val3 = -9;
    var val4 = -1234567890;
    var val5 = 111222333;

    equal(Utils.format(fmt1, val1), '0');
    equal(Utils.format(fmt2, val2), '1000');
    equal(Utils.format(fmt1, val3), minus + '9');
    equal(Utils.format(fmt2, val4), minus + '1234567890');

    equal(Utils.format(fmt3, val1), '0');
    equal(Utils.format(fmt3, val2), '+1000');
    equal(Utils.format(fmt3, val3), minus + '9');
    equal(Utils.format(fmt3, val4), minus + '1234567890');

    equal(Utils.format(fmt4, val1), '0');
    equal(Utils.format(fmt4, val2), '1,000');
    equal(Utils.format(fmt4, val3), minus + '9');
    equal(Utils.format(fmt4, val4), minus + '1,234,567,890');
    equal(Utils.format(fmt4, val5), '111,222,333');

    equal(Utils.format(fmt5, val1), '     0');
    equal(Utils.format(fmt5, val2), '  1000');
    equal(Utils.format(fmt5, val3), '    ' + minus + '9');
    equal(Utils.format(fmt5, val4), minus + '1234567890');

    equal(Utils.format(fmt6, val1), '000000');
    equal(Utils.format(fmt6, val2), '001000');
    equal(Utils.format(fmt6, val3), minus + '00009');
    equal(Utils.format(fmt6, val4), minus + '1234567890');

    equal(Utils.format(fmt7, val1), '00');
    equal(Utils.format(fmt7, val2), '+1,000');
    equal(Utils.format(fmt7, val3), minus + '9');
    equal(Utils.format(fmt7, val4), minus + '1,234,567,890');

    //equal(Utils.format(fmt5, 1001.25, -98, 32.0, 'extra', 488), "percentage: 1001.3, count:-98, change:+32.00.");
   
  }

})();