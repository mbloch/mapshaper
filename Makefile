
all:
	./build
	catty -d lib,src src/gui/mapshaper-gui.js | browserify - -o www/mapshaper.js