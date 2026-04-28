// =============================================================================
// Usage examples shown by `mapshaper -help <command>`.
//
// HOW TO READ THIS FILE
//   - The default export is keyed by command name (the same name passed to
//     parser.command(...) in mapshaper-options.mjs).
//   - Each value is an array of example entries; entries render in order.
//   - An entry is { description?, command }:
//       description -- one or more lines of plain text shown above the
//                      command line. Optional; omit for self-explanatory
//                      one-liners.
//       command     -- the bare argv string. The "$ mapshaper " prefix is
//                      added automatically by applyExamples() so all examples
//                      look consistent on screen. May span multiple lines if
//                      the example uses backslash-continuation; just write a
//                      template literal with literal newlines in it.
//
// HOW TO COMMENT OUT
//   - Single example, lightweight: just comment the `command:` line. Entries
//     without a `command` are silently skipped, so this is the fastest way
//     to park a description while you're polishing the invocation.
//   - Single example, fully: comment the `{...},` entry.
//   - All examples for a command: comment the `cmd: [...]` entry.
//   - applyExamples() throws if a top-level key isn't a real command name,
//     so typos in command names can't slip in unnoticed.
//
// SCOPE
//   This is per-command help only. Top-level examples on the bare
//   `mapshaper -help` page still go through parser.example(...) directly in
//   mapshaper-options.mjs.
// =============================================================================

const examples = {

  // -------------------------------------------------------------------------
  // I/O
  // -------------------------------------------------------------------------

  i: [
    {
      description: 'Import a Shapefile and print a summary',
      command: 'states.shp -info'
    },
    {
      description: 'Import several files as a single set of layers',
      command: 'states.geojson cities.geojson combine-files'
    }
  ],

  o: [
    {
      description: 'Convert a Shapefile to GeoJSON',
      command: 'states.shp -o states.geojson'
    },
    {
      description: 'Write each input layer to a separate file in dest/',
      // command: 'states.shp counties.shp combine-files -o dest/'
    }
  ],

  // -------------------------------------------------------------------------
  // Editing geometry
  // -------------------------------------------------------------------------

  affine: [
    {
      description: 'Nudge a layer 50m east and 200m north',
      command: 'roads.geojson -affine shift=50m,200m'
    }
  ],

  buffer: [
    {
      description: 'Buffer points by 500m and write the result as GeoJSON',
      // command: 'wells.shp -buffer 500m -o format=geojson buffered.json'
    }
  ],

  clean: [
    {
      description: 'Repair overlaps and gaps before converting to lines',
      command: 'parcels.shp -clean -lines'
    }
  ],

  clip: [
    {
      command: 'states.shp -clip land_area.geojson'
    }
  ],

  dissolve: [
    {
      description: 'Dissolve all polygons in a feature layer into a single polygon',
      command: 'states.geojson -dissolve'
    },
    {
      description:
        'Generate state-level polygons by dissolving a layer of counties\n' +
        '(STATE_FIPS, POPULATION and STATE_NAME are attribute field names)',
      command:
        'counties.shp -dissolve STATE_FIPS copy-fields=STATE_NAME ' +
        'sum-fields=POPULATION'
    }
  ],

  erase: [
    {
      command: 'land_areas.shp -erase water_bodies.shp'
    }
  ],

  explode: [
    {
      // description: 'Split each multi-part feature into individual single-part features',
      command: 'admin.geojson -explode'
    }
  ],

  innerlines: [
    {
      description: 'Extract the shared boundaries between adjacent counties',
      command: 'counties.shp -innerlines -o county_lines.shp'
    }
  ],

  lines: [
    {
      description: 'Convert polygon boundaries to lines, keeping a per-state ID',
      // command: 'states.shp -lines STATE_FIPS -o state_lines.shp'
    }
  ],

  // -------------------------------------------------------------------------
  // Topology, simplification, generalization
  // -------------------------------------------------------------------------

  simplify: [
    {
      description: 'Simplify using default method',
      command: 'states.shp -simplify 10%'
    },
    {
      description: 'Simplify using Douglas-Peucker and 100m threshold',
      command: 'states.shp -simplify dp interval=100m'
    }
  ],

  snap: [
    {
      description: 'Snap nearby vertices to clean up tiny topology errors',
      command: 'parcels.shp -snap'
    }
  ],

  // -------------------------------------------------------------------------
  // Attribute editing
  // -------------------------------------------------------------------------

  calc: [
    {
      description: 'Calculate the total area of a polygon layer',
      command: "polygons.shp -calc 'sum(this.area)'"
    },
    {
      description: 'Count census blocks in NY with zero population',
      command: "ny-census-blocks.shp -calc 'count()' where='POPULATION == 0'"
    }
  ],

  classify: [
    {
      description: 'Bucket counties into 5 quantiles by population density',
      command: 'counties.shp -classify field=DENSITY classes=5 method=quantile'
    }
  ],

  colorizer: [
    {
      description: 'Define a sequential color scheme and use it to create a new field',
      command:
        'data.json -colorizer name=getColor nodata=#eee breaks=20,40 \\\n' +
        "  colors=#e0f3db,#a8ddb5,#43a2ca -each 'fill = getColor(RATING)'"
    }
  ],

  each: [
    {
      description: 'Add two calculated data fields to a layer of U.S. counties',
      command:
        "counties.shp -each 'STATE_FIPS=CNTY_FIPS.substr(0, 2), AREA=this.area'"
    }
  ],

  filter: [
    {
      description: 'Keep only features whose POPULATION exceeds 1,000,000',
      command: "places.shp -filter 'POPULATION > 1e6'"
    }
  ],

  'filter-fields': [
    {
      description: 'Keep only the listed fields',
      command: 'states.shp -filter-fields STATE_FIPS,STATE_NAME'
    }
  ],

  join: [
    {
      description: "Join a CSV table to a Shapefile (don't auto-convert FIPS column to numbers)",
      command:
        'states.shp -join data.csv keys=STATE_FIPS,FIPS string-fields=FIPS ' +
        '-o joined.shp'
    }
  ],

  'rename-fields': [
    {
      description: 'Rename two fields in place',
      command: 'data.shp -rename-fields STATE=STATE_FIPS,POP=POPULATION'
    }
  ],

  sort: [
    {
      description: 'Sort features by population, descending',
      command: "counties.shp -sort POPULATION descending"
    }
  ],

  // -------------------------------------------------------------------------
  // Layers
  // -------------------------------------------------------------------------

  'merge-layers': [
    {
      description: 'Combine all loaded layers into one',
      command: '*.shp combine-files -merge-layers -o merged.shp'
    }
  ],

  'rename-layers': [
    {
      description: 'Give the active layer a meaningful name',
      // command: 'data.json -rename-layers parcels -o'
    }
  ],

  split: [
    {
      description: 'Split a layer into one layer per STATE_FIPS value',
      command: 'counties.shp -split STATE_FIPS -o dest/'
    }
  ],

  target: [
    {
      description: 'Direct the next command at a named layer',
      command: 'states.shp counties.shp combine-files -target counties -dissolve STATE_FIPS -o'
    }
  ],

  // -------------------------------------------------------------------------
  // Projections
  // -------------------------------------------------------------------------

  proj: [
    {
      description: 'Re-project to Web Mercator',
      command: 'states.geojson -proj webmercator'
    },
    {
      description: 'Set a source CRS without re-projecting (e.g. for unprojected GeoJSON)',
      command: 'data.geojson -proj init=EPSG:2263'
    }
  ],

  // -------------------------------------------------------------------------
  // Informational
  // -------------------------------------------------------------------------

  info: [
    {
      description: 'Print a summary of a dataset',
      command: 'states.shp -info'
    }
  ],

  inspect: [
    {
      description: 'Print full attribute and geometry info for a single feature',
      command: "places.shp -inspect 'NAME == \"Fort Wayne\"'"
    }
  ]
};

