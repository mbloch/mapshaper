---
title: Raster color palettes
description: Design for coloring data rasters (elevation, measurements, class codes) with the color palettes panel and -classify.
---

# Raster Color Palettes

A styling mode for data rasters, analogous to color palettes for polygon
fills: sequential, diverging and categorical schemes, custom class breaks,
and hypsometric tints for elevation. It reuses the color palettes panel
(`gui-color-scheme-panel.mjs`), its model (`gui-color-scheme-model.mjs`) and
the class breaks dialog (`gui-class-breaks-dialog.mjs`), all described in
[`color-scheme-panel-design.md`](color-scheme-panel-design.md).

## Decisions

- **A palette is a display recipe, not new pixels.** The palette is stored in
  the layer's `raster.view.recipe` and applied when the raster is drawn or
  exported as an image. The samples are unchanged, so the pixel readout,
  `-contours`, `-join`, `-hillshade` and restyling still see the original
  values.
- **`-classify` replaces `-tint`.** `-tint` (see
  [`raster-tone-tint.md`](raster-tone-tint.md)) colors an elevation raster by
  replacing its samples with RGB pixels. A palette does the same job without
  losing the elevations, and `-blend` already takes a raster that isn't an RGB
  image as it is displayed (`getImagePixels()` renders it through
  `view.recipe`), so `-classify ... continuous` followed by `-blend` gives the
  same tinted relief as `-tint` followed by `-blend`. `-tint` is unreleased,
  so it is removed rather than deprecated. What it does that `-classify`
  doesn't yet moves into `-classify` (see Replacing -tint).
- **`-classify` interpolates in OKLCH by default, for every layer type.** See
  Interpolation.
- **`-classify` takes raster targets.** It writes the recipe instead of a
  fill field. The panel already generates `-classify` commands with fully
  resolved colors, `pivot=`, `continuous`, `method=breaks breaks=...`,
  `null-value=` and categorical colors, so a raster panel session is one
  `-classify` in the session history, and replays exactly. Palette export and
  import (GMT `.cpt`, JSON) work unchanged, since both are built around that
  command.
- **Bands are like fields, not layers.** A multi-band raster is one layer,
  and the panel has a band menu where the vector panel has a field menu. All
  bands share one grid, georeferencing, nodata value and CRS; `-clip`,
  `-proj` and `-blur` act on every band together; and `-join` already names
  them `band1`, `band2`, ... in expressions, like fields. A layer per band
  would flood the layers panel for a 13-band scene or a long time series.
  Showing two bands at once means duplicating the layer.
- **Data rasters keep all their bands.** Import currently reads only the bands
  it displays (band 0 for a one- or two-band file, bands 0-2 and alpha for
  three or more; `getDisplaySamples()` in `mapshaper-geotiff-import.mjs`), so
  a 7-band file has 3 bands in its working grid and nothing for a band menu to
  switch to. Rasters that aren't images will import every band, within a
  memory budget (see Import).
- **Band numbers start at 1, everywhere.** As in GDAL, QGIS, GeoTIFF
  metadata and `-join` expressions. A band number is the band's number in the
  source file, found in the working grid through `grid.sampleBands`, so it
  still names the same band when import reads only some of them. `band=` on
  `-contours`, `-hillshade` and `-tint` used to be 0-based and index the
  working grid; it now follows this rule, and `band=0` stops with a message
  that bands are numbered from 1 (done; `getRasterGridBandIndex()` in
  `mapshaper-raster-utils.mjs`, and noted in the changelog as a breaking
  change).

## Which rasters get palettes

A raster can take a palette if its interpretation is `continuous` or
`categorical` (`raster-type=`), or if it is an `image` that is not displayed
as color: one band, or any band count of a non-8-bit type. 8-bit RGB images
keep the tone panel ("adjust colors") and don't offer palettes.

Applying a palette to an `image` raster sets its interpretation: to
`categorical` with a categorical scheme, otherwise to `continuous`. This
matters beyond display, since interpretation chooses `-proj`'s resampling.

## Recipe

