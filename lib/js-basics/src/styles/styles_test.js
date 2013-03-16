/* @require styles */

test("CSS color formatting", testColors);

function testColors() {

  equal(getCSSColor("#123"), "#123", 'input: "#123"');
  equal(getCSSColor("#012345"), "#012345", 'input: "#012345"');
  equal(getCSSColor("#000", 0.5), "rgba(0,0,0,0.5)", 'input: ("#000", 0.5)');
  equal(getCSSColor("#ffffff", 1), "#ffffff", 'input: ("#ffffff", 1)');
  equal(getCSSColor("#010210", 0.9), "rgba(1,2,16,0.9)", 'input: ("#010210", 0.9)');
  equal(getCSSColor(0xffffff, 0.05), "rgba(255,255,255,0.05)", 'input: (0xffffff, 0.05)');
  equal(getCSSColor(0xffffff, 0), "#ffffff", 'input: (0xffffff, 0)');
  equal(getCSSColor(0x0, 1), "#000000", 'input: (0x0, 1)');
}