// `cmd` is the parser created by getOptionParser(). For each entry in the
// table above, look up the matching CommandOptions and forward the formatted
// string to its existing .example() method, so the help printer needs no
// changes.
//
// Entries without a usable `command` field (missing, commented out, blank)
// are silently skipped, so a single `// command: '...'` is enough to disable
// one example without commenting out its surrounding object.
//
// Top-level keys that don't match a registered command throw at startup, so
// command-name typos surface immediately rather than disappearing.
//
// `table` is optional and defaults to the bundled `examples` object; it
// exists so tests can pump synthetic tables through the same skip-and-format
// logic without having to mutate the singleton.
export function applyExamples(parser, table) {
  table = table || examples;
  Object.keys(table).forEach(function(cmdName) {
    var entries = table[cmdName];
    if (!Array.isArray(entries) || entries.length === 0) return;
    var cmd = parser.findCommand(cmdName);
    if (!cmd) {
      throw new Error('mapshaper-examples.mjs: no parser command named "' + cmdName + '"');
    }
    entries.forEach(function(entry) {
      if (!isUsable(entry)) return;
      cmd.example(formatExample(entry));
    });
  });
}

function isUsable(entry) {
  return entry && typeof entry.command === 'string' && entry.command.length > 0;
}

// Build the on-screen string for one example. Mirrors the historical inline
// format of `description\n$ mapshaper <command>`, so existing rendering in
// mapshaper-command-parser.mjs (split-on-newline, two-space indent) keeps
// working unchanged.
function formatExample(entry) {
  var out = '';
  if (entry.description) out += entry.description + '\n';
  out += '$ mapshaper ' + entry.command;
  return out;
}

export default examples;