```js
raster.view.recipe.palette = {
  band,           // band number in the source file (1-based)
  type,           // 'sequential' | 'diverging' | 'categorical'
  continuous,     // interpolate between stops (sequential, diverging)
  breaks,         // resolved class breaks, or the stops of continuous colors
  colors,         // resolved colors (one more than breaks for classes)
  categories,     // categorical: the value for each color
  nullColor,      // null = transparent
  interpolation,  // 'oklch' (default) or 'rgb', for continuous colors
  command         // the -classify options that produced it, for the panel
}
```

The recipe holds resolved breaks, not the method, so a quantile palette
doesn't change after `-clip` (a vector layer's fills don't either). The
command is kept so the panel can reopen in the same state, as the vector
panel's layer record does.

Panel-only state (pins, vibrance, the long hue path, a preset's range) is
kept with the command, in a `gui` property that commands ignore. Unlike the
vector panel's `WeakMap` record (see [`layer-metadata.md`](layer-metadata.md)),
nothing has to be inferred from the data: the recipe is the style. It goes
wherever `raster.view` goes, so it is already covered by undo
(`captureLayerBefore` captures `layer.raster`), by `copyRasterView()`, and by
snapshots and `.msx` files (`mapshaper-pack.mjs` keeps `view`, minus the
preview).

A palette stays with the layer through commands that keep its values:
`-proj`, `-clip` and `-blur` keep it, with its breaks as they were.
`-hillshade` makes a shading layer from the elevations, and drops it.

`grid.displayBands` is left alone. While a recipe has a palette, the renderer
draws the palette's band and ignores `displayBands.color`; GeoTIFF export,
which reads `displayBands` for its photometric tags, still writes the samples
unchanged.

`-style` takes raster targets, for the display settings that aren't part of
a palette, and for removing one:

- `-style opacity=` sets `view.recipe.opacity`.
- `-style clear` removes the raster's styling (the palette and opacity), as it
  removes every style field from a vector layer. `clear` is applied before
  the command's other options, so `-style clear opacity=0.6` removes only the
  palette. The panel's × runs one or the other. Import-time display settings
  (the gray stretch from `scaling=`, the displayed bands) aren't styling, and
  stay.
- `-style` currently does nothing on a raster, since it returns early for a
  layer with no features. The raster branch rejects options that don't apply
  (`where=`, `ids=`, `fill=` and the other vector properties).

## -classify on rasters

```bash
-classify band1 colors=YlGnBu quantile classes=7
-classify band1 colors=#2b5c3f,#c9b98a,#f4efe6 outer-breaks=0,3000 breaks=1500 continuous
-classify band1 colors=#2b5c3f,#c9b98a,#f4efe6 breaks=30% continuous
-classify band1 colors=BrBG pivot=0 continuous
-classify band1 categorical colors=#476ba1,#d1defa,#decaca,#d99482
```

- The field is a band name, `band1` to `bandN`, as in `-join` expressions;
  `band=3` is accepted too, as in the other raster commands. A single-band
  raster needs neither.
- The same options as for vector layers, except those that write or read
  attributes: `save-as=`, `values=`, `index-field=`, `non-adjacent`, and
  `key`/`key-style=` (a key from a raster palette is later work).
- Values come from the band's valid pixels: not nodata, not outside
  `grid.coverage`, not NaN. Classification uses a sample of at most a million
  of them (as `-tint` did), so quantile breaks are approximate on large
  rasters. The message's table of classes gives pixel counts.
- As for vectors, `continuous` breaks are the inner stops: the end colors go
  at the data's min and max, or at `outer-breaks=`.
- `null-value=` defaults to transparent rather than `#eee`. Nodata pixels in
  rasters usually mean "not mapped", not "missing data".
- Categorical classification needs an integer band; float bands are an error.
  Categories are the band's unique values in increasing order (not order of
  appearance, which for a raster is just reading order).

## Replacing -tint

What `-tint` does that `-classify` doesn't yet:

