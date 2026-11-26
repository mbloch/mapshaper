---
title: Shaded relief
description: A step-by-step guide to making shaded relief maps in Mapshaper's web app.
---

# Shaded relief

![Aerial imagery of a river canyon in Canyonlands, Utah, blended with a hillshade](/docs/images/shaded-relief-intro.jpg)

Mapshaper now has a set of tools for making shaded relief maps:

- the `-fetch` command downloads elevation data and imagery
- the `-resample`, `-blur` and `-smooth-terrain` commands change the resolution and level of detail of elevation data
- the **hillshade** panel turns an elevation raster into a hillshade
- the `-deshadow` command removes shadows from aerial imagery
- the **adjust colors** panel modifies the colors and contrast of image layers
- the **blend hillshade** panel combines a hillshade with imagery or a tinted raster
- the **color palette** panel colors an elevation raster with hypsometric tints
- the `-sharpen` command applies an unsharp mask to a hillshade or blended image.

Panels are opened from a layer's options menu in the layers panel, and commands are typed in the console.

## Part one: create a hillshade

A hillshade is a raster layer that models the landscape with light and shadow, on its own or blended with aerial imagery or other layers. Cartographic hillshades aren't meant to be realistic renderings of sunlight on the land. They adjust the strength of relief to suit the map, sometimes exaggerating it, sometimes keeping it subtle, and they generalize detail so that terrain is legible and works as a base layer.

### Step one: get elevation data in a map frame

A **map frame** is a rectangle that defines the geographical extent of a map, its projection and its output size. When `-fetch` is run, the area to download, the coordinate system and the resolution are all taken from the frame.

There are two ways to get started.

#### Option one: draw a frame and download a DEM to fit it

1. Turn on a basemap (**Display &rarr; Basemaps**) to draw over, and zoom to your area of interest.

2. Choose **rectangles** from the **Draw** menu in the layers panel. Click one corner of the area you want to map, then click the opposite corner. Drag the handles to adjust the rectangle.

   ![A rectangle with drag handles drawn over a basemap of the Island in the Sky district of Canyonlands, Utah](/docs/images/shaded-relief-draw-frame.jpg)

3. Reproject the rectangle to the projection you want for the finished map by typing a `proj` command in the console; for example, `proj merc` (Mercator, generally appropriate for small areas) or `proj lcc` (Lambert Conformal Conic, with parameters chosen to suit the extent of the rectangle). See [Map projections](/docs/guides/projections.html).

4. Click **+ New frame** in the layers panel, enter an output width and click **Fit visible layers**.

   ![The New map frame dialog, with fields for the frame name, output width, aspect ratio and margin, and buttons for fitting the frame to the visible layers or drawing it on the map](/docs/images/shaded-relief-frame-dialog.jpg)

5. Download elevation data for the frame:

   ```bash
   -fetch mapterhorn
   ```

   The result should look something like this:

   ![A fetched elevation raster of a river canyon, drawn in grayscale inside a map frame](/docs/images/shaded-relief-fetch-dem.png)

**Choosing an elevation source.** Run `-fetch sources` to see the full list. Many sources require attribution, and `-fetch` prints the credit to use.

| Source | Coverage | Resolution | Notes |
| --- | --- | --- | --- |
| `mapterhorn` | World | 30 m, finer where national lidar is available | Requires attribution. |
| `tilezen` | World | about 10 m in the U.S., 30-90 m elsewhere | Mostly public domain. |
| `copernicus` | World | 30 m | Requires attribution. |
| `3dep` | United States | 10 m | Public domain. |
| `3dep-1m` | United States | 1 m where there is lidar, 10 m or coarser elsewhere | Public domain. |

#### Option two: import your own DEM

1. Import a GeoTIFF containing elevation data.

