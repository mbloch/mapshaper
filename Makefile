
all:
	./build
	./node_modules/.bin/catty -d src,lib src/gui/mapshaper-gui.js | \
	./node_modules/.bin/browserify - -o www/mapshaper.js