- **Breaks as percentages.** `breaks=0,30%,100%` mixes values with
  percentages of the data's range. Sea level is often the one fixed break in
  a hypsometric tint, and the rest are easiest to give relative to the
  data. `-classify breaks=` takes `%` values for every layer type. For
  rasters, the range ignores the lowest and highest 0.1% of the valid pixel
  sample, so a spike or an artifact in the bleed area doesn't move every break
  (`getTrimmedRange()`, which moves from `mapshaper-tint.mjs`). For vector
  layers the range is the data's min and max: trimming a fraction of a few
  hundred features would drop real values. The message reports the values
  the breaks resolved to, which can be pasted in to make adjacent map sheets
  match (what `-tint verbose` did).
- **OKLCH interpolation by default.** Now the default for every layer type
  (see Interpolation).
- **Opacity.** `-tint opacity=` multiplied the alpha of the baked pixels. A
  display setting replaces it: `view.recipe.opacity`, applied in the renderer
  and SVG export, for any raster, not only one with a palette. It is set by
  `-style opacity=` on raster targets (see Recipe).
- **background=** is dropped. Compositing a translucent raster over a color
  only matters for baked pixels; on a map, the color under the raster is
  whatever is drawn under it. Nodata pixels take `null-value=`.
- **Colored GeoTIFFs.** A palette is a display setting, so GeoTIFF output
  still writes the samples. Writing the colors (and running `-tone` or
  `-sharpen` on a palette raster) would need a command that renders any
  raster's display into RGB pixels, as `-blend` does internally. Left until
  someone needs it.

Removing `-tint` touches `mapshaper-tint.mjs`, its options and dispatch, the
`-tint` tests in `tone-tint-test.mjs`, `reference.md`, the changelog entry,
and the `-tone` error that points elevation rasters to `-tint` (it will point
to `-classify` and `-hillshade`). `getColorRampTable()` and `getRampIndex()`
in `mapshaper-raster-color.mjs` stay: the palette renderer uses them. The
`-tint` half of `raster-tone-tint.md` gets a note that it was replaced by
this design.

## Interpolation

`-classify interpolation=` has defaulted to `rgb` so that existing output
wouldn't change. The default becomes `oklch` for every layer type:

- RGB interpolation gives muddy, dark midpoints between hues (see "Why OKLCH"
  in [`color-scheme-panel-design.md`](color-scheme-panel-design.md)). The
  panel already uses OKLCH for everything, and `-tint` defaulted to it; with
  raster palettes going through `-classify`, an RGB default would make
  hypsometric tints worse on the command line than in the GUI.
- It changes the colors wherever `-classify` interpolates between two
  colors: a `colors=` list stretched to more classes, `continuous`, and
  `stops=`. Numeric `values=` and categorical colors are unchanged, and so
  are preset sets used as given (a ColorBrewer set at a size it has).
- `interpolation=rgb` keeps the old colors. A breaking change in the
  changelog.
- The panel stops adding `interpolation=oklch` to its commands, and the
  `-classify` option description and `reference.md` give the new default.
  `color-scheme-panel-design.md` is updated where it says the default is
  `rgb`.
- Tests that depend on RGB output either pass `interpolation=rgb` or get new
  expected colors, case by case: a test of the classification keeps its
  colors with `interpolation=rgb`; a test of the colors is updated.

## Rendering

The palette is applied in `renderRasterGridPreview()` (GUI previews,
viewport previews, reprojected previews) and in the SVG export path that
renders from the grid. Both already work from sample values, then color them,
which is the order a palette needs.

- **Continuous colors:** `getColorRampTable()` and `getRampIndex()` in
  `mapshaper-raster-color.mjs`, written for `-tint`; one table lookup per
  pixel. The table follows the palette's `interpolation`, so an
  `interpolation=rgb` palette needs an RGB variant of the table.
- **Classes:** a binary search over the breaks, giving a color index.
- **Categories:** for 8- and 16-bit types, an array indexed by value; for
  wider types, a `Map`.
- The table is built once per render and cached on the recipe's key, like
  scaling stats (`getRasterScalingStatsKey()`), so redrawing during pan and
  zoom doesn't rebuild it.

