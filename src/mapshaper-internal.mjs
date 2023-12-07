// Attach functions exported by modules to the "internal" object,
// so they can be run by tests and by the GUI.
// TODO: rewrite tests to import functions directly from modules,
//       export only functions called by the GUI.
var internal = {};
export default internal;

import * as GeojsonToSvg from './svg/geojson-to-svg';
import * as SvgPathUtils from './svg/svg-path-utils';
import * as SvgStringify from './svg/svg-stringify';
import * as SvgLabels from './svg/svg-labels';
import * as SvgSymbols from './svg/svg-symbols';

internal.svg = Object.assign({}, SvgStringify, SvgPathUtils, GeojsonToSvg, SvgLabels, SvgSymbols);

import Dbf from './shapefile/dbf-writer';
import DbfReader from './shapefile/dbf-reader';
import DouglasPeucker from './simplify/mapshaper-dp';
import GeoJSON from './geojson/geojson-common';
import ShpType from './shapefile/shp-type';
import TopoJSON from './topojson/topojson-common';
import Visvalingam from './simplify/mapshaper-visvalingam';
import { ArcCollection } from './paths/mapshaper-arcs';
import { Bounds } from './geom/mapshaper-bounds';
import { clipIterByBounds } from './clipping/mapshaper-bbox-clipping';
import { CommandParser } from './cli/mapshaper-command-parser';
import { DataTable } from './datatable/mapshaper-data-table';
import { editArcs } from './paths/mapshaper-arc-editor';
import { GeoJSONReader } from './geojson/geojson-reader';
import { Heap } from './simplify/mapshaper-heap';
import { IdLookupIndex } from './indexing/mapshaper-id-lookup-index';
import { NodeCollection } from './topology/mapshaper-nodes';
import { parseDMS, formatDMS } from './geom/mapshaper-dms';
import { PathIndex } from './paths/mapshaper-path-index';
import { PolygonIndex } from './polygons/mapshaper-polygon-index';
import { ShpReader } from './shapefile/shp-reader';
import { Transform } from './geom/mapshaper-transform';
import { parse } from './geojson/json-parser';
import { Job } from './mapshaper-job';

// Assign functions and objects exported from modules to the 'internal' namespace
// to maintain compatibility with tests and to expose (some of) them to the GUI.

Object.assign(internal, {
  Job,
  Dbf,
  DbfReader,
  DouglasPeucker,
  geojson: GeoJSON,
  json: { parse: parse },
  ShpType,
  topojson: TopoJSON,
  Visvalingam,
  ArcCollection,
  Bounds,
  clipIterByBounds,
  CommandParser,
  DataTable,
  editArcs,
  GeoJSONReader,
  Heap,
  IdLookupIndex,
  NodeCollection,
  parseDMS,
  formatDMS,
  PathIndex,
  PolygonIndex,
  ShpReader,
  Transform
});

