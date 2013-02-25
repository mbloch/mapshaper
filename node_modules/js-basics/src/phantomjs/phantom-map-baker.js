/* @requires phantom-capture */


var args = Phantom.arguments;

console.log("args: " + args.join(", "))

if (args.length < 2) {
  console.log("[phantom-lib] Pass the url of page to load as an argument.");
  phantom.exit(1);
}
else {
  var url = args[1];
  PhantomLib.captureMap(url);
}