Resampling has to respect the palette:

- **Only the palette's band is resampled.** The bilinear and average samplers
  build a value array for every band of every output pixel. With all bands
  imported, that cost would grow with the band count for no benefit.
- **Categorical rasters are sampled nearest-neighbor**, in previews,
  reprojected previews and SVG export. SVG export's `average` downsampling
  would otherwise average class codes into codes of other classes, and
  bilinear sampling would put a different class along every boundary.
- **Classed palettes on continuous rasters** resample values and then classify
  them, which is correct: a boundary between two classes stays a boundary
  between those two colors, at subpixel position.
- SVG export writes categorical palettes as PNG, since JPEG blurs class
  boundaries.

## Import

Rasters that aren't 8-bit images import every band, until a sample budget
runs out:

- The budget is in samples (pixels times bands), starting at
  `DEFAULT_MAX_IMPORT_PIXELS` (16e6) times 4. Above it, the import resolution
  is reduced, as it already is for large single rasters
  (`mapshaper-raster-import-size.mjs`), and a message says so.
- A `bands=` import option chooses the bands (`bands=all`, `bands=1,4,5`),
  for files where all bands at a useful resolution don't fit.
- `grid.sampleBands` records which of the file's bands are present, as it
  already does for `source_bands` imports, so the band menu can name them by
  their file band numbers.
- GeoTIFF band descriptions (GDAL metadata `DESCRIPTION`), if present, are
  shown in the band menu next to the band number.
- The default display is unchanged: a multi-band data raster still shows its
  first band as gray until it has a palette.

## Panel

The panel opens from the layer menu and the arrow menu ("color palette") for
rasters that can take one, alongside "adjust colors" for images.

- The **field menu becomes a band menu** for rasters. A single-band raster
  hides it.
- **Sequential, Diverging and Categorical tabs** as for polygons. The
  Categorical tab is shown only for integer bands with at most a few hundred
  unique values.
- **Continuous colors on by default** for continuous rasters. Classed colors
  on an elevation model look like contour bands, which is a choice, not a
  default.
- **No data**: the chit defaults to transparent (a checkerboard chit).
- The **class breaks dialog** works unchanged, given values from the band
  (see the next section). Its histogram uses the pixel sample; counts are
  shown as a percentage of valid pixels, since millions of pixels are hard to
  read.
- Everything done while the panel is open is one undo step and one
  `-classify`, as for polygons.

### Value source

The model's functions take a layer and read a field
(`getSchemeValues(scheme, lyr)`, `getCategories(lyr, field)`,
`getBreakClassCounts(...)`). They will take a value source instead:

```js
{
  getValues(),          // numbers to classify (a pixel sample for rasters)
  getCategories(),      // unique values, in -classify's order
  getNoDataCount(),
  countUnit             // 'features' | 'pixels'
}
```

with one implementation that reads a field and one that samples a band. The
sample is cached per band and grid, since the panel reads it on every change.

## Hypsometric tints

Elevation palettes get their own group in the palette menu ("Elevation"),
through `getColorSchemeGroups()`. There are two kinds:

- **Relative ramps** are ordinary sequential ramps (low to high colors) that
  are spread over the data's range like any other preset.
- **Fixed-elevation presets** give each color an elevation, in meters (for
  example a GMT `geo`- or ETOPO-style table). Choosing one gives custom breaks
  at those elevations, converted to the band's vertical units
  (`grid.verticalUnits`; unknown units are taken for meters, as by other
  elevation commands). The breaks are kept even where they are outside the
  data's range, so that 1500 m has the same color in every map. A "fit to
  data" toggle scales the stops above sea level so the top stop is the data's
  maximum (and those below so the deepest is the minimum), keeping 0 fixed.
- **Land and sea ramps** are diverging schemes with the pivot fixed at 0:
  bathymetry below, land above, each side its own gradient (continuous
  diverging colors with no pivot class). They are listed in the Elevation
  group but open the Diverging tab.
- Presets are tables of `[elevation, color]`, kept with the other color
  schemes. cpt-city and GMT tables can also be brought in through the
  panel's existing GMT import.