import * as AnchorPoints from './points/mapshaper-anchor-points';
import * as ArcClassifier from './topology/mapshaper-arc-classifier';
import * as ArcDissolve from './paths/mapshaper-arc-dissolve';
import * as ArcUtils from './paths/mapshaper-arc-utils';
import * as Bbox2Clipping from './clipping/mapshaper-bbox2-clipping';
import * as BinArray from './utils/mapshaper-binarray';
import * as BufferCommon from './buffer/mapshaper-buffer-common';
import * as Calc from './commands/mapshaper-calc';
import * as CalcUtils from './utils/mapshaper-calc-utils';
import * as Catalog from './dataset/mapshaper-catalog';
import * as ClipErase from './commands/mapshaper-clip-erase';
import * as ClipPoints from './clipping/mapshaper-point-clipping';
import * as Colorizer from './commands/mapshaper-colorizer';
import * as CustomProjections from './crs/mapshaper-custom-projections';
import * as DataAggregation from './dissolve/mapshaper-data-aggregation';
import * as DatasetUtils from './dataset/mapshaper-dataset-utils';
import * as DataUtils from './datatable/mapshaper-data-utils';
import * as DbfImport from './shapefile/dbf-import';
import * as DelimExport from './text/mapshaper-delim-export';
import * as DelimImport from './text/mapshaper-delim-import';
import * as DelimReader from './text/mapshaper-delim-reader';
import * as Encodings from './text/mapshaper-encodings';
import * as Env from './mapshaper-env';
import * as Explode from './commands/mapshaper-explode';
import * as Export from './io/mapshaper-export';
import * as Expressions from './expressions/mapshaper-expressions';
import * as FeatureExpressions from './expressions/mapshaper-feature-expressions';
import * as FileExport from './io/mapshaper-file-export';
import * as FileImport from './io/mapshaper-file-import';
import * as FilenameUtils from './utils/mapshaper-filename-utils';
import * as FileReader from './io/mapshaper-file-reader';
import * as FileTypes from './io/mapshaper-file-types';
import * as FilterGeom from './commands/mapshaper-filter-geom';
import * as Frame from './commands/mapshaper-frame';
import * as FrameData from './furniture/mapshaper-frame-data';
import * as Furniture from './furniture/mapshaper-furniture';
import * as Geodesic from './geom/mapshaper-geodesic';
import * as GeojsonExport from './geojson/geojson-export';
import * as GeojsonImport from './geojson/geojson-import';
import * as Gzip from './io/mapshaper-gzip';
import * as Import from './io/mapshaper-import';
import * as Info from './commands/mapshaper-info';
import * as IntersectionCuts from './paths/mapshaper-intersection-cuts';
import * as Join from './commands/mapshaper-join';
import * as JoinCalc from './join/mapshaper-join-calc';
import * as JoinFilter from './join/mapshaper-join-filter';
import * as JoinTables from './join/mapshaper-join-tables';
import * as JsonImport from './io/mapshaper-json-import';
import * as JsonTable from './datatable/mapshaper-json-table';
import * as KeepShapes from './simplify/mapshaper-keep-shapes';
import * as LatLon from './geom/mapshaper-latlon';
import * as LayerUtils from './dataset/mapshaper-layer-utils';
import * as Lines from './commands/mapshaper-lines';
import * as Logging from './utils/mapshaper-logging';
import * as Merging from './dataset/mapshaper-merging';
import * as MosaicIndex from './polygons/mapshaper-mosaic-index';
import * as OptionParsingUtils from './cli/mapshaper-option-parsing-utils';
import * as OutputFormat from './io/mapshaper-output-format';
import * as OverlayUtils from './clipping/mapshaper-overlay-utils';
import * as Pack from './pack/mapshaper-pack';
import * as PointToGrid from './commands/mapshaper-point-to-grid';
import * as Unpack from './pack/mapshaper-unpack';
import * as ParseCommands from './cli/mapshaper-parse-commands';
import * as PathBuffer from './buffer/mapshaper-path-buffer';
import * as PathEndpoints from './paths/mapshaper-path-endpoints';
import * as PathExport from './paths/mapshaper-path-export';
import * as Pathfinder from './paths/mapshaper-pathfinder';
import * as PathfinderUtils from './paths/mapshaper-pathfinder-utils';
import * as PathImport from './paths/mapshaper-path-import';
import * as PathRepair from './paths/mapshaper-path-repair-utils';
import * as PathUtils from './paths/mapshaper-path-utils';
import * as PixelTransform from './furniture/mapshaper-pixel-transform';
import * as PointPolygonJoin from './join/mapshaper-point-polygon-join';
import * as Points from './commands/mapshaper-points';
import * as PointUtils from './points/mapshaper-point-utils';
import * as PolygonDissolve from './dissolve/mapshaper-polygon-dissolve';
import * as PolygonDissolve2 from './dissolve/mapshaper-polygon-dissolve2';
import * as PolygonHoles from './polygons/mapshaper-polygon-holes';
import * as PolygonMosaic from './polygons/mapshaper-polygon-mosaic';
import * as PolygonNeighbors from './polygons/mapshaper-polygon-neighbors';
import * as PolygonRepair from './polygons/mapshaper-polygon-repair';
import * as PolygonTiler from './polygons/mapshaper-polygon-tiler';
import * as PolylineClipping from './clipping/mapshaper-polyline-clipping';
import * as PostSimplifyRepair from './simplify/mapshaper-post-simplify-repair';
import * as Proj from './commands/mapshaper-proj';
import * as Projections from './crs/mapshaper-projections';
import * as ProjectionParams from './crs/mapshaper-projection-params';
import * as Rectangle from './commands/mapshaper-rectangle';
import * as Rounding from './geom/mapshaper-rounding';
import * as RunCommands from './cli/mapshaper-run-commands';
import * as Scalebar from './commands/mapshaper-scalebar';
import * as SegmentIntersection from './paths/mapshaper-segment-intersection';
import * as ShapeIter from './paths/mapshaper-shape-iter';
import * as ShapeUtils from './paths/mapshaper-shape-utils';
import * as ShpCommon from './shapefile/shp-common';
import * as ShpExport from './shapefile/shp-export';
import * as ShpImport from './shapefile/shp-import';
import * as Simplify from './commands/mapshaper-simplify';
import * as SimplifyFast from './simplify/mapshaper-simplify-fast';
import * as SimplifyPct from './simplify/mapshaper-simplify-pct';
import * as Slivers from './polygons/mapshaper-slivers';
import * as Snapping from './paths/mapshaper-snapping';
import * as SourceUtils from './dataset/mapshaper-source-utils';
import * as Split from './commands/mapshaper-split';
import * as Stash from './mapshaper-stash';
import * as Stringify from './geojson/mapshaper-stringify';
import * as Svg from './svg/mapshaper-svg';
import * as SvgProperties from './svg/svg-properties';
import * as Symbols from './commands/mapshaper-symbols';
import * as TargetUtils from './dataset/mapshaper-target-utils';
import * as TopojsonExport from './topojson/topojson-export';
import * as TopojsonImport from './topojson/topojson-import';
import * as Topology from './topology/mapshaper-topology';
import * as Units from './geom/mapshaper-units';
import * as SvgHatch from './svg/svg-hatch';
import * as SvgEffect from './svg/svg-effect';
import * as VertexUtils from './paths/mapshaper-vertex-utils';
import * as Zip from './io/mapshaper-zip';