2. If the DEM isn't in the projection you want for the map (for example, it uses lat-long coordinates or a different projected coordinate system), reproject it in one of two ways:

   - If you already have a frame in the projection you want (made as in [option one](#option-one-draw-a-frame-and-download-a-dem-to-fit-it)), drag the DEM into the frame in the layers panel. Mapshaper offers to reproject the DEM to match the frame; click **Yes**, then skip to step 4.
   - Otherwise, type a `proj` command in the console, for example `proj merc` or `proj lcc`.

3. Click **+ New frame** and choose **Fit visible layers** to create a frame around the DEM.

4. Match the DEM's resolution to the frame's output size. With the DEM layer selected, run [`-resample`](/docs/reference.html#-resample) in the console:

   ```bash
   -resample 2x crop
   ```

   `2x` sets two raster pixels per pixel of the frame, the resolution that `-fetch` uses by default. `1x` matches the frame's pixels, and a value like `300dpi` sets a resolution for print. `crop` discards the part of the DEM outside the frame, apart from a small margin (10 pixels by default, settable with `bleed=`).

### Step two: create a hillshade from the elevation layer

Select the elevation layer and choose **hillshade** from its options menu. The hillshade panel opens, and the map shows a live preview of the shading. Use the panel's controls to customize your hillshade and finalize it by clicking **Apply**.

![The hillshade panel, with Shading, Light, Terrain and Effects controls, beside a grayscale preview of a hillshade of a river canyon](/docs/images/shaded-relief-hillshade-panel.jpg)

#### Shading: opaque or transparent

The panel's **Style** setting controls how the hillshade is drawn.

- **Opaque** colors every pixel, running from a *shadow* color through a *base* color, which is the color of flat ground, to a *highlight* color.
- **Transparent** uses translucent black shadows and white highlights, so the layers below the hillshade show through. Flat ground is fully transparent.

For the most control over how a hillshade is combined with another layer, make it opaque and use the **blend hillshade** panel (see [part two](#step-two-blend-the-hillshade-with-the-image)).

**Making a colored hillshade.** You can use an opaque hillshade with custom shadow, base and highlight colors as a simple background layer for a map. Picking a cool shadow color and a warm highlight color gives the shading a hand-painted look, especially when smoothing is added.

![The same terrain in the Dolomites in three diagonal bands: a hillshade with blue shadows and pale yellow highlights in the upper left, a pale warm-gray hillshade in the middle, and a hillshade with violet shadows and peach highlights in the lower right](/docs/images/shaded-relief-colored-hillshade.jpg)

#### Light

- **Azimuth** is the direction of the main light source, in degrees clockwise from north. The default of 315° (northwest) lights the map from the upper left, which is the usual convention.
- **Altitude** is the angle of the light above the horizon (default 45°, a common convention). Mapshaper's hillshade function doesn't cast shadows. Altitude changes the tones of slopes rather than the length of shadows.
- **Lighting** sets the fill light. **Hard** uses the main light alone, **Balanced** (the default) adds fainter fill lights around it, and **Soft** adds still more.

#### Terrain

- **Exaggeration** adjusts the vertical scale of the terrain. The slider is centered on an automatic value based on the scale of the map (small-scale maps get more exaggeration).
- **Smoothing** (Off, 1-4) removes noisy detail while keeping major landforms sharp. Mapshaper's smoothing function adapts to the terrain, smoothing more or less according to the average slope in the immediate area. Smoothing changes only the hillshade; to smooth elevations for other uses, like contours or tints, use the [`-smooth-terrain`](/docs/reference.html#-smooth-terrain) or [`-blur`](/docs/reference.html#-blur) console command. The figure below shows the difference between no smoothing and maximum smoothing.

![Glaciated mountains in the Chugach range of Alaska, with no smoothing in the upper left and smoothing 4 in the lower right, divided by a diagonal line; the smoothed side has less fine detail, while the main ridges and valleys stay sharp](/docs/images/shaded-relief-smoothing-compare.jpg)

#### Effects

- **Ambient** darkens valleys, canyons and other places with a restricted view of the sky, adding depth to the image.
- **Texture** adds [*texture shading*](https://www.textureshading.com/Home.html), which emphasizes the pattern of ridges and valleys in uneven terrain.
- **Aerial** reduces contrast at low elevations, so that lowlands fade and high mountains stand out.
- **Gamma** controls the prominence of subtle terrain relative to major landforms. Values below 1 strengthen faint shading.

## Part two: blend a hillshade with imagery

### Step one: prepare the imagery

#### Fetch imagery

With the map frame in place (see [part one](#step-one-get-elevation-data-in-a-map-frame)), run `-fetch` with the name of an imagery source, or import your own imagery.

```bash
-fetch naip
```

Built-in imagery sources:

| Source | Coverage | Resolution | Notes |
| --- | --- | --- | --- |
| `naip` | Conterminous U.S. | 0.3-1 m | Aerial photos. Use `year=` to choose a year; the default is the newest for each state. Public domain. |
| `usgs` | U.S. (world at small scales) | about 1 m | Faster than `naip`, mostly NAIP from 2017-2021. Public domain. |
| `sentinel2` | World | 10 m | Satellite image made from the least cloudy scenes of the summer of `year=` (the whole year in the tropics). The default is last year. Requires attribution. |
| `landsat` | World | 30 m | Satellite image made from the least cloudy scenes of the summer of `year=` (the whole year in the tropics), 1982 and later. The default is last year. 2012 has no usable scenes. Public domain. |
| `eox` | World | 10 m | Cloudless mosaic of Sentinel-2 images. 2018 and later editions are non-commercial. |
| `bluemarble` | World | 500 m | A smooth, cloud-free image for world and continental maps. |

#### Remove shadows from aerial imagery

Aerial photos often include shadows cast by the terrain. These tend to clash with the hillshade, which is almost always lit from a different direction. The experimental [`-deshadow`](/docs/reference.html#-deshadow) command uses a DEM to find shadowed areas and dark slopes, and relights them to a consistent brightness. With the imagery layer selected, run it with the name of a DEM layer.

```bash
-deshadow dem=mapterhorn
```

Add `despeckle` to also brighten small dark spots that are too fine for the DEM to account for. It works best on bare rock and areas without visible tree shadows.

![Aerial imagery of a river canyon, with the original image in the upper left and the image after -deshadow in the lower right, divided by a diagonal line](/docs/images/shaded-relief-deshadow-compare.jpg)

Composites of images taken at different times of day (like the built-in `naip` and `usgs` sources) combine regions with different sun angles. Mapshaper tries to detect these regions and correct each for its own sun angle, but detection isn't fully reliable. Results are also less reliable on images without distinct shadows.

#### Adjust the colors of the imagery

Most imagery benefits from color adjustment before blending. Select the imagery layer and choose **adjust colors** from its options menu to open the **Color & tone** panel.

### Step two: blend the hillshade with the image

Select the imagery layer and choose **blend hillshade** from its options menu. The item appears when there's a hillshade in the same map frame. The panel controls how the hillshade's shadows and highlights are combined with the image.

![The Blend hillshade panel, with Strength, Chroma and Color settings for shadows and highlights, beside a preview of aerial imagery of a glaciated volcano blended with a hillshade](/docs/images/shaded-relief-blend-panel.jpg)

The **Shadows** and **Highlights** sections of the panel each have three settings. **Strength** sets the intensity of the shading. **Chroma** controls how the shading affects the image's colors. At 0, it works like an overlay of translucent black shadows and white highlights, which dulls shadowed areas and makes highlights look hazy; at 1, it works like a luminosity blend mode, changing lightness but keeping the image's color saturation. **Color** tints the shading wherever chroma is below 1.

![A river canyon in three diagonal bands: a hillshade in the upper left, the blend of the hillshade with aerial imagery in the middle, and the aerial imagery alone in the lower right](/docs/images/shaded-relief-blend-result.jpg)

## Part three: blend a hillshade with hypsometric tints

A **hypsometric tint** uses a color ramp to vary color by elevation. The example below colors lowlands green, highlands tan and the highest peaks white, like a relief map in an atlas.

![A map of northern Scotland, with hypsometric tints blended with a hillshade](/docs/images/shaded-relief-tint-scotland.jpg)

First, make a hillshade (see [part one](#step-two-create-a-hillshade-from-the-elevation-layer)), then choose **color palette** from the DEM's options menu and pick a hypsometric color ramp from the **Elevation** tab. To fit the colors to the terrain of your map, click **Customize** to open the **Elevations and colors** dialog, where you can move, add, remove and recolor the color stops.

![The Elevations and colors dialog, with a histogram of elevations, a column of color stops with editable break values and the share of land pixels in each band, beside a mountain range tinted from tan valleys to white peaks](/docs/images/shaded-relief-elevation-breaks.jpg)

Finish by blending the tinted elevation layer with a hillshade, as in [part two](#step-two-blend-the-hillshade-with-the-image).

## See also

- [`-fetch`](/docs/reference.html#-fetch), [`-hillshade`](/docs/reference.html#-hillshade), [`-blend`](/docs/reference.html#-blend), [`-tone`](/docs/reference.html#-tone), [`-deshadow`](/docs/reference.html#-deshadow), [`-resample`](/docs/reference.html#-resample), [`-blur`](/docs/reference.html#-blur), [`-sharpen`](/docs/reference.html#-sharpen), [`-smooth-terrain`](/docs/reference.html#-smooth-terrain) and [`-classify`](/docs/reference.html#-classify) in the command reference
- [Canyon relief](/docs/examples/canyon.html), a shorter worked example
- [Map projections](/docs/guides/projections.html)