A continuous palette puts its outer colors at the data's min and max, so
fixed stops beyond the data range need `-classify` to place colors at given
values outside the data. `outer-breaks=` already does this: with
`continuous`, the end colors go at the two outer breaks, and values beyond
them are clamped (`getSequentialClassifier()`). A preset becomes
`outer-breaks=-11000,8800 breaks=0,200,500,... continuous`. Whether this
combines correctly with `pivot=`, for land and sea ramps, is still to be
tested.

## Phases

1. 1-based `band=` in `-contours`, `-hillshade` and `-tint`, resolved through
   `grid.sampleBands` (done). Import every band of data rasters, within the
   sample budget, with `bands=`. Band names in `-info`. Done: the GeoTIFF
   importer's `getImportBands()` chooses the bands and sets
   `grid.displayBands` (band 1 in gray) when the default display would be
   wrong; descriptions are kept in `grid.bandDescriptions`, keyed by file band
   number. A data raster displaying band 1 still hides a pixel only when every
   band is nodata; palette rendering (phase 3) tests the displayed band.
2. `-classify` defaults to `interpolation=oklch`, and `breaks=` takes
   percentages (vector layers). Done; percentages are resolved by
   `resolvePercentBreaks()` in `mapshaper-percent-breaks.mjs`, which the
   raster branch will call with its trimmed range.
3. Palette rendering: the recipe, the color tables, single-band and
   nearest-neighbor resampling, SVG export, `view.recipe.opacity`. Unit tests
   (mocha) on `renderRasterPreview()` output. Done: tables are built and cached in
   `mapshaper-raster-palette.mjs` (continuous colors use `-classify`'s pair
   interpolators, so they match vector output, including `vibrance`);
   `renderPaletteGridPreview()` in `mapshaper-raster-utils.mjs` draws them.
   Pixels outside `grid.coverage` or masked by an alpha band are transparent
   rather than taking the null color. The GUI's reprojected preview
   reprojects only the palette's band (`getRasterPaletteBandGrid()`), and
   both GUI preview caches key on `getRasterPaletteKey()`.
4. `-classify` on rasters: band fields, pixel sampling, trimmed percentage
  breaks, the recipe, messages; `-style opacity=` and `-style clear` on
  rasters. Remove `-tint`, moving its tests that still apply to `-classify`.
   Done: `classifyRasterLayer()` (in `mapshaper-classify.mjs`) runs the
   vector classifier on the sample, and `mapshaper-raster-classify.mjs`
   turns the result into a palette. Tests compare rendered pixels with
   `-classify` on a point layer of the same values. Ranked (`quantile
   continuous`) colors can't be a table of stops exactly, so the palette has
   a stop at each value of the sample (if it has at most 256 values, as
   integer rasters often do) or at 32 quantiles, clamped to `outer-breaks=`.
   Categorical classification scans every pixel for its categories.
5. Panel: the value source, the band menu, the raster entry points, defaults,
   undo. A browser test that applies and undoes a palette on a DEM.
