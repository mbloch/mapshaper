/** @requires us-primary-2012, arrayutils, loading.jsonp */

if (true) {
	cssHome = "";
	webHome = "";

	//flashHome = "http://mbloch/swf/";
  flashHome = "http://mbloch/js/mb/lib/";
	Hybrid.preferFlash(false);
}

Opts.exportObject("nytg.tracing.enabled", true);
Opts.exportObject("nytg.Utils", Utils);
Opts.exportObject("nytg.map.JsonPLoader", JsonPLoader);
Opts.exportObject("nytg.tracing.enabled", true);

trace("[us-primary-2012-local]; nytg.map:", nytg.map);

