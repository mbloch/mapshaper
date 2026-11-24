---
title: Shaded relief
description: A step-by-step guide to making shaded relief maps in Mapshaper's web app, using the hillshade, color, palette and blend panels and the -fetch command to download elevation data and imagery.
---

<!--
DRAFT NOTES (delete before publishing)
- Image placeholders look like:  > **[IMAGE: filename.jpg]** description
  Replace each with ![alt](/docs/images/filename.jpg).
- Open questions for the author are marked  > **[TODO]**
-->

# Shaded relief

> **[IMAGE: shaded-relief-intro.jpg]** The finished example: a hillshade blended with aerial imagery (or a tinted world map). This should be the best-looking image on the page.

Mapshaper can build shaded relief maps from start to finish, using the `-fetch` command to download elevation data and imagery and a set of new interactive panels and console commands to transform the source data into shaded relief:

- the **hillshade** panel turns an elevation raster into shaded relief
- the **adjust colors** panel changes the lightness, saturation, contrast and hue of imagery
- the **color palette** panel colors an elevation raster with hypsometric tints
- the **blend hillshade** panel combines a hillshade with imagery or a tinted raster
- the **-deshadow** command removes shadows from hi-res aerial imagery

The interactive panels run ordinary Mapshaper commands under the hood. You can view the commands by typing `history` in the console. See [Putting it together](#putting-it-together).

## Before you start

**Finding the tools.** Panels are opened from a layer's menu in the layers panel (the menu button at the right of the layer's entry). Each is only offered on layers where it makes sense, so if a menu item is missing, check that the right layer is selected.

| To do this | Open this on the layer | On this kind of layer |
| --- | --- | --- |
| Make a hillshade | **hillshade** | an elevation raster |
| Change the colors of an image | **adjust colors** | an RGB image |
| Color elevations with a tint | **color palette** | an elevation raster |
| Blend a hillshade with another raster | **blend hillshade** | an image or a tinted raster, in the same frame as a hillshade |

**Commands without panels.** `-fetch` and `-deshadow` have no panel. Run them from the console (pressing the **space bar** opens the console). In the console the leading `-` is optional for a single command, e.g. `fetch 3dep-1m`.

## Part one: create a hillshade

A hillshade is a raster image that makes terrain easy to read and pleasing to look at on a map. Cartographic hillshades aren't meant to be realistic renderings of sunlight on terrain. They exaggerate relief, bring out ridges and valleys, and generalize detail, so that the terrain looks good and works as a base layer without competing with the rest of the map.

The hillshade panel has controls for generalizing terrain, adjusting shading and adding optional tints:

- **Terrain smoothing:** Mapshaper uses a variation of feature-preserving smoothing that adapts the amount of smoothing to the steepness of the terrain.
- **Special effects** can be combined and adjusted separately: vertical exaggeration, multiple fill lights, ambient darkening of valleys, texture shading, aerial perspective and a tone curve.
- **Tinting.** An opaque hillshade can be given custom base, shadow and highlight colors. Tinting can also be applied when the hillshade is blended with imagery or other base layers.

### Step one: get elevation data in a map frame

A **map frame** is a rectangle that defines the geographical extent of a map, its projection and its output size. When `-fetch` is run, the area to download, the coordinate system and the resolution are all taken from the frame. The frame's size and crop also apply when the finished map is exported.

There are two ways to get started.

#### Option one: draw a frame and download a DEM to fit it

1. Turn on a basemap (**Display &rarr; Basemaps**) to give yourself something to draw over, and zoom to your area of interest.

   > **[IMAGE: shaded-relief-frame-1-basemap.png]** The basemap with the area of interest in view.

2. Draw a rectangle around the area you want to map: choose **rectangle tool** from the arrow menu, then shift-drag on the map. This creates a layer containing your rectangle.