6. Hypsometric tints: the Elevation group, fixed-elevation presets, fit to
   data, land and sea ramps. Begun: "Fixed elevations" is a breaks method on
   the Sequential tab, offered for a band whose values are all between
   -12,000 and 9,000 m. It shows only the Elevation presets
   (`hypsometric-schemes.mjs`: Desert, Steppe, Tropical, Temperate, Boreal,
   Polar, one for each climate zone), as continuous colors at their stops,
   and gives `-classify breaks=... outer-breaks=... continuous`. The zones
   are a 1° grid of their weights (`hypsometric-climate.mjs`, about 19 KB
   of base64) from the Köppen-Geiger classes for 1991-2020 (Beck et al.
   2023, CC BY 4.0): hot deserts (BWh) are Desert and steppes (BS) Steppe;
   cold desert (BWk) pixels are part Steppe, by where Blue Marble's summer
   color of the pixel lies between the Sahara's and steppe's (much of
   Kazakhstan, the Gobi, the Great Basin and Patagonia is shrub and grass
   rather than sand; the Taklamakan stays desert); each
   other class's zone comes from its letters (A Tropical; C Temperate; D
   Temperate with hot summers, Boreal with cold ones, and half of each with
   warm ones; E Polar), and savanna and dry-summer classes are part Steppe,
   by where Blue Marble's summer color of the class lies between steppe and
   its humid zone (hot Mediterranean 0.75, dry-summer continental 0.4-1,
   savanna 0.35). (Steppe was first part of Desert, which made grasslands
   such as Central Asia's look like desert.) A cell's weights are those of its
   land below 2000 m: Köppen classifies mountains by their own climate
   (Tibet and the high Andes are tundra), which the presets' elevations
   already show; below 2000 m, few places outside the polar regions have a
   cold class. Tundra counts only below 1000 m, since higher tundra is
   alpine (it gave the Coast Mountains light patches of Polar). Cells
   without such land, and sea within a cell of land,
   take their neighbors' weights; other sea is left out. The presets'
   colors were measured from Patterson's Equal Earth physical map, at stops
   of 50, 200, 600, 1000, 3000 and 6000 m (at 6000 m, Polar's is white and
   the others' a very light grayish tan, instead of the fit's bluish gray,
   which tinted Tibet and the Andes): a
   least-squares fit over its land pixels, each pixel a blend of the six
   ramps by the grid, with the three humid zones sharing their colors from
   1000 m up and the five land zones from 3000 m up. (Boreal mixed from
   Temperate and Polar fitted the map as well, but Temperate's colors,
   fitted to the boreal forests too, came out too pale for the eastern
   US and Europe.) Desert's colors up to
   1000 m are held at the Sahara's (brown highlands), and the others fitted
   around them. Ten stops (adding 0, 2000, 4000 and 5000 m) fitted the map
   no better: the six-stop ramps are within a just-noticeable difference of
   them except in the coastal strip below 50 m, where the 0 m colors had
   picked up the sea's color from coastal pixels. (A first version fitted
   the zones to Patterson's map too, as four presets; his tints follow land
   cover as he painted it rather than climate, so its zones didn't match
   real ones: its Temperate was mostly boreal forest, and its Polar took in
   coasts and islands. See `__hypsometric/README.md`.) The preset it starts
   with is the one with the most weight at a 9 x 9 grid of points across
   the raster, or Temperate if the points are all at sea or the projection
   is unknown or can't be inverted. The grid's weights are also what a
   blended palette uses. Stops can be recolored, and moved in the class breaks dialog
   (end stops too, and beyond the data), but not added; the dialog's range
   runs from the stop at or below the data's min to the stop at or above its
   max, leaving out the stops beyond those; choosing a preset
   brings back its elevations, and another method keeps the colors as a
   custom ramp. `-classify hypsometric=desert|steppe|tropical|temperate|boreal|polar`
   gives a preset's palette from the command line, and `hypsometric=blended`
   (`mapshaper-raster-hypsometric.mjs`) mixes the six by climate: the
   palette is the preset with the most weight (by area) across the raster,
   for anything that draws it unblended, plus `palette.blend` with the six
   ramps (in the band's units) and a field of the presets' weights in the
   raster's coordinates (up to 360 cells a side, sampled from the climate
   grid; cells at sea are filled in from their neighbors and smoothed, so
   that `sea=land` fades between coasts; each cell has a weight for each
   preset but the last, which has the rest). Each pixel mixes the six ramps' colors (in RGB) by the field's
   weights, bilinear between its cells (`renderBlendedPaletteGridPreview()`).
   `-proj` makes the field again in the new CRS; `-clip` keeps it, since
   its coordinates don't change. The GUI's reprojected preview draws a grid
   in the display CRS, so it passes a field for the view, in that CRS
   (`renderRasterPreview()`'s `blendField`). In the panel, Blended is an
   item in the Elevation palette menu, offered where the raster can be
   placed on land. The six presets have the same six elevations, which a
   blend shares: `breaks=` (every elevation) moves them all, and named
   lists in `colors=` (`colors=desert:...,polar:...`) recolor a preset, a
   color at each elevation (`getBlendRamps()`). `splitRampLists()` splits
   a list option into its unnamed and named lists, and `splitRampOptions()`
   checks the names against `hypsometric=`: the climate presets' names only
   in `colors=` of a blend, `sea:` always, and a single preset's own name
   as if unnamed. With a single preset, `colors=` and `breaks=` recolor and
   move it (`customizeRamp()`), and `classed` makes classes from each stop
   up to the next (`getRampClasses()`). In the panel, a blend keeps the colors of
   its recolored presets in `scheme.blendColors` (see
   `getBlendRampColors()`), and becomes Custom until they are all their
   presets' again; choosing a preset or another method turns it off.
   Fixed elevations then moved from the Sequential tab's breaks methods to
   an Elevation tab of their own (`getSchemeTab()`: internally they are
   still sequential schemes with `method: 'elevation'`). The tab is offered
   for bands that could hold elevations, and the panel opens on it when the
   raster says it holds elevations: known vertical units (fetched DEMs have
   them), or a band description or layer name like `dem`, `elev`, `srtm`
   (`rasterBandIsElevation()`), not values in range alone. It starts Blended
   where the raster can be placed on land, otherwise with Temperate. Its rows
   are Land (the presets and Blended) and Sea, each with a palette menu and
   a Customize button. The colors aren't tiles in the panel: Customize opens
   the class breaks dialog ("Elevations and colors", listed from the highest
   elevation down), which has a color chip
   at each stop, on the rule between two classes, whose tiles are gradients
   from one chip's color to the next (`getElevationStopChips()`,
   `getElevationClassLanes()`). A blend has a column of chips and tiles for
   each preset; neighboring presets with the same color share a chip, which
   recolors all of them, or the ones left checked under the table. `-classify sea=`
   leaves out the sea: with `sea=transparent` (the default with
   `hypsometric=`, and what the panel gives), pixels at or below 0 that
   connect, through other such pixels, to the grid's edge or to a pixel without a
   value (nodata, outside the coverage, alpha 0) are not drawn
   (`getRasterSeaMask()`, a flood fill cached by samples and band, made on
   the reprojected grid for the GUI's preview). Enclosed basins below sea
   level (the Dead Sea, Death Valley, the Caspian, whose DEM surface is
   about -28 m) stay land and take the 0 m color; one that the grid's edge
   cuts through looks like sea. `sea=land` colors them all. `sea=pale|blue|gray`
   colors the sea by depth (`bathymetric-schemes.mjs`; the palette gets
   `sea: 'Pale'` and `seaRamp: {breaks, colors}` in the band's units, drawn
   continuously through its own table, `getRasterSeaTable()`), blended or
   not. Pale is fitted to the ocean of Patterson's map by depth
   (`__hypsometric/bathy.mjs`); Blue and Gray have its lightness steps,
   stronger, with more or less chroma. `colors=sea:...` with
   `breaks=sea:...` give a custom sea ramp (`sea: 'custom'`), and either
   one recolors or moves a `sea=` preset (also `'custom'`), and `hypsometric=none` leaves the
   land out (`palette.land = 'transparent'`, with the sea's colors as the
   palette's own). In the panel, the sea is a fixed-elevation scheme of its
   own inside the elevation scheme (`scheme.seaScheme`, see
   `getSeaScheme()`): the Sea row has a palette menu (Transparent and the
   Bathymetry presets) and a Customize button that opens a second class
   breaks dialog ("Sea depths", with its colors, listed from 0 down, whose
   range ends at 0). The Land menu has Transparent (`scheme.landTransparent`);
   making both transparent brings back the other. Still to do: fit to
   data.
7. Later: a command that renders a raster's display into RGB pixels (colored
   GeoTIFFs, `-tone` on palette rasters), GeoTIFF `ColorMap` import as a default categorical palette (NLCD
   and other palette TIFFs), category labels from raster attribute tables,
   palette keys, and a palette in the pixel readout (the class under the
   cursor).

## Open questions

