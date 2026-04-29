// Constants shared between the .msx (mapshaper snapshot) writer in
// mapshaper-pack.mjs and the file-type registry in
// io/mapshaper-file-types.mjs. Living here lets file-types reference the
// extension without pulling in the full pack module (which transitively
// depends back on file-types via the gzip helper).
export var PACKAGE_EXT = 'msx';