3. Project the rectangle into the projection you want for the finished map. Open the console and run a [`-proj`](/docs/reference.html#-proj) command, for example `proj merc` (Mercator, generally appropriate for small areas), `proj albersusa` for the contiguous U.S., or `proj eqearth` for a world map. See [Map projections](/docs/guides/projections.html) for more.

   > **[TODO]** Confirm the best recommendation for readers choosing a projection (maybe link to a short list of good defaults by map scale).

4. Click **+ New frame** in the layers panel. In the dialog, give the frame an **Output width** (e.g. `1200px`), optionally an **Aspect ratio** (e.g. `3:2`), and click **Fit visible layers** to fit the frame to your rectangle. (**Draw on the map** lets you draw the frame directly instead.)

   > **[IMAGE: shaded-relief-frame-2-dialog.png]** The New map frame dialog.

5. Download elevation data for the frame. In the console, run `fetch` with the name of an elevation source:

   ```bash
   -fetch mapterhorn
   ```

   A new raster layer appears at the bottom of the frame. The area, the projection and the resolution all come from the frame, so the new layer is already in the map's projection, with enough resolution for the output size.

   > **[IMAGE: shaded-relief-fetch-dem.png]** The fetched DEM, drawn in grayscale in the frame.

**Choosing an elevation source.** Run `-fetch sources` to see the full list.

| Source | Coverage | Resolution | Notes |
| --- | --- | --- | --- |
| `mapterhorn` | World | 30 m, finer where national lidar is available | Good first choice for most maps. Requires attribution. |
| `tilezen` | World | about 10 m in the U.S., 30-90 m elsewhere | Mostly public domain. |
| `copernicus` | World | 30 m | Requires attribution. |
| `3dep` | United States | 10 m | Public domain. |
| `3dep-1m` | United States | 1 m where there is lidar, 10 m or coarser elsewhere | Public domain. Slow for large areas (tiles are rendered on demand). Best for detailed, large-scale maps. |

> **[TODO]** Confirm the "good first choice" recommendation and add a sentence on how many tiles/how long a typical fetch takes. `max-tiles=` (default 500) stops runaway downloads; mention it here or in a tip.

**Tips**

- Run `-fetch` *after* you create the frame and project your data. A fetched raster is a snapshot of the frame at the time of the download. If you change the projection or resize the frame afterward, the raster is left at the wrong resolution, and you should fetch again.
- `-fetch` downloads a little extra data around the frame (`bleed=`, 10 pixels by default), so that smoothing and shading don't produce artifacts at the edges. The extra area is cropped when you export.
- Fetched rasters have two pixels for each pixel of the frame (`raster-res=2`), so that maps look sharp on high-density screens and in PNG output.

#### Option two: import your own DEM

If you already have a DEM, such as a GeoTIFF from a national mapping agency, [OpenTopography](https://opentopography.org/) or another source, you can use it instead of `-fetch`.

1. Import the GeoTIFF, by drag and drop or with the **Add files** button.

   Select **with advanced options** in the import dialog and add `raster-type=continuous`. This marks the file as containing measurements rather than a picture, so that reprojecting it doesn't mix nodata pixels with real values.

2. If the DEM is in lat-long coordinates (most are), reproject it to the projection you want for the map. For example, `proj albersusa` or `proj merc`. A hillshade should be made *after* reprojecting, so that the light direction stays fixed relative to the page and the shading matches the output pixel size.

3. Large DEMs are slow to process and most of their pixels will be outside your map. If your DEM covers a much larger area than you need, clip it first, using the rectangle tool or [`-clip`](/docs/reference.html#-clip).

4. Click **+ New frame** and choose **Fit visible layers** to create a frame around the DEM. (The frame's extent and projection are the DEM's. You can resize the frame afterward with **resize frame** in the frame's menu.)

   > **[IMAGE: shaded-relief-import-dem.png]** An imported DEM with a frame.

Elevation data from `-fetch` and imported DEMs work the same way in the rest of this guide.

### Step two: create a hillshade from the elevation layer

Select the elevation layer and choose **hillshade** from its menu. The hillshade panel opens, and the map shows a live preview of the shading. Drag a slider to see the effect on the part of the map in view; when you release it, the entire raster is updated. Nothing is changed until you click **Apply**.

> **[IMAGE: shaded-relief-panel-overview.png]** The hillshade panel beside a preview of the map.

When you click **Apply**, Mapshaper runs a [`-hillshade`](/docs/reference.html#-hillshade) command and adds a layer named "hillshade". **Keep elevation** (checked by default) keeps the DEM in the layers panel; you'll need it later to make hypsometric tints, or to remove shadows from imagery. Press **Cancel** or the **x** to close the panel without making changes.

#### Shading: opaque or transparent

The panel's **Style** setting controls how the hillshade is drawn.

- **Opaque** colors every pixel, running from a *shadow* color through a *base* color (flat ground) to a *highlight* color. The hillshade is a complete image on its own, and it's the best input for blending with other layers (see parts two to four). It's also the way to make a colored hillshade to use as a base layer. The panel starts on this style.
- **Transparent** is drawn with black shadows and white highlights, and flat ground is fully transparent, so the layers below the hillshade show through. Use this style when you want to overlay the hillshade on a layer without blending, for example on a basemap or on a map of land cover.

> **[IMAGE: shaded-relief-style-compare.jpg]** The same terrain in the two styles: opaque (left) and transparent over a colored layer (right).

The sliders and colors depend on the style:

- **Opaque:** **Base** is the color of flat ground. **Shadow** and **Highlight** colors are derived from the base color until you choose them yourself ("auto" appears in their fields). The **Shadows** and **Highlights** sliders adjust how far the shading goes from the base color toward its shadow and highlight colors, so they control contrast.
- **Transparent:** **Shadows** sets the opacity of the darkest shadows. **Highlights** sets the opacity of the brightest highlights, relative to the shadows. **Shadow** and **Highlight** are the colors of the shading, black and white by default.

**Making a colored hillshade.** An opaque hillshade with a colored base is a quick way to make a stand-alone relief map. Choose a base color (try a light tan or a pale green-gray), and adjust the shadow and highlight colors until the result looks right. A cool shadow color and a warm highlight color give the shading a hand-painted look.

> **[IMAGE: shaded-relief-colored-hillshade.jpg]** A hillshade with a tan base color.

#### Light

- **Azimuth** is the direction of the main light, in degrees clockwise from north. The default of 315° (northwest) lights the map from the upper left, the usual convention. Lighting from the south can make valleys look like ridges (the effect is called relief inversion), so the slider doesn't go there.
- **Altitude** is the angle of the light above the horizon. Lower values give longer, darker shadows and fewer highlights. Higher values give flatter lighting.
- **Lighting** controls how the main light is supplemented by fainter lights from other directions. **Hard** uses the main light alone, for the most contrast. **Balanced** (the default) adds fill lights to soften shadows. **Soft** adds still more, which brightens slopes that face away from the light and shows more midtones.

> **[IMAGE: shaded-relief-light-compare.jpg]** Hard, balanced and soft lighting, side by side.

#### Terrain

- **Exaggeration** multiplies the vertical scale of the terrain. The slider is centered on an automatic value that depends on the scale of the map: relief flattens out as maps get smaller, so small-scale maps need more exaggeration (1 at 50 meters per pixel and finer, about 4.5 at 1 km per pixel, capped at 10). The readout shows the exaggeration in use, and each whole unit along the slider doubles or halves it.
- **Smoothing** (Off, 1-4) removes noise and small landforms while keeping ridges and valleys sharp. Higher levels remove larger features. Level 1 often looks a little cleaner than no smoothing, especially with high-resolution data, and higher levels suit maps that cover large areas. Smoothing only changes the hillshade. To smooth elevations for other uses, like contours or tints, use [`-smooth-terrain`](/docs/reference.html#-smooth-terrain).

> **[IMAGE: shaded-relief-smoothing-compare.jpg]** A mountainous area at smoothing Off, 1, 2 and 3 (or similar).

#### Effects

Effects add depth to the basic hillshade.

- **Ambient** darkens places with a restricted view of the sky: valleys, canyons and the bases of cliffs. Ridges are slightly lightened. It adds a sense of depth that a single light can't (default 0.5).
- **Texture** adds *texture shading*, which emphasizes the pattern of ridges and valleys in rugged terrain, even where they are not oriented to the light (default 0).
- **Aerial** reduces contrast at low elevations, so that the lowlands fade and high mountains stand out, like atmospheric haze (default 0).
- **Gamma** sets the shape of the tone curve where slopes meet flat ground. Values below 1 strengthen faint shading, so that gentle terrain is more visible (default 0.7).

> **[IMAGE: shaded-relief-effects-compare.jpg]** The same terrain with ambient, texture and aerial added one at a time.

> **[TODO]** Add a suggested starting recipe, e.g. "For rugged terrain, try ambient 0.7 and texture 0.1" (these are the settings used in the Canyon example).

#### Other options

A few settings have no sliders and are available in the console:

- `-hillshade min-elevation=0` flattens the sea floor at sea level, which keeps the sea clear of shading.
- [`-sharpen`](/docs/reference.html#-sharpen) sharpens the finished hillshade with an unsharp mask. A light touch (`-sharpen 0.25`, the default) brings out crisp ridgelines on high-resolution maps.
- `-hillshade verbose` prints every setting, including the automatic ones.

## Part two: blend a hillshade with imagery

Draping a transparent hillshade over a satellite image often looks muddy. Shadows desaturate the colors and the highlights lay a white haze over them. The **blend hillshade** panel combines the two layers pixel by pixel, so the hillshade adjusts the lightness of the image while the colors stay true.

### Step one: prepare the imagery

#### Fetch imagery for the frame

Make sure the map frame exists (see [part one](#step-one-get-elevation-data-in-a-map-frame)), then run `-fetch` with the name of an imagery source:

```bash
-fetch naip
```

The new image layer is in the same frame as the DEM, with the same projection and resolution, so the two layers line up exactly.

> **[IMAGE: shaded-relief-fetch-imagery.jpg]** NAIP aerial imagery in the frame.

| Source | Coverage | Resolution | Notes |
| --- | --- | --- | --- |
| `naip` | Conterminous U.S. | 0.3-1 m | Aerial photos. Use `year=` to choose a year; the default is the newest for each state. Public domain. |
| `usgs` | U.S. (world at small scales) | about 1 m | Faster than `naip`, mostly NAIP from 2017-2021. Public domain. |
| `sentinel2` | World | 10 m | Satellite image, season of `year=` (default is last year). Requires attribution. |
| `landsat` | World | 30 m | Satellite image. Public domain. |
| `eox` | World | 10 m | Cloudless mosaic of Sentinel-2 images. 2018 and later editions are non-commercial. |
| `bluemarble` | World | 500 m | A smooth, cloud-free image for world and continental maps. |

> **[TODO]** Add a sentence on which imagery source is recommended at which map scale (e.g. `bluemarble` for the world, `eox` or `sentinel2` for regions, `naip` for local maps).

#### Remove shadows from aerial imagery

Aerial photos include real shadows, cast by the terrain at the time the picture was taken. These clash with the shadows of the hillshade, which is lit from a different direction. The experimental [`-deshadow`](/docs/reference.html#-deshadow) command uses the DEM to find shadowed areas and dark slopes, and relights them to a consistent brightness.

Select the imagery layer and, in the console, run `-deshadow` with the name of the DEM layer (the layer that `-fetch` created, named after its source):

```bash
-deshadow dem=mapterhorn
```

Add `despeckle` to also brighten small dark spots the DEM can't explain, such as the shadows of low ledges. Only use it on terrain without trees or water, which `despeckle` would brighten too.

> **[IMAGE: shaded-relief-deshadow-compare.jpg]** Before and after `-deshadow`: shadows in the canyon are gone, leaving even lighting.

Shadow removal works best on high-resolution aerial images with a distinct shadow pattern, such as canyons and mountains. Results are less reliable on mosaics of images taken at different times of day, and on images without distinct shadows. Skip this step for satellite imagery from `sentinel2` or `eox`, which tends to be taken at midday with little shadow.

> **[TODO]** Confirm that the satellite-imagery advice is true and consistent with how -deshadow behaves on `eox`/`sentinel2`/`landsat`.

The DEM has to cover the image and must still be present, so don't skip **Keep elevation** when you make the hillshade (or run `-deshadow` first).

#### Adjust the colors of the imagery

Select the imagery layer and choose **adjust colors** from its menu to open the **Color & tone** panel. Its sliders change:

- **Lightness** darkens (below 1) or lightens the image
- **Saturation** makes colors more or less vivid (0 is gray)
- **Contrast** spreads or flattens lightness around the image's midpoint
- **Gamma** lightens or darkens midtones
- **Hue** shifts all hues toward yellow-tan (positive values) or away from it (negative values)
- **Opacity** makes the image more or less transparent

> **[IMAGE: shaded-relief-tone-panel.png]** The Color & tone panel.

Look for an image that's a little brighter, more colorful and lower in contrast than the final result you want. The hillshade supplies the contrast, and shading lowers lightness. If the image is dark before you blend it, shadows will have little room to show. The Canyon example used `-tone lightness=1.49 saturation=1.18 contrast=1.23 hue-shift=0.25`, and the sliders are an easy way to find the right values for a particular image. Click **Apply** to commit the change as a [`-tone`](/docs/reference.html#-tone) command.

### Step two: blend the hillshade with the image

Make a hillshade, as described in [part one](#step-two-create-a-hillshade-from-the-elevation-layer). Opaque hillshades blend best. If you have not made one yet, select the DEM layer, open the hillshade panel and click **Apply**.

Then select the imagery layer and choose **blend hillshade** from its menu. (The item appears when a hillshade is in the same frame as the imagery.) The **Hillshade** menu at the top of the panel picks which hillshade to use; the map shows a live preview.

> **[IMAGE: shaded-relief-blend-panel.png]** The blend hillshade panel beside a preview.

The panel has a **Shadows** section and a **Highlights** section, each with **Strength**, **Chroma** and **Color** settings, so you can control the way light and dark areas are treated separately.

#### Shadow and highlight strength

**Strength** multiplies the opacity of the shading. At 1 (the default), the shading has the same lightness as the hillshade drawn over the image. At 0, the shading is turned off. Values above 1 make it stronger (up to 2).

- If the shadows look weak, particularly on dark imagery such as forest, raise the shadow strength.
- If the highlights look blown-out on light ground, lower the highlight strength.

#### Chroma

**Chroma** controls how much of the image's own color is kept under the shading.

- At **0**, shading works like an ordinary overlay: it blends with the image as semi-transparent black or white. Shadows make the colors darker and duller, and highlights make them paler and hazy.
- At **1**, the image keeps its original hue and saturation, and the shading only changes lightness (similar to the *luminosity* blend mode in graphics programs). Shadowed forest stays green, and sunlit slopes are brighter without turning milky.
- Between 0 and 1 gives a proportional mix.
- Values above 1 boost saturation beyond the image's original colors, up to 2.

The defaults are 0 for shadows (shadows look like shadows) and 1 for highlights (no haze). Try raising the shadow chroma to 0.5 or higher if shadows make the map look dull.

> **[IMAGE: shaded-relief-chroma-compare.jpg]** Shadow chroma at 0, 0.5 and 1.

#### Tinting the shading

Each section's **Color** field sets the color of the shading. It starts out as the hillshade's own color (black shadows and white highlights, or the colors of the opaque ramp). Choose a different color to tint it.

A color's *hue* appears wherever chroma is below 1 (at chroma 1, the image's own color takes over), so lower the chroma at the same time. Its *lightness* matters at every setting. A lighter shadow color makes shadows fainter.

For example, to give the shadows a cool blue-violet tint and the highlights a warm glow, choose `#2a2550` for the shadows and `#fff3d6` for the highlights, and set both chroma values to about 0.5. This is the classic cartographic combination of warm light and cool shadow.

> **[IMAGE: shaded-relief-tinted-shadows.jpg]** Neutral shading compared with cool, blue-green and purple shadow tints.

> **[TODO]** Try a few good-looking tint colors (a cool green, a blue and a purple) and list their hex values here.

#### Finishing

Click **Apply** to run [`-blend`](/docs/reference.html#-blend). The imagery layer is replaced by the blended image, and the hillshade layer is removed unless you check **Keep hillshade**.

Blending happens in place, so adjusting a blend means undoing it (**⌘Z** / **Ctrl+Z**) and blending again with new settings. Blending its own output a second time would double the shading.

> **[IMAGE: shaded-relief-blend-result.jpg]** The finished image, compared with the unblended imagery and the hillshade.

## Part three: blend a hillshade with hypsometric tints

A **hypsometric tint** colors the land by elevation: lowlands green, highlands tan and brown, and the highest peaks white, for example. Combined with a hillshade, tints give the classic look of an atlas relief map.

> **[IMAGE: shaded-relief-tint-intro.jpg]** An atlas-style map: hypsometric tints blended with a hillshade.

### Coloring an elevation layer

1. Select the DEM layer and choose **color palette** from its menu to open the color palette panel. Click the **Elevation** tab.
2. Choose a palette from the palette menu:

   - **Transparent** leaves the land uncolored.
   - **Climate zones** are tints for different kinds of climate: *desert*, *steppe*, *tropical*, *temperate*, *boreal* and *polar*. Natural landscapes look different in different climates, so a single set of colors doesn't work everywhere. A temperate palette passes from green lowlands to brown highlands, while a desert one uses tans and ochers.
   - **Blended** (offered when the raster's location is known) mixes the climate palettes according to the climate at each location. It's designed for maps of the world and of large regions.
   - **Other** has the general-purpose *atlas*, *lowland* and *highland* palettes.

3. The **Sea** menu colors the ocean: **Transparent** leaves it uncolored; the **Bathymetry** palettes tint it by depth in blue, pale or gray shades. (The sea is the area at or below sea level that connects to the edge of the map; lakes and basins below sea level, such as the Dead Sea, are not tinted as sea.)

The palette doesn't change the elevation values. It's a display setting, and the DEM can still be used to make hillshades and contours.

The panel creates a [`-classify`](/docs/reference.html#-classify) command, e.g. `-classify land-colors=temperate sea-colors=blue`.

> **[IMAGE: shaded-relief-palette-panel.png]** The color palette panel with the Elevation tab showing.

### Example: a world map

World maps are the easiest place to start, because the **Blended** palette is designed for them.

1. Set up a frame in a world projection (for example `proj eqearth`) with a width of about 1200px. See [part one](#option-one-draw-a-frame-and-download-a-dem-to-fit-it).
2. `-fetch tilezen` (or `mapterhorn`) to download a DEM at a resolution suited to the frame.
3. Make a hillshade with **Keep elevation** checked. At small scales the automatic exaggeration is high, which is what makes continents look three-dimensional. Increase **Smoothing** to remove fine detail that doesn't belong at this scale.
4. On the DEM, open **color palette**, and choose **Blended** for land and a **Bathymetry** palette for the sea.
5. Blend the hillshade with the tinted DEM (see below).

> **[IMAGE: shaded-relief-tint-world.jpg]** World map with blended climate-zone tints.

> **[TODO]** Confirm the cleanest way to start a world map session in the web app (what to import so there is a layer to project and fit a frame to). Could use the `-rectangle` command with `bbox=-180,-85,180,85`.

### Example: a regional map with custom elevation breaks

Preset tints have fixed elevations, and a particular area might suit different ones. On a map of the Colorado Plateau, the useful color changes fall between 1500 and 2500 meters, while on a map of the Netherlands they fall between 0 and 50.

Click **Customize** next to the palette to open the **Elevations and colors** dialog. It shows a histogram of the DEM's elevations, with a handle for each color stop, and a table of the stops. You can:

- move a stop to a different elevation
- click a color to change it
- add or delete stops
- click **Fit to data** to stretch the stops across the DEM's elevation range
- adjust the **Lightness** of the whole palette
- switch between continuous colors and classes (the toggle button), where each class runs from one elevation up to the next

> **[TODO]** Check this list against the dialog's current behavior (how stops are moved and added) and add a screenshot callout for each control.

The command-line equivalent is `land-colors=` with `land-breaks=`, which lists the elevation of each color, lowest first:

```bash
-classify land-colors=#b2c9ba,#e8dcb5,#c8a47e,#8a6b4f,#f4efe6 land-breaks=0,300,900,1800,3000
```

> **[IMAGE: shaded-relief-tint-regional.jpg]** A regional map, with the Elevations and colors dialog open.

> **[TODO]** Choose a real region for this example, and record its break values.

### Blending a hillshade with the tints

The blend hillshade panel works on a raster that is displayed in color, which includes an elevation raster with a palette. Before you blend, **duplicate the DEM** (**duplicate layer** in its menu) and apply the palette to the copy. Blending replaces its target with a new image, so the copy keeps your original elevations (you need them for other hillshades, contours and tints).

Then select the tinted layer, open **blend hillshade**, choose the hillshade, and adjust the settings as in [part two](#step-two-blend-the-hillshade-with-the-image). A few tips for tints:

- Tinted terrain is usually lighter than imagery, so shadows show up clearly with the default strength of 1. A chroma of 0.5 to 1 for shadows helps keep the tint colors from dulling in the dark areas.
- A lightly warm highlight color and a cool shadow color work especially well on tints.

> **[IMAGE: shaded-relief-tint-blend-compare.jpg]** A tint alone, a hillshade alone, and the blend.

### Overlaying tinted water and transparent land

To color the sea without coloring the land, choose **Transparent** for the land palette and a **Bathymetry** palette for the sea (`-classify sea-colors=blue`). The result is a layer in which only the water is colored. The land is transparent.

This is useful when the land is drawn some other way, for example with blended imagery, or with a transparent hillshade, and you want only the ocean tinted by depth.

1. Make a hillshade and a land layer (imagery or a tint) and blend them.
2. Duplicate the DEM and give the copy a sea-only palette.
3. Stack the sea layer above the land. To let the shading and land color show through the water, lower the sea layer's opacity in the console, e.g. `-style opacity=0.6`.

> **[IMAGE: shaded-relief-water-overlay.jpg]** Blended land with a depth-tinted sea overlaid.

> **[TODO]** This section is the least developed part of the outline. Decide the intended workflow: (a) a sea-only palette on top of blended land, (b) a land palette with transparent sea on top of a bathymetry layer, or (c) a transparent hillshade over a basemap. Update the steps and image accordingly.

## Part four: blend a hillshade with a choropleth map

A choropleth map colors areas, like counties or countries, by a data value. Shaded relief can show the landscape under the data. If you place a plain transparent hillshade over the colors, it tends to wash out the classes, so blend the hillshade with the colors instead.

The blend hillshade *panel* works on rasters, so for polygon layers you use the [`-blend`](/docs/reference.html#-blend) command in the console. It draws the layers you name, at the hillshade's resolution, and blends them in the same way as an image.

1. Import your polygons, project them, and create a frame (see [part one](#step-one-get-elevation-data-in-a-map-frame)). The polygons must be in the same projection as the hillshade.
2. `-fetch` a DEM and make an opaque hillshade of it in the **hillshade** panel. Choose gentle settings: lower **Shadows** and **Highlights**, and a bit of **Smoothing**. Strong shading in a choropleth competes with the data colors.
3. Color the polygons with the **color palette** panel or with [`-classify`](/docs/reference.html#-classify).
4. Select the polygon layer, and run:

   ```bash
   -blend hillshade target=counties
   ```

   `hillshade` is the name of the hillshade layer. The polygon layer is replaced by a raster image, and the hillshade layer is removed.

> **[IMAGE: shaded-relief-choropleth.jpg]** A choropleth map of counties blended with shaded relief.

**Keeping the vector layers.** The blended result is a raster, so the polygons are no longer editable vector shapes. If you want to keep the original layers, add `overlay`:

```bash
-blend hillshade target=counties overlay
```

An overlay is a layer that, drawn above the polygons, produces the blended look. The polygons remain vector layers: crisp at any zoom, editable and exported as paths. The overlay has to stay directly above them, and if you restyle the polygons you have to run `-blend` again.

**Tips for choropleths**

- Chroma 1 keeps the exact hues of the color scheme, so readers can match map colors to the legend, but light and dark colors still change. Lower **strength** (try 0.5 to 0.7) so that shading doesn't make a light class look like a dark one.
- List several layers in `target=` to draw them together, e.g. `target=counties,lakes`. Labels and fine lines drawn into the blend are shaded as well, so leave layers that should stay crisp out of the list and put them above the result.

> **[TODO]** Pick the example map (e.g. a state or county map by a data value). Verify that the `-blend ... target=` examples work in the web console with a framed layer, and decide whether to mention the `-style` and `-classify` steps in more detail.

## Putting it together

Every step above is a command, so a complete map can be written as a script. This one reproduces the workflow from the Canyon example, from the frame to a finished PNG. Run `history` in the console to get the commands for your own map.

```bash
# Frame, DEM, imagery
-rectangle bbox=-111.9,36.0,-111.7,36.1 name=area
-proj merc
-frame width=1200
-fetch 3dep-1m name=dem
-fetch naip name=imagery

# Prepare the imagery
-deshadow dem=dem target=imagery
-tone target=imagery lightness=1.49 saturation=1.18 contrast=1.23 hue-shift=0.25

# Make the hillshade and blend it with the imagery
-hillshade target=dem opaque ambient=0.7 texture=0.1 name=hillshade
-blend hillshade target=imagery strength=1.15,1 chroma=0.9,1
-sharpen target=imagery 0.25

-o target=imagery map.png
```

> **[TODO]** The `-rectangle bbox=` is a placeholder area (the frame commands up to `-frame` were tested, but `-fetch` and everything after it were not). Replace the bbox with the canyon example's real extent, and test the script from start to finish: the layer names (`dem`, `imagery`), the `target=` options, and the export of a framed raster to PNG.

Run the same script on a different area by changing the frame and the source names. For a map that mixes tints, imagery and polygons, repeat the blending steps for each layer.

## Tips and troubleshooting

- **The hillshade or blend menu item is missing.** The **hillshade** panel is offered on elevation rasters. **blend hillshade** requires a hillshade in the same frame as the target, in the same projection, and a target that is displayed in color (an image, or an elevation raster with a palette). Select the layer you want to change first.
- **The fetch took a long time or stopped.** Large areas at high resolution need a lot of tiles. `-fetch` stops at `max-tiles=` (500 by default). Use a lower-resolution source, a smaller frame, or a smaller `raster-res=` before raising the limit.
- **The image has soft or blocky edges.** The raster's resolution was set when you fetched it. If you made the frame larger or changed the projection after fetching, fetch again.
- **The map looks flat.** Raise **Exaggeration**, lower **Altitude**, or try **Hard** lighting. Check that **Smoothing** isn't set too high for the scale of the map.
- **The map looks too busy.** Raise **Smoothing**, lower **Texture** and **Ambient**, or try **Soft** lighting.
- **Valleys look like ridges.** The light is coming from the south or from below the horizon. Set **Azimuth** back to 315° (northwest).
- **Credit your sources.** Many elevation and imagery sources require attribution, and `-fetch` prints the credit to use. A few (for example, `eox` imagery from 2018 on) restrict commercial use.

## See also

- [`-fetch`](/docs/reference.html#-fetch), [`-hillshade`](/docs/reference.html#-hillshade), [`-blend`](/docs/reference.html#-blend), [`-tone`](/docs/reference.html#-tone), [`-deshadow`](/docs/reference.html#-deshadow), [`-sharpen`](/docs/reference.html#-sharpen), [`-smooth-terrain`](/docs/reference.html#-smooth-terrain) and [`-classify`](/docs/reference.html#-classify) in the command reference
- [Canyon relief](/docs/examples/canyon.html), a shorter worked example
- [Map projections](/docs/guides/projections.html)