Object.assign(internal,
  AnchorPoints,
  ArcClassifier,
  ArcDissolve,
  ArcUtils,
  Bbox2Clipping,
  BinArray,
  BufferCommon,
  Calc,
  CalcUtils,
  Catalog,
  ClipErase,
  ClipPoints,
  Colorizer,
  CustomProjections,
  DataAggregation,
  DatasetUtils,
  DataUtils,
  DbfImport,
  DelimExport,
  DelimImport,
  DelimReader,
  Encodings,
  Explode,
  Export,
  Expressions,
  FeatureExpressions,
  FileExport,
  FileImport,
  FilenameUtils,
  FileReader,
  FileTypes,
  FilterGeom,
  Frame,
  FrameData,
  Furniture,
  Geodesic,
  GeojsonExport,
  GeojsonImport,
  Gzip,
  Import,
  Info,
  IntersectionCuts,
  Join,
  JoinCalc,
  JoinFilter,
  JoinTables,
  JsonImport,
  JsonTable,
  KeepShapes,
  LatLon,
  LayerUtils,
  Lines,
  Logging,
  Merging,
  MosaicIndex,
  OptionParsingUtils,
  OutputFormat,
  OverlayUtils,
  Pack, Unpack,
  ParseCommands,
  PathBuffer,
  PathEndpoints,
  PathExport,
  Pathfinder,
  PathfinderUtils,
  PathImport,
  PathRepair,
  PathUtils,
  PixelTransform,
  PointPolygonJoin,
  Points,
  PointToGrid,
  PointUtils,
  PolygonDissolve,
  PolygonDissolve2,
  PolygonHoles,
  PolygonMosaic,
  PolygonNeighbors,
  PolygonRepair,
  PolygonTiler,
  PolylineClipping,
  PostSimplifyRepair,
  Proj,
  Projections,
  ProjectionParams,
  Rectangle,
  Rounding,
  RunCommands,
  Scalebar,
  SegmentIntersection,
  ShapeIter,
  ShapeUtils,
  ShpCommon,
  ShpExport,
  ShpImport,
  Simplify,
  SimplifyFast,
  SimplifyPct,
  Slivers,
  Snapping,
  SourceUtils,
  Split,
  Env,
  Stash,
  Stringify,
  Svg,
  SvgProperties,
  Symbols,
  TargetUtils,
  TopojsonExport,
  TopojsonImport,
  Topology,
  Units,
  SvgHatch,
  SvgEffect,
  VertexUtils,
  Zip
);
