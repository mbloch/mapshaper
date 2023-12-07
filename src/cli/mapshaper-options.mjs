import * as V from '../cli/mapshaper-option-validation';
import { error } from '../utils/mapshaper-logging';
import { CommandParser } from '../cli/mapshaper-command-parser';

export function getOptionParser() {
  // definitions of options shared by more than one command
  var targetOpt = {
        describe: 'layer(s) to target (comma-sep. list)'
      },
      nameOpt = {
        describe: 'rename the edited layer(s)'
      },
      noReplaceOpt = {
        alias: '+',
        type: 'flag',
        label: '+, no-replace', // show alias as primary option
        describe: 'retain both input and output layer(s)'
      },
      nameOpt2 = { // for -calc and -info
        describe: 'name the output layer'
      },
      noReplaceOpt2 = { // for -calc and -info
        alias: '+',
        type: 'flag',
        label: '+',
        describe: 'save output to a new layer'
      },
      noSnapOpt = {
        // describe: 'don't snap points before applying command'
        type: 'flag'
      },
      encodingOpt = {
        describe: 'text encoding (applies to .dbf and delimited text files)'
      },
      snapIntervalOpt = {
        describe: 'snapping distance in source units (default is tiny)',
        type: 'distance'
      },
      minGapAreaOpt = {
        old_alias: 'min-gap-area',
        describe: 'threshold for filling gaps, e.g. 1.5km2 (default is small)',
        type: 'area'
      },
      sliverControlOpt = {
        describe: 'boost gap-fill-area of slivers (0-1, default is 1)',
        type: 'number'
      },
      calcOpt = {
        describe: 'use a JS expression to aggregate data values'
      },
      sumFieldsOpt = {
        describe: 'fields to sum when dissolving  (comma-sep. list)',
        type: 'strings'
      },
      copyFieldsOpt = {
        describe: 'fields to copy when dissolving (comma-sep. list)',
        type: 'strings'
      },
      dissolveFieldsOpt = {
        DEFAULT: true,
        type: 'strings',
        describe: '(optional) field(s) to dissolve on (comma-sep. list)'
      },
      fieldTypesOpt = {
        describe: 'type hints for csv source files, e.g. FIPS:str,ZIPCODE:str',
        type: 'strings'
      },
      stringFieldsOpt = {
        describe: 'csv field(s) to import as strings, e.g. FIPS,ZIPCODE',
        type: 'strings'
      },
      bboxOpt = {
        type: 'bbox',
        describe: 'comma-sep. bounding box: xmin,ymin,xmax,ymax'
      },
      invertOpt = {
        type: 'flag',
        describe: 'retain only features that would have been deleted'
      },
      whereOpt = {
        describe: 'use a JS expression to select a subset of features'
      },
      whereOpt2 = {
        describe: 'filter polygon boundaries using a JS expression (with A and B)'
      },
      eachOpt2 = {
        describe: 'apply a JS expression to each polygon boundary (with A and B)'
      },
      aspectRatioOpt = {
        describe: 'aspect ratio as a number or range (e.g. 2 0.8,1.6 ,2)'
      },
      offsetOpt = {
        describe: 'padding as distance or pct of h/w (single value or list)',
        type: 'distance'
      };

  var parser = new CommandParser();
  parser.usage('Usage:  mapshaper -<command> [options] ...');

  /*
  parser.example('Fix minor topology errors, simplify to 10%, convert to GeoJSON\n' +
      '$ mapshaper states.shp snap -simplify 10% -o format=geojson');

  parser.example('Aggregate census tracts to counties\n' +
      '$ mapshaper tracts.shp -each \'CTY_FIPS=FIPS.substr(0, 5)\' -dissolve CTY_FIPS');
  */

  parser.note('Enter mapshaper -help <command> to view options for a single command');

  parser.section('I/O commands');

  parser.default('i');

  parser.command('i')
    .describe('input one or more files')
    .validate(V.validateInputOpts)
    .option('files', {
      DEFAULT: {
        multi_arg: true,
        type: 'string'
      },
      type: 'strings',
      describe: 'one or more files to import, or - to use stdin'
    })
    .option('combine-files', {
      describe: 'import files to separate layers with shared topology',
      type: 'flag'
    })
    .option('merge-files', {
      // describe: 'merge features from compatible files into the same layer',
      type: 'flag'
    })
    .option('no-topology', {
      describe: 'treat each shape as topologically independent',
      type: 'flag'
    })
    .option('precision', {
      describe: 'coordinate precision in source units, e.g. 0.001',
      type: 'number'
    })
    .option('snap', {
      type: 'flag',
      describe: 'snap nearly identical points to fix minor topology errors'
    })
    .option('auto-snap', {alias_to: 'snap'})
    .option('snap-interval', snapIntervalOpt)
    .option('encoding', encodingOpt)
    /*
    .option('fields', {
      describe: 'attribute fields to import (comma-sep.) (default is all fields)',
      type: 'strings'
    }) */
    .option('id-field', {
      describe: 'import Topo/GeoJSON id property to this field'
    })
    .option('string-fields', stringFieldsOpt)
    .option('field-types', fieldTypesOpt)
    .option('name', {
      describe: 'rename the imported layer(s)'
    })
    .option('geometry-type', {
      // undocumented; GeoJSON import rejects all but one kind of geometry
      // describe: '[GeoJSON] Import one kind of geometry (point|polygon|polyline)'
    })
    .option('json-path', {
      // describe: path to an array of data values
    })
    .option('csv-skip-lines', {
      type: 'integer',
      describe: '[CSV] number of lines to skip at the beginning of the file'
    })
    .option('csv-lines', {
      type: 'integer',
      describe: '[CSV] number of data records to read'
    })
    .option('csv-field-names', {
      type: 'strings',
      describe: '[CSV] comma-sep. list of field names to assign each column'
    })
    .option('csv-dedup-fields', {
      type: 'flag',
      describe: '[CSV] rename fields with duplicate names'
    })
    .option('csv-filter', {
      describe: '[CSV] JS expression for filtering records'
    })
    .option('csv-fields', {
      type: 'strings',
      describe: '[CSV] comma-sep. list of fields to import'
    })
    // .option('csv-comment', {
    //   describe: '[CSV] comment line character(s)'
    // })
    .option('decimal-comma', {
      type: 'flag',
      describe: '[CSV] import numbers formatted like 1.000,01 or 1 000,01'
    })
    .option('json-path', {
      old_alias: 'json-subtree',
      describe: '[JSON] path to JSON input data; separator is /'
    })
    .option('single-part', {
      type: 'flag',
      // describe: '[GeoJSON] split multi-part features into single-part features'
    });

  parser.command('o')
    .describe('output edited content')
    .validate(V.validateOutputOpts)
    .option('_', {
      label: '<file|directory>',
      describe: '(optional) name of output file or directory, - for stdout',
      DEFAULT: {
        multi_error_msg: 'Command takes one file or directory argument.'
      }
    })
    .option('format', {
      describe: 'options: shapefile,geojson,topojson,json,dbf,csv,tsv,svg'
    })
    .option('target', targetOpt)
    .option('force', {
      describe: 'allow overwriting input files',
      type: 'flag'
    })
    .option('gzip', {
      describe: 'apply gzip compression to output files',
      type: 'flag'
    })
   .option('zip', {
      describe: 'save all output files in a single .zip file',
      type: 'flag'
    })
    .option('dry-run', {
      // describe: 'do not output any files'
      type: 'flag'
    })
    .option('ldid', {
      // describe: 'language driver id of dbf file',
      type: 'number'
    })
    .option('precision', {
      describe: 'coordinate precision in source units, e.g. 0.001',
      type: 'number'
    })
    .option('bbox-index', {
      describe: 'export a .json file with bbox of each layer',
      type: 'flag'
    })
    .option('cut-table', {
      describe: 'detach data attributes from shapes and save as a JSON file',
      type: 'flag'
    })
    .option('drop-table', {
      describe: 'remove data attributes from output',
      type: 'flag'
    })
    .option('encoding', {
      describe: '[Shapefile/CSV] text encoding (default is utf8)'
    })
    .option('field-order', {
      describe: '[Shapefile/CSV] field-order=ascending sorts columns A-Z'
    })
    .option('id-field', {
      describe: '[Topo/GeoJSON/SVG] field to use for id property',
      type: 'strings'
    })
    .option('bbox', {
      type: 'flag',
      describe: '[Topo/GeoJSON] add bbox property'
    })
    .option('extension', {
      describe: '[Topo/GeoJSON] set file extension (default is ".json")'
    })
    .option('prettify', {
      type: 'flag',
      describe: '[Topo/GeoJSON/JSON] format output for readability'
    })
    .option('singles', {
      describe: '[TopoJSON] save each target layer as a separate file',
      type: 'flag'
    })
    .option('quantization', {
      describe: '[TopoJSON] specify quantization (auto-set by default)',
      type: 'integer'
    })
    .option('no-quantization', {
      describe: '[TopoJSON] export coordinates without quantization',
      type: 'flag'
    })
    .option('metadata', {
      // describe: '[TopoJSON] Add a metadata object containing CRS information',
      type: 'flag'
    })
    .option('no-point-quantization', {
      // describe: '[TopoJSON] export point coordinates without quantization',
      type: 'flag'
    })
    .option('presimplify', {
      describe: '[TopoJSON] add per-vertex data for dynamic simplification',
      type: 'flag'
    })
    .option('topojson-precision', {
      // describe: 'pct of avg segment length for rounding (0.02 is default)',
      type: 'number'
    })
    // .option('winding', {
    //   describe: '[GeoJSON] set polygon winding order (use CW with d3-geo)'
    // })
    .option('gj2008', {
      describe: '[GeoJSON] use original GeoJSON spec (not RFC 7946)',
      type: 'flag'
    })
    .option('combine-layers', {
      describe: '[GeoJSON] output layers as a single file',
      type: 'flag'
    })
    .option('geojson-type', {
      describe: '[GeoJSON] FeatureCollection, GeometryCollection or Feature'
    })
    .option('hoist', {
      describe: '[GeoJSON] move properties to the root level of each Feature',
      type: 'strings'
    })
    .option('ndjson', {
      describe: '[GeoJSON/JSON] output newline-delimited features or records',
      type: 'flag'
    })
    .option('width', {
      describe: '[SVG/TopoJSON] pixel width of output (SVG default is 800)',
      type: 'number'
    })
    .option('height', {
      describe: '[SVG/TopoJSON] pixel height of output (optional)',
      type: 'number'
    })
    .option('max-height', {
      describe: '[SVG/TopoJSON] max pixel height of output (optional)',
      type: 'number'
    })
    .option('margin', {
      describe: '[SVG/TopoJSON] space betw. data and viewport (default is 1)'
    })
    .option('pixels', {
      describe: '[SVG/TopoJSON] output area in pix. (alternative to width=)',
      type: 'number'
    })
    .option('fit-bbox', {
      type: 'bbox',
      describe: '[TopoJSON] scale and shift coordinates to fit a bbox'
    })
    .option('svg-scale', {
      describe: '[SVG] source units per pixel (alternative to width= option)',
      type: 'number'
    })
    .option('svg-bbox', {
      describe: '[SVG] bounding box of SVG map in projected map units',
      type: 'bbox'
    })
    .option('point-symbol', {
      describe: '[SVG] circle or square (default is circle)'
    })
    .option('svg-data', {
      type: 'strings',
      describe: '[SVG] fields to export as data-* attributes'
    })
    .option('id-prefix', {
      describe: '[SVG] prefix for namespacing layer and feature ids'
    })
    .option('scalebar', {
      type: 'flag',
      // describe: '[SVG] add a scalebar showing scale at the center of the map'
    })
    .option('delimiter', {
      describe: '[CSV] field delimiter'
    })
    .option('decimal-comma', {
      type: 'flag',
      describe: '[CSV] export numbers with decimal commas not points'
    })
    .option('final', {
      type: 'flag' // for testing
    })
    .option('metadata', {
      // describe: '[TopoJSON] add a metadata object',
      type: 'flag'
    });

  parser.section('Editing commands');

  parser.command('affine')
    .describe('transform coordinates by shifting, scaling and rotating')
    .option('shift', {
      type: 'strings',
      describe: 'x,y offsets in source units (e.g. 5000,-5000)'
    })
    .option('scale', {
      type: 'number',
      describe: 'scale (default is 1)'
    })
    .option('rotate', {
      type: 'number',
      describe: 'angle of rotation in degrees (default is 0)'
    })
    .option('anchor', {
      type: 'numbers',
      describe: 'center of rotation/scaling (default is center of selected shapes)'
    })
    .option('where', whereOpt)
    .option('target', targetOpt);

  parser.command('buffer')
    // .describe('')
    .option('radius', {
      describe: 'radius of buffer, as an expression or a constant',
      DEFAULT: true
    })
    .option('tolerance', {
      // describe: 'acceptable deviation for approximating curves'
    })
    .option('vertices', {
      // describe: 'number of vertices to use when buffering points',
      type: 'integer'
    })
    .option('backtrack', {
      type: 'integer'
    })
    .option('type', {
      // left, right, outer, inner (default is full buffer)
    })
    .option('planar', {
      type: 'flag'
    })
    .option('v2', { // use v2 method
      type: 'flag'
    })
    .option('debug-division', {
      type: 'flag'
    })
    .option('debug-mosaic', {
      type: 'flag'
    })
    .option('no-cleanup', {
      type: 'flag'
    })
    .option('units', {
      describe: 'distance units (meters|miles|km|feet) (default is meters)'
    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('classify')
    // .describe('apply sequential or categorical classification')
    .describe('assign colors or values using one of several methods')
    .option('field', {
      describe: 'name of field to classify',
      DEFAULT: true
    })
    .option('save-as', {
        describe: 'name of output field (default is fill|stroke|class)'
    })
    .option('colors', {
      describe: 'list of CSS colors or color scheme name (see -colors)',
      type: 'colors'
    })
    .option('values', {
      describe: 'values to assign to classes (alternative to colors=)',
      type: 'strings'
    })
    .option('color-scheme', {
      // deprecated in favor of colors=
      // describe: 'name of a predefined color scheme (see -colors command)'
    })
    .option('non-adjacent', {
      describe: 'assign non-adjacent colors to a polygon layer',
      assign_to: 'method'
    })
    .option('stops', {
      describe: 'a pair of values (0-100) for limiting a color ramp',
      type: 'numbers'
    })
    .option('null-value', {
      describe: 'value (or color) to use for invalid or missing data'
    })
    .option('method', {
      describe: 'quantile, nice, equal-interval, categorical, etc.'
    })
    .option('quantile', {
      //describe: 'shortcut for method=quantile (the default)',
      assign_to: 'method'
    })
    .option('equal-interval', {
      //describe: 'short for method=equal-interval',
      assign_to: 'method'
    })
    .option('hybrid', {
      // describe: 'short for method=hybrid (equal-interval inner breaks + quantile outliers)',
      assign_to: 'method'
    })
    .option('nice', {
      //describe: 'short for method=nice (rounded, equal inner breaks)',
      assign_to: 'method'
    })
    .option('breaks', {
      describe: 'user-defined sequential class breaks',
      type: 'numbers'
    })
    .option('outer-breaks', {
      describe: 'min,max breakpoints, to limit the effect of outliers',
      old_alias: 'range',
      type: 'numbers'
    })
    .option('classes', {
      describe: 'number of classes (can be inferred from other options)',
      type: 'integer'
    })
    .option('invert', {
      describe: 'reverse the order of colors/values',
      type: 'flag'
    })
    .option('continuous', {
      describe: 'output interpolated values, for unclassed colors',
      type: 'flag'
    })
    .option('index-field', {
      describe: 'apply pre-calculated classes (0 ... n-1, -1)'
    })
    .option('precision', {
      describe: 'round data values before classification (e.g. 0.1)',
      type: 'number'
    })
    .option('categories', {
      describe: 'list of data values for categorical color scheme',
      type: 'strings'
    })
    .option('other', {
      describe: 'default value for categorical scheme'
    })
    .option('key', {type: 'flag'})
    .option('key-style', {
      describe: 'one of: simple, gradient, dataviz'
    })
    .option('key-name', {
      describe: 'name of output SVG file'
    })
    .option('key-width', {
      describe: 'width of key in pixels',
      type: 'number'
    })
    .option('key-font-size', {
      describe: 'label size in pixels',
      type: 'number'
    })
    .option('key-tile-height', {
      describe: 'height of color tiles in pixels',
      type: 'number'
    })
    .option('key-tic-length', {
      describe: 'length of tic mark in pixels'
    })
    .option('key-label-suffix', {
      describe: 'string to append to each label'
    })
    .option('key-last-suffix', {
      describe: 'string to append to last label'
    })
    .option('target', targetOpt);

  parser.command('clean')
    .describe('fixes geometry issues, such as polygon overlaps and gaps')
    .option('gap-fill-area', minGapAreaOpt)
    .option('sliver-control', sliverControlOpt)
    .option('snap-interval', snapIntervalOpt)
    .option('no-snap', noSnapOpt)
    .option('allow-overlaps', {
      describe: 'allow polygons to overlap (disables gap fill)',
      type: 'flag'
    })
    .option('overlap-rule', {
      describe: 'how to resolve overlaps: min-id|max-id|min-area|[max-area]'
    })
    .option('allow-empty', {
      describe: 'keep null geometries (removed by default)',
      type: 'flag'
    })
    .option('rewind', {
      describe: 'fix errors in the CW/CCW winding order of polygon rings',
      type: 'flag'
    })
    // TODO: consider making this the standard way of removing null geometry
    // (currently there's -filter remove-empty)
    // .option('empty', {
    //   describe: 'remove features with null geometry',
    //   type: 'flag'
    // })
    .option('arcs', { // old name for arcs-only
      alias_to: 'only-arcs'
    })
    .option('only-arcs', {
      describe: 'delete unused arcs but don\'t remove gaps and overlaps',
      type: 'flag'
    })
    .option('no-arc-dissolve', {
      type: 'flag' // no description
    })
    .option('target', targetOpt);

  parser.command('clip')
    .describe('use a polygon layer to clip another layer')
    .example('$ mapshaper states.shp -clip land_area.shp -o clipped.shp')
    .option('source', {
      DEFAULT: true,
      describe: 'file or layer containing clip polygons'
    })
    .option('remove-slivers', {
      describe: 'remove sliver polygons created by clipping',
      type: 'flag'
    })
    .option('bbox', bboxOpt)
    .option('bbox2', {
        type: 'bbox',
        describe: 'experimental fast bbox clipping'
      })
    .option('name', nameOpt)
    .option('no-snap', noSnapOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('colorizer')
    .describe('define a function to convert data values to color classes')
    .option('colors', {
      describe: 'comma-separated list of CSS colors',
      type: 'colors'
    })
    .option('breaks', {
      describe: 'ascending-order list of breaks for sequential color scheme',
      type: 'numbers'
    })
    .option('categories', {
      describe: 'comma-sep. list of keys for categorical color scheme',
      type: 'strings'
    })
    .option('random', {
      describe: 'randomly assign colors',
      type: 'flag'
    })
    .option('other', {
      describe: 'default color for categorical scheme (default is nodata color)'
    })
    .option('nodata', {
      describe: 'color to use for invalid or missing data (default is white)'
    })
    .option('name', {
      describe: 'function name to use in -each and -svg-style commands'
    })
    .option('precision', {
      describe: 'rounding precision to apply before classification (e.g. 0.1)',
      type: 'number'
    })
    .example('Define a sequential color scheme and use it to create a new field\n' +
        '$ mapshaper data.json -colorizer name=getColor nodata=#eee breaks=20,40 \\\n' +
        '  colors=#e0f3db,#a8ddb5,#43a2ca -each \'fill = getColor(RATING)\' -o output.json');

  parser.command('dashlines')
    .describe('split lines into sections, with or without a gap')
    .oldAlias('split-lines')
    .option('dash-length', {
      type: 'distance',
      describe: 'length of split-apart lines (e.g. 200km)'
    })
    .option('gap-length', {
      type: 'distance',
      describe: 'length of gaps between dashes (default is 0)'
    })
    .option('scaled', {
      type: 'flag',
      describe: 'scale dashes and gaps to prevent partial dashes'
    })
    .option('planar', {
      type: 'flag',
      describe: 'use planar geometry'
    })
    .option('where', whereOpt)
    .option('target', targetOpt);

  parser.command('define')
    // .describe('define expression variables')
    .option('expression', {
      DEFAULT: true,
      describe: 'one or more assignment expressions (comma-sep.)'
    });

  parser.command('dissolve')
    .describe('merge features within a layer')
    .example('Dissolve all polygons in a feature layer into a single polygon\n' +
      '$ mapshaper states.shp -dissolve -o country.shp')
    .example('Generate state-level polygons by dissolving a layer of counties\n' +
      '(STATE_FIPS, POPULATION and STATE_NAME are attribute field names)\n' +
      '$ mapshaper counties.shp -dissolve STATE_FIPS copy-fields=STATE_NAME sum-fields=POPULATION -o states.shp')
    .option('field', {}) // old arg handled by dissolve function
    .option('fields', dissolveFieldsOpt)
    .option('calc', calcOpt)
    .option('sum-fields', sumFieldsOpt)
    .option('copy-fields', copyFieldsOpt)
    .option('multipart', {
      type: 'flag',
      describe: 'make multipart features instead of dissolving'
    })
    .option('where', whereOpt)
    .option('group-points', {
      type: 'flag',
      describe: '[points] group points instead of converting to centroids'
    })
    .option('weight', {
      describe: '[points] field or expression to use for weighting centroid'
    })
    .option('planar', {
      type: 'flag',
      describe: '[points] use 2D math to find centroids of latlong points'
    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);


  parser.command('dissolve2')
    .describe('merge adjacent polygons (repairs overlaps and gaps)')
    .option('field', {}) // old arg handled by dissolve function
    .option('fields', dissolveFieldsOpt)
    // UPDATE: Use -mosaic command for debugging
    //.option('mosaic', {type: 'flag'}) // debugging option
    //.option('arcs', {type: 'flag'}) // debugging option
    //.option('tiles', {type: 'flag'}) // debugging option
    .option('calc', calcOpt)
    .option('sum-fields', sumFieldsOpt)
    .option('copy-fields', copyFieldsOpt)
    .option('gap-fill-area', {
      describe: 'threshold for filling gaps, e.g. 1.5km2',
      type: 'area'
    })
    .option('sliver-control', sliverControlOpt)
    .option('allow-overlaps', {
      describe: 'allow dissolved polygons to overlap (disables gap fill)',
      type: 'flag'
    })
    .option('name', nameOpt)
    .option('no-snap', noSnapOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('divide')
    .describe('divide lines by polygons, copy polygon data to lines')
    .option('fields', {
      describe: 'fields to copy (comma-sep.) (default is all but key field)',
      type: 'strings'
    })
    .option('calc', {
      describe: 'use a JS expression to assign values (for many-to-one joins)'
    })
    .option('force', {
      describe: 'replace values from same-named fields',
      type: 'flag'
    })
    .option('source', {
      DEFAULT: true,
      describe: 'file or layer containing polygons'
    })
    .option('target', targetOpt);
    // .option('no-replace', noReplaceOpt);

  parser.command('dots')
    .describe('fill polygons with dots of one or more colors')
    .option('fields', {
      DEFAULT: true,
      describe: 'one or more fields containing numbers of dots',
      type: 'strings'
    })
    .option('colors', {
      describe: 'one or more colors',
      type: 'strings'
    })
    .option('values', {
      describe: 'values to assign to dot classes (alternative to colors=)',
      type: 'strings'
    })
    .option('save-as', {
      describe: 'name of color/value output field (default is fill)'
    })
    .option('progressive', {
      // describe: 'fill in points progressively',
      type: 'flag'
    })
    .option('r', {
      describe: 'radius of each dot in pixels',
      type: 'number'
    })
    .option('evenness', {
      describe: '(0-1) dot spacing, from random to even (default is 1)',
      type: 'number'
    })
    .option('per-dot', {
      describe: 'number for scaling data values (e.g. 10 per dot)',
      type: 'number'
    })
    .option('copy-fields', {
      describe: 'list of fields to copy from polygons to dots',
      type: 'strings'
    })
    .option('multipart', {
      describe: 'combine groups of same-color dots into multi-part features',
      type: 'flag'
    })
    .option('target', targetOpt)
    .option('name', nameOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('drop')
    .describe('delete layer(s) or elements within the target layer(s)')
    .option('geometry', {
      describe: 'delete all geometry from the target layer(s)',
      type: 'flag'
    })
    .option('holes', {
      describe: 'delete holes from polygons',
      type: 'flag'
    })
    .option('fields', {
      type: 'strings',
      describe: 'delete a list of attribute data fields, e.g. \'id,name\' \'*\''
    })
    .option('target', targetOpt);

  parser.command('each')
    .describe('create/update/delete data fields using a JS expression')
    .example('Add two calculated data fields to a layer of U.S. counties\n' +
        '$ mapshaper counties.shp -each \'STATE_FIPS=CNTY_FIPS.substr(0, 2), AREA=$.area\'')
    .option('expression', {
      DEFAULT: true,
      describe: 'JS expression to apply to each target feature'
    })
    .option('where', whereOpt)
    .option('target', targetOpt);

  parser.command('erase')
    .describe('use a polygon layer to erase another layer')
    .example('$ mapshaper land_areas.shp -erase water_bodies.shp -o erased.shp')
    .option('source', {
      DEFAULT: true,
      describe: 'file or layer containing erase polygons'
    })
    .option('remove-slivers', {
      describe: 'remove sliver polygons created by erasing',
      type: 'flag'
    })
    .option('bbox', bboxOpt)
    .option('name', nameOpt)
    .option('no-snap', noSnapOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('explode')
    .describe('divide multi-part features into single-part features')
    .option('naive', {type: 'flag'}) // testing
    .option('target', targetOpt);

  parser.command('filter')
    .describe('delete features using a JS expression')
    .option('expression', {
      DEFAULT: true,
      describe: 'delete features that evaluate to false'
    })
    .option('bbox', {
      describe: 'delete features outside bbox (xmin,ymin,xmax,ymax)',
      type: 'bbox'
    })
    .option('invert', invertOpt)
    .option('remove-empty', {
      type: 'flag',
      describe: 'delete features with null geometry'
    })
    .option('keep-shapes', {
      type: 'flag'
    })
    .option('ids', {
      // describe: 'filter on a list of feature ids',
      type: 'numbers'
    })
    .option('cleanup', {type: 'flag'}) // TODO: document
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('filter-fields')
    .describe('retain a subset of data fields')
    .option('fields', {
      DEFAULT: true,
      type: 'strings',
      describe: 'fields to retain (comma-sep.), e.g. \'fips,name\''
    })
    .option('invert', {
      type: 'flag',
      describe: 'retain only fields that would have been deleted'
    })
    .option('target', targetOpt);

  parser.command('filter-geom')
    .describe('')
    .option('bbox', {
      type: 'bbox',
      describe: 'remove non-intersecting geometry (xmin,ymin,xmax,ymax)'
    })
    .option('target', targetOpt);

  parser.command('filter-islands2')
    // .describe('remove small detached polygon rings (islands)')
    .option('min-area', {
      type: 'area',
      describe: 'remove small-area islands (e.g. 10km2)'
    })
    .option('min-vertices', {
      type: 'integer',
      describe: 'remove low-vertex-count islands'
    })
    .option('keep-shapes', {
      type: 'flag',
      describe: 'only filter smaller parts of multipart polygons',
    })
    .option('remove-empty', {
      type: 'flag',
      describe: 'delete features with null geometry'
    })
    .option('target', targetOpt);

  parser.command('filter-islands')
    .describe('remove small detached polygon rings (islands)')
    .option('min-area', {
      type: 'area',
      describe: 'remove small-area islands (e.g. 10km2)'
    })
    .option('min-vertices', {
      type: 'integer',
      describe: 'remove low-vertex-count islands'
    })
    .option('remove-empty', {
      type: 'flag',
      describe: 'delete features with null geometry'
    })
    .option('target', targetOpt);

  parser.command('filter-slivers')
    .describe('remove small polygon rings')
    .option('min-area', {
      type: 'area',
      describe: 'area threshold (e.g. 2sqkm)'
    })
    .option('sliver-control', {
      describe: 'boost area threshold of slivers (0-1, default is 1)',
      type: 'number'
    })
    .option('weighted', {
      // describe: 'multiply min-area by Polsby-Popper compactness (0-1)'
      type: 'flag',
    })
    /*
    .option('remove-empty', {
      type: 'flag',
      describe: 'delete features with null geometry'
    })
    */
    .option('target', targetOpt);

  parser.command('graticule')
    .describe('create a graticule layer')
    .option('interval', {
      describe: 'size of grid cells in degrees (options: 5 10 15 30 45, default is 10)',
      type: 'number'
    })
    .option('polygon', {
      describe: 'create a polygon to match the outline of the graticule',
      type: 'flag'
    })
    .option('name', nameOpt);


  // for testing grid update
  parser.command('grid2')
    .option('type', {
      describe: 'square, hex or hex2 (default is square)'
    })
    .option('interval', {
      describe: 'side length (e.g. 500m, 12km)',
      type: 'distance'
    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('grid')
    .describe('create a grid of square or hexagonal polygons')
    .option('type', {
      describe: 'square, hex or hex2 (default is square)'
    })
    .option('interval', {
      describe: 'side length (e.g. 500m, 12km)',
      type: 'distance'
    })
    .option('cols', {
      type: 'integer'
    })
    .option('rows', {
      type: 'integer'
    })
    // .option('bbox', {
    //   type: 'bbox',
    //   describe: 'xmin,ymin,xmax,ymax (default is bbox of data)'
    // })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('include')
    .describe('import JS data and functions for use in JS expressions')
    .option('file', {
      DEFAULT: true,
      describe: 'file containing a JS object with key:value pairs to import'
    });

  parser.command('inlay')
    .describe('inscribe a polygon layer inside another polygon layer')
    .option('source', {
      DEFAULT: true,
      describe: 'file or layer containing polygons to inlay'
    })
    .option('target', targetOpt);

  parser.command('innerlines')
    .describe('convert polygons to polylines along shared edges')
    .option('where', whereOpt2)
    // .option('each', eachOpt2)
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('join')
    .describe('join data records from a file or layer to a layer')
    .example('Join a csv table to a Shapefile (don\'t auto-convert FIPS column to numbers)\n' +
      '$ mapshaper states.shp -join data.csv keys=STATE_FIPS,FIPS string-fields=FIPS -o joined.shp')
    .validate(function(cmd) {
      if (!cmd.options.source) {
        error('Command requires the name of a layer or file to join');
      }
    })
    .option('source', {
      DEFAULT: true,
      describe: 'file or layer containing data records'
    })
    .option('keys', {
      describe: 'join by matching target,source key fields, e.g. keys=FID,id',
      type: 'strings'
    })
    .option('calc', {
      describe: 'use a JS expression to assign values (for many-to-one joins)'
    })
    .option('where', {
      describe: 'use a JS expression to filter source records'
    })
    .option('fields', {
      describe: 'fields to copy (comma-sep.) (default is all but key field)',
      type: 'strings'
    })
    .option('prefix', {
      describe: 'prefix for renaming fields joined from the source table'
    })
    .option('interpolate', {
      describe: '(polygon-polygon join) list of area-interpolated fields',
      type: 'strings'
    })
    .option('point-method', {
      describe: '(polygon-polygon join) join polygons via inner points',
      type: 'flag'
    })
    .option('largest-overlap', {
      describe: '(polygon-polygon join) use max overlap to join one polygon',
      type: 'flag'
    })
    // .option('nearest-point', {
    //   describe: '(point-point join)',
    //   type: 'flag'
    // })
    .option('max-distance', {
      describe: '(point-point join) join source points within this radius',
      type: 'distance'
    })
    .option('planar', {
      // describe: 'use planar geometry when interpolating by area' // useful for testing
      type: 'flag'
    })
    .option('duplication', {
      describe: 'duplicate target features on many-to-one joins',
      type: 'flag'
    })
    .option('string-fields', stringFieldsOpt)
    .option('field-types', fieldTypesOpt)
    .option('sum-fields', {
      describe: 'fields to sum in a many-to-one join (or use calc= for this)',
      type: 'strings'
    })
    .option('force', {
      describe: 'replace values from same-named fields',
      type: 'flag'
    })
    .option('unjoined', {
      describe: 'copy unjoined records from source table to "unjoined" layer',
      type: 'flag'
    })
    .option('unmatched', {
      describe: 'copy unmatched records in target table to "unmatched" layer',
      type: 'flag'
    })
    .option('encoding', encodingOpt)
    .option('target', targetOpt);

  parser.command('lines')
    .describe('convert a polygon or point layer to a polyline layer')
    .option('fields', {
      DEFAULT: true,
      describe: 'field(s) to create a hierarchy of boundary lines',
      type: 'strings'
    })
    .option('where', whereOpt2)
    .option('each', eachOpt2)
    .option('segments', {
      describe: 'convert paths to segments, for debugging',
      type: 'flag'
    })
    .option('callouts', {
      // describe: 'convert points to lines for editing in the GUI',
      type: 'flag'
    })
    .option('arcs', {
      describe: 'convert paths to arcs, for debugging',
      type: 'flag'
    })
    .option('groupby', {
      describe: 'field for grouping point input into multiple lines'
    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('merge-layers')
    .describe('merge multiple layers into as few layers as possible')
    .option('force', {
      type: 'flag',
      describe: 'merge layers with inconsistent data fields'
    })
    .option('flatten', {
      describe: 'remove polygon overlaps; higher-id polygons take priority',
      type: 'flag'
    })
    .option('name', nameOpt)
    .option('target', targetOpt);

  parser.command('mosaic')
    .describe('convert a polygon layer with overlaps into a flat mosaic')
    .option('calc', calcOpt)
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('point-grid')
    .describe('create a rectangular grid of points')
    .validate(V.validateGridOpts)
    .option('_', {
      label: '<cols,rows>',
      describe: 'size of the grid, e.g. -point-grid 100,100',
      DEFAULT: true
    })
    .option('interval', {
      describe: 'distance between adjacent points, in source units',
      type: 'distance'
    })
    .option('cols', {
      type: 'integer'
    })
    .option('rows', {
      type: 'integer'
    })
    .option('bbox', {
      type: 'bbox',
      describe: 'xmin,ymin,xmax,ymax (default is bbox of data)'
    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('points')
    .describe('create a point layer from a different layer type')
    .option('x', {
      describe: 'field containing x coordinate'
    })
    .option('y', {
      describe: 'field containing y coordinate'
    })
    .option('inner', {
      describe: 'create an interior point for each polygon\'s largest ring',
      type: 'flag'
    })
    .option('centroid', {
      describe: 'create a centroid point for each polygon\'s largest ring',
      type: 'flag'
    })
    .option('vertices', {
      describe: 'capture unique vertices of polygons and polylines',
      type: 'flag'
    })
    .option('vertices2', {
      describe: 'like vertices, but without removal of duplicate coordinates',
      type: 'flag'
    })
    .option('endpoints', {
      describe: 'capture unique endpoints of polygons and polylines',
      type: 'flag'
    })
    .option('midpoints', {
      describe: 'find the (planar) midpoint of each polyline',
      type: 'flag'
    })
    // WORK IN PROGRESS todo: create a point layer containing segment intersections
    .option('intersections', {
     // describe: 'capture line segment intersections of polygons and polylines',
     type: 'flag'
    })
    .option('interpolated', {
      describe: 'interpolate points along polylines; requires interval=',
      type: 'flag'
    })
    .option('interval', {
      describe: 'distance between interpolated points (meters or projected units)',
      type: 'distance'
    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('polygons')
    .describe('convert polylines to polygons')
    .option('gap-tolerance', {
      describe: 'specify gap tolerance in source units',
      type: 'distance'
    })
    .option('from-rings', {
      describe: 'do simple conversion from a layer of closed paths',
      type: 'flag'
    })
    .option('target', targetOpt);

  parser.command('proj')
    .describe('project your data (using Proj.4)')
    .option('crs', {
      DEFAULT: {
        multi_arg: true,
        join: ' '
      },
      describe: 'set destination CRS using a Proj.4 definition or alias'
    })
    .option('projection', {
      alias_to: 'crs'
    })
    .option('match', {
      describe: 'set destination CRS using a .prj file or layer id'
    })
    .option('source', {
      // describe: '(deprecated) alias for match',
      alias_to: 'match'
    })
    .option('from', {
      alias_to: 'init',
      describe: '(deprecated) alias for init='
    })
    .option('init', {
      describe: 'set source CRS (if unset) using a string, .prj or layer id'
    })
    .option('densify', {
      type: 'flag',
      describe: 'add points along straight segments to approximate curves'
    })
    .option('clip-angle', {
      describe: 'use a custom clipping radius (for azimuthal projections)',
      type: 'number'
    })
    .option('clip-bbox', {
      describe: 'clip to a lat-long bounding box before projecting',
      type: 'bbox'
    })
    .option('target', targetOpt)
    .validate(V.validateProjOpts);

  parser.command('rectangle')
    .describe('create a rectangle from a bbox or target layer extent')
    .option('bbox', {
      describe: 'rectangle coordinates (xmin,ymin,xmax,ymax)',
      type: 'bbox'
    })
    .option('offset', offsetOpt)
    .option('aspect-ratio', aspectRatioOpt)
    .option('source', {
      describe: 'name of layer to enclose'
    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('rectangles')
    .describe('create a rectangle around each feature in a layer')
    .option('offset', offsetOpt)
    .option('aspect-ratio', aspectRatioOpt)
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('rename-fields')
    .describe('rename data fields')
    .option('fields', {
      DEFAULT: true,
      type: 'strings',
      describe: 'list of replacements (comma-sep.), e.g. \'fips=STATE_FIPS,st=state\''
    })
    .option('target', targetOpt);

  parser.command('rename-layers')
    .describe('assign new names to layers')
    .option('names', {
      DEFAULT: true,
      type: 'strings',
      describe: 'list of replacements (comma-sep.)'
    })
    .option('target', targetOpt);

  parser.command('simplify')
    .validate(V.validateSimplifyOpts)
    .example('Retain 10% of removable vertices\n$ mapshaper input.shp -simplify 10%')
    .describe('simplify the geometry of polygon and polyline features')
    .option('percentage', {
      DEFAULT: true,
      alias: 'p',
      type: 'percent',
      describe: 'percentage of removable points to retain, e.g. 10%'
    })
    .option('dp', {
      alias: 'rdp',
      describe: 'use Ramer-Douglas-Peucker simplification',
      assign_to: 'method'
    })
    .option('visvalingam', {
      describe: 'use Visvalingam simplification with "effective area" metric',
      assign_to: 'method'
    })
    .option('weighted', {
      describe: 'use weighted Visvalingam simplification (default)',
      assign_to: 'method'
    })
    .option('method', {
      // hidden option
    })
    .option('weighting', {
      type: 'number',
      describe: 'weighted Visvalingam coefficient (default is 0.7)'
    })
    .option('resolution', {
      describe: 'output resolution as a grid (e.g. 1000x500)'
    })
    .option('interval', {
      // alias: 'i',
      describe: 'output resolution as a distance (e.g. 100)',
      type: 'distance'
    })
    /*
    .option('value', {
      // for testing
      // describe: 'raw value of simplification threshold',
      type: 'number'
    })
    */
    .option('variable', {
      // describe: 'expect an expression with interval=, percentage= or resolution=',
      describe: 'JS expr. assigning to one of: interval= percentage= resolution=',
      type: 'flag'
    })
    .option('planar', {
      describe: 'simplify decimal degree coords in 2D space (default is 3D)',
      type: 'flag'
    })
    .option('cartesian', {
      // describe: '(deprecated) alias for planar',
      alias_to: 'planar'
    })
    .option('keep-shapes', {
      describe: 'prevent small polygon features from disappearing',
      type: 'flag'
    })
    .option('lock-box', {
      // describe: 'don't remove vertices along bbox edges'
      type: 'flag'
    })
    .option('no-repair', {
      describe: 'don\'t remove intersections introduced by simplification',
      type: 'flag'
    })
    .option('stats', {
      describe: 'display simplification statistics',
      type: 'flag'
    })
    .option('target', targetOpt);

  parser.command('slice')
    // .describe('slice a layer using polygons in another layer')
    .option('source', {
      DEFAULT: true,
      describe: 'file or layer containing clip polygons'
    })
    /*
    .option('remove-slivers', {
      describe: 'remove sliver polygons created by clipping',
      type: 'flag'
    }) */
    .option('id-field', {
      describe: 'slice id field (from source layer)'
    })
    .option('name', nameOpt)
    .option('no-snap', noSnapOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('snap')
    .describe('snap together nearby vertices')
    .option('interval', {
      describe: 'snap together vertices within a tolerance (default is small)',
      DEFAULT: true,
      type: 'distance'
    })
    .option('endpoints', {
      describe: 'only snap together the endpoints of lines',
      type: 'flag'
    })
    .option('precision', {
      describe: 'round all coordinates to a given decimal precision (e.g. 0.000001)',
      type: 'number'
    })
    .option('target', targetOpt);

  parser.command('sort')
    .describe('sort features using a JS expression')
    .option('expression', {
      DEFAULT: true,
      describe: 'JS expression to generate a sort key for each feature'
    })
    .option('ascending', {
      describe: 'sort in ascending order (default)',
      type: 'flag'
    })
    .option('descending', {
      describe: 'sort in descending order',
      type: 'flag'
    })
    .option('target', targetOpt);

  parser.command('split')
    .describe('split a layer into single-feature or multi-feature layers')
    .option('field', {
      // former name
      alias_to: 'expression'
    })
    .option('expression', {
      DEFAULT: true,
      describe: 'expression or field for grouping features and naming split layers'
    })
    .option('ids', {
      // used by gui history to split on selected features
      // describe: 'split on a list of feature ids',
      type: 'numbers'
    })
    .option('apart', {
      describe: 'save output layers to independent datasets',
      type: 'flag'
    })
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('split-on-grid')
    .describe('split features into separate layers using a grid')
    .validate(V.validateGridOpts)
    .option('_', {
      DEFAULT: true,
      label: '<cols,rows>',
      describe: 'size of the grid, e.g. -split-on-grid 12,10'
    })
    .option('cols', {
      type: 'integer'
    })
    .option('rows', {
      type: 'integer'
    })
    .option('id-field', {
      describe: 'assign each feature a cell id instead of splitting layer'
    })
    // .option('no-replace', noReplaceOpt)
    .option('target', targetOpt);

  parser.command('style')
    .oldAlias('svg-style')
    .describe('set SVG style properties using JS or literal values')
    .option('where', whereOpt)
    .option('class', {
      describe: 'name of CSS class or classes (space-separated)'
    })
    .option('css', {
      describe: 'inline css style'
    })
    .option('fill', {
      describe: 'fill color; examples: #eee pink rgba(0, 0, 0, 0.2)'
    })
    .option('fill-pattern', {
      describe: 'pattern fill, ex: "hatches 2px grey 2px blue"'
    })
    .option('fill-effect', {
      describe: 'use "sphere" on a circle for a 3d globe effect'
    })
    .option('fill-opacity', {
      describe: 'fill opacity'
    })
    .option('fill-hatch', {
      alias_to: 'fill-pattern'
    })
    .option('stroke', {
      describe: 'stroke color'
    })
    .option('stroke-width', {
      describe: 'stroke width'
    })
    .option('stroke-dasharray', {
      describe: 'stroke dashes. Examples: "4" "2 4"'
    })
    .option('stroke-opacity', {
      describe: 'stroke opacity'
    })
    .option('opacity', {
      describe: 'opacity; example: 0.5'
    })
    .option('r', {
      describe: 'symbol radius (set this to export points as circles)',
    })
    .option('label-text', {
      describe: 'label text (set this to export points as labels)'
    })
    .option('text-anchor', {
      describe: 'label alignment; one of: start, end, middle (default)'
    })
    .option('dx', {
      describe: 'x offset of labels (default is 0)'
    })
    .option('dy', {
      describe: 'y offset of labels (default is 0/baseline-aligned)'
    })
    .option('font-size', {
      describe: 'size of label text (default is 12)'
    })
    .option('font-family', {
      describe: 'CSS font family of labels (default is sans-serif)'
    })
    .option('font-weight', {
      describe: 'CSS font weight property of labels (e.g. bold, 700)'
    })
    .option('font-style', {
      describe: 'CSS font style property of labels (e.g. italic)'
    })
     .option('letter-spacing', {
      describe: 'CSS letter-spacing property of labels'
    })
     .option('line-height', {
      describe: 'line spacing of multi-line labels (default is 1.1em)'
    })
   .option('target', targetOpt);

  parser.command('symbols')
    .describe('symbolize points as arrows, circles, stars, polygons, etc.')
    .option('type', {
      describe: 'types: arrow, circle, square, star, polygon, ring'
    })
    .option('stroke', {})
    .option('stroke-width', {})
    .option('fill', {
      describe: 'symbol fill color (filled symbols only)'
    })
    .option('stroke', {
      describe: 'symbol line color (linear symbols only)'
    })
    .option('stroke-width', {
      describe: 'symbol line width (linear symbols only)'
    })
    .option('opacity', {
      describe: 'symbol opacity'
    })
    .option('geographic', {
      old_alias: 'polygons',
       describe: 'make geographic shapes instead of SVG objects',
      type: 'flag'
    })
    .option('pixel-scale', {
      describe: 'set symbol scale in meters per pixel (geographic option)',
      type: 'number',
    })
    // .option('flipped', {
    //   type: 'flag',
    //   describe: 'symbol is vertically flipped'
    // })
    .option('rotated', {
      type: 'flag',
      describe: 'symbol is rotated to an alternate orientation'
    })
    .option('rotation', {
      describe: 'rotation of symbol in degrees'
    })
    .option('scale', {
      describe: 'scale symbols by a multiplier',
      type: 'number'
    })
    .option('radius', {
      describe: 'distance from center to farthest point on the symbol',
      type: 'distance'
    })
    .option('sides', {
      describe: '(polygon) number of sides of a (regular) polygon symbol',
      type: 'number'
    })
    .option('points', {
      describe: '(star) number of points'
    })
    .option('point-ratio', {
      old_alias: 'star-ratio',
      describe: '(star) ratio of minor to major radius of star',
      type: 'number'
    })
    .option('radii', {
      describe: '(ring) comma-sep. list of concentric radii, ascending order'
    })
    .option('arrow-style', {
      describe: '(arrow) options: stick, standard (default is standard)'
    })
    .option('length', {
      old_alias: 'arrow-length',
      describe: '(arrow) length of arrow in pixels'
    })
    .option('direction', {
      old_alias: 'arrow-direction',
      describe: '(arrow) angle off of vertical (-90 = left-pointing)'
    })
    .option('head-angle', {
      old_alias: 'arrow-head-angle',
      describe: '(arrow) angle of tip of arrow (default is 40 degrees)'
    })
    .option('head-width', {
      old_alias: 'arrow-head-width',
      describe: '(arrow) width of arrow head from side to side'
    })
    .option('head-length', {
      old_alias: 'arrow-head-width',
      describe: '(arrow) length of head (alternative to head-angle)'
    })
    .option('head-shape', {
      // describe: 'options: a b c'
    })
    .option('stem-width', {
      old_alias: 'arrow-stem-width',
      describe: '(arrow) width of stem at its widest point'
    })
    .option('stem-length', {
      old_alias: 'arrow-stem-length',
      describe: '(arrow) alternative to length'
    })
    .option('stem-taper', {
      old_alias: 'arrow-stem-taper',
      describe: '(arrow) factor for tapering the width of the stem (0-1)'
    })
    .option('stem-curve', {
      old_alias: 'arrow-stem-curve',
      describe: '(arrow) curvature in degrees (default is 0)'
    })
    .option('min-stem-ratio', {
      old_alias: 'arrow-min-stem',
      describe: '(arrow) minimum ratio of stem to total length',
      type: 'number'
    })
    .option('anchor', {
      describe: '(arrow) takes one of: start, middle, end (default is start)'
    })
    .option('effect', {})
    // .option('where', whereOpt)
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);
    // .option('name', nameOpt);

  parser.command('target')
    .describe('set active layer (or layers)')
    .option('target', {
      DEFAULT: true,
      describe: 'name or index of layer to target'
    })
    .option('type', {
      describe: 'type of layer to target (polygon|polyline|point)'
    })
    // .option('combine', {
    //   type: 'flag',
    //   describe: 'place all targeted layers in one dataset together with any  associated layers'
    // })
    // .option('isolate', {
    //   type: 'flag',
    //   describe: 'place all targeted layers in one dataset exclusive of associated layers'
    // })
    .option('name', {
      describe: 'rename the target layer'
    });

  parser.command('union')
    .describe('create a flat mosaic from two or more polygon layers')
    // .option('add-fid', {
    //   describe: 'add FID_A, FID_B, ... fields to output layer',
    //   type: 'flag'
    // })
    .option('fields', {
      type: 'strings',
      describe: 'fields to retain (comma-sep.) (default is all fields)',
    })
    .option('name', nameOpt)
    .option('target', {
      describe: 'specify layers to target (comma-sep. list)'
    })
    .option('no-replace', noReplaceOpt);

  parser.command('uniq')
    .describe('delete features with the same id as a previous feature')
    .option('expression', {
      DEFAULT: true,
      describe: 'JS expression to obtain the id of a feature'
    })
    .option('max-count', {
      type: 'number',
      describe: 'max features with the same id (default is 1)'
    })
    .option('index', {
      // describe: 'add an index instead of filtering'
      type: 'flag'
    })
    .option('invert', invertOpt)
    .option('verbose', {
      describe: 'print each removed feature',
      type: 'flag'
    })
    .option('target', targetOpt);

  // Experimental commands
  parser.section('Experimental commands (may give unexpected results)');

  parser.command('add-shape')
    .describe('')
    .option('geojson', {

    })
    .option('coordinates', {

    })
    .option('properties', {

    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('alpha-shapes')
    // .describe('convert points to alpha shapes (aka concave hulls)')
    .option('interval', {
      describe: 'alpha parameter',
      type: 'number'
    })
    .option('keep-points', {
      // describe: 'replace single points with tiny triangles',
      type: 'flag'
    })
    .option('name', nameOpt)
    .option('target', targetOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('cluster')
    .describe('group polygons into compact clusters')
    .option('id-field', {
      describe: 'field name of cluster id (default is "cluster")'
    })
    .option('pct', {
      alias: 'p',
      type: 'percent',
      describe: 'percentage of shapes to retain, e.g. 50%'
    })
    .option('max-width', {
      describe: 'max width of cluster bounding box',
      type: 'number'
    })
    .option('max-height', {
      describe: 'max height of cluster bounding box',
      type: 'number'
    })
    .option('max-area', {
      describe: 'max area of a cluster',
      type: 'number'
    })
    .option('group-by', {
      describe: 'field name; only same-value shapes will be grouped'
    })
    .option('target', targetOpt);

  parser.command('data-fill')
    .describe('fill in missing values in a polygon layer')
    .option('field', {
      describe: 'name of field to fill in'
    })
    .option('postprocess', {alias_to: 'contiguous'})
    .option('contiguous', {
      describe: 'remove non-contiguous data islands',
      type: 'flag'
    })
    // .option('min-weight-pct', {
    //   describe: 'retain data islands weighted more than this pct'
    // })
    .option('weight-field', {
      describe: 'use field values to calculate data island weights'
    });

  // replaced by -require
  // parser.command('external')
  //   .option('module', {
  //     DEFAULT: true,
  //     describe: 'name of Node module containing the command'
  //   });

  parser.command('filter-points')
    // .describe('remove points that are not part of a group')
    // .option('min-group-size', {
    //   // describe: 'drop points with fewer points in the vicinity',
    //   type: 'number'
    // })
    .option('group-interval', {
      // describe: max interval separating a point from other points
      type: 'number'
    });

  parser.command('frame')
    // .describe('create a map frame at a given size')
    .option('bbox', {
      describe: 'frame coordinates (xmin,ymin,xmax,ymax)',
      type: 'bbox'
    })
    .option('offset', offsetOpt)
    .option('width', {
      describe: 'pixel width of output (default is 800)'
    })
    .option('height', {
      describe: 'pixel height of output (may be a range)'
    })
    .option('pixels', {
      describe: 'area of output in pixels (alternative to width and height)',
      type: 'number'
    })
    .option('source', {
      describe: 'name of layer to enclose'
    })
    .option('name', nameOpt);

  parser.command('fuzzy-join')
    .describe('join points to polygons, with data fill and fuzzy match')
    .option('source', {
      DEFAULT: true,
      describe: 'file or layer containing data records'
    })
    .option('field', {
      describe: 'field to join'
    })
    .option('dedup-points', {
      describe: 'uniqify points with the same location and field value',
      type: 'flag'
    })
    .option('no-dropouts', {
      describe: 'try to retain all values from the point layer',
      type: 'flag'
    })
    .option('postprocess', {alias_to: 'contiguous'})
    .option('contiguous', {
      describe: 'remove non-contiguous data islands',
      type: 'flag'
    })
    .option('target', targetOpt);

  parser.command('point-to-grid')
    .option('interval', {
      // describe: size of grid in projected units
      type: 'number'
    })
    .option('radius', {
      // describe: radius to assign each point
      type: 'number'
    })
    .option('circles', {
      // describe: create a grid of circles instead of squares
      type: 'flag'
    })
    .option('cell-margin', {
      // describe: (0-1) inset grid shapes by a percentage
      type: 'number'
    })
    .option('aligned', {
      // describe: all grids of a given cell size will be aligned
      type: 'flag'
    })
    .option('calc', calcOpt)
    .option('target', targetOpt)
    .option('name', nameOpt)
    .option('no-replace', noReplaceOpt);

  parser.command('require')
    .describe('require a Node module or ES module to use in JS expressions')
    .option('module', {
      DEFAULT: true,
      describe: 'name of installed module or path to module file'
    })
    .option('alias', {
      describe: 'Set the module name to an alias'
    });
    // .option('init', {
    //   describe: 'JS expression to run after the module loads'
    // });

  parser.command('rotate')
    // .describe('apply d3-style 3-axis rotation to a lat-long dataset')
    .option('rotation', {
      // describe: 'two or three angles of rotation',
      DEFAULT: true,
      type: 'numbers'
    })
    .option('invert', {
      type: 'flag'
    });

  parser.command('run')
    .describe('create commands on-the-fly and run them')
    .option('expression', {
      DEFAULT: true,
      describe: 'JS expression or template to generate command(s)'
    })
    // deprecated
    .option('commands', {alias_to: 'expression'})
    .option('target', targetOpt);

  parser.command('scalebar')
    // .describe()
    .option('top', {})
    .option('right', {})
    .option('bottom', {})
    .option('left', {})
    .option('font-size', {})
    // .option('font-family', {})
    .option('label-position', {}) // top or bottom
    .option('label-text', {});

  parser.command('shape')
    .describe('create a polyline or polygon from coordinates')
    .option('coordinates', {
      describe: 'list of vertices as x,y,x,y...',
      type: 'numbers'
    })
    .option('offsets', {
      describe: 'list of vertices as offsets from coordinates list',
      type: 'numbers'
    })
    .option('closed', {
      describe: 'close an open path to create a polygon',
      type: 'flag'
    })
    .option('type', {
      // describe: 'circle or ???'
      DEFAULT: true,
    })
    .option('center', {
      //describe: 'center of the circle (default is 0,0)',
      type: 'numbers'
    })
    .option('radius', {
      //describe: 'radius of the circle in meters',
      type: 'number'
    })
    .option('radius-angle', {
      //describe: 'radius of the circle in degrees',
      type: 'number'
    })
    .option('bbox', {
      // describe: 'rectangle bounding box',
      type: 'numbers'
    })
    .option('geometry', {
      //describe: 'polygon or polyline'
    })
    .option('rotation', {
      // describe: 'two or three angles of rotation',
      type: 'numbers'
    })
    .option('name', nameOpt);

  parser.command('subdivide')
    .describe('recursively split a layer using a JS expression')
    .validate(V.validateExpressionOpt)
    .option('expression', {
      DEFAULT: true,
      describe: 'boolean JS expression'
    })
    .option('target', targetOpt);

  parser.section('Control flow commands');

  var ifOpts = {
    expression: {
      DEFAULT: true,
      describe: 'JS expression'
    },
    // empty: {
    //   describe: 'run if layer is empty',
    //   type: 'flag'
    // },
    // 'not-empty': {
    //   describe: 'run if layer is not empty',
    //   type: 'flag'
    // },
    layer: {
      describe: 'name or id of layer to test (default is current target)'
    },
    target: targetOpt
  };

  parser.command('if')
    .describe('run the following commands if a condition is met')
    .options(ifOpts);

  parser.command('elif')
    .describe('test an alternate condition; used after -if')
    .options(ifOpts);

  parser.command('else')
    .describe('run commands if all preceding -if/-elif conditions are false');

  parser.command('endif')
    .describe('mark the end of an -if sequence');

  parser.command('ignore')
    // .describe('stop processing if a condition is met')
    .option('empty', {
      describe: 'ignore empty files',
      type: 'flag'
    })
    .option('target', targetOpt);

  parser.command('stop')
    .describe('stop processing (skip remaining commands)');

  parser.section('Informational commands');

  parser.command('calc')
    .describe('calculate statistics about the features in a layer')
    .example('Calculate the total area of a polygon layer\n' +
      '$ mapshaper polygons.shp -calc \'sum($.area)\'')
    .example('Count census blocks in NY with zero population\n' +
      '$ mapshaper ny-census-blocks.shp -calc \'count()\' where=\'POPULATION == 0\'')
    .validate(V.validateExpressionOpt)
    .option('expression', {
      DEFAULT: true,
      describe: 'functions: sum() average() median() max() min() count()'
    })
    .option('where', whereOpt)
    .option('target', targetOpt)
    .option('to-layer', noReplaceOpt2)
    .option('name', nameOpt2);

  parser.command('colors')
    .describe('print list of color scheme names');

  parser.command('comment')
    .describe('add a comment to the sequence of commands')
    .option('message', {
      DEFAULT: {
        multi_arg: true,
        join: ' '
      }
    });

  parser.command('encodings')
    .describe('print list of supported text encodings (for .dbf import)');

  parser.command('help')
    .alias('h')
    .describe('print help; takes optional command name')
    .option('command', {
      DEFAULT: true,
      describe: 'view detailed information about a command'
    });

  parser.command('info')
    .describe('print information about data layers')
    .option('save-to', {
      describe: 'name of file to save info in JSON format'
    })
    .option('target', targetOpt)
    .option('to-layer', noReplaceOpt2)
    .option('name', nameOpt2);

  parser.command('inspect')
    .describe('print information about a feature')
    .option('expression', {
      DEFAULT: true,
      describe: 'boolean JS expression for selecting a feature'
    })
    .option('target', targetOpt)
    .validate(V.validateExpressionOpt);

  parser.command('print')
    .describe('print a message to stdout')
    .option('message', {
      DEFAULT: {
        multi_arg: true,
        join: ' '
      }
    });

  parser.command('projections')
    .describe('print list of supported projections');

  parser.command('quiet')
    .describe('inhibit console messages');

  parser.command('verbose')
    .describe('print verbose processing messages');

  parser.command('version')
    .alias('v')
    .describe('print mapshaper version');

  parser.command('debug');

  return parser;
}
