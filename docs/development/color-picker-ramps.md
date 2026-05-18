# Color Picker Ramp Generation

The layer color picker uses static hex values for its preset color ramps. These
ramps are generated outside the application code and pasted into
`src/gui/gui-color-picker.mjs`; no runtime color conversion dependency is used.

## Goals

- Keep each ramp at a stable displayed hue in the color picker.
- Preserve the smoother lightness/chroma progression of a perceptual color
  space as much as possible.
- Store final values as ordinary sRGB hex colors.

## Method

1. Choose a target hue for the ramp as it should appear in the picker HSB fields.
2. Generate an initial ramp in OKLCH:
   - Hold OKLCH hue constant.
   - Increase lightness from dark to light.
   - Reduce chroma toward the light end so colors stay in the sRGB gamut.
3. Convert each OKLCH color to sRGB.
4. Convert the sRGB color to the same HSB model used by `ColorPicker`.
5. Replace the HSB hue with the target picker hue.
6. Convert the adjusted HSB color back to sRGB.
7. Because final hex values are quantized to 8-bit RGB, verify each color by
   converting the hex value back through the picker HSB conversion. If a chip
   rounds to a neighboring displayed hue, search nearby saturation/brightness
   values until it displays the target hue.
8. Paste the resulting static hex ramp into `gui-color-picker.mjs`.

## Current Target Hues

- Reds: `0`
- Oranges: `28`
- Browns: `37`
- Greens: `126`
- Teals: `178`
- Blues: `200`
- Indigos: `230`
- Purples: `282`

## Verification

After updating a ramp, open the color picker and click each chip in the ramp.
The `H` field should display the same value for every chip in that ramp.

Also run:

```sh
npx eslint "src/gui/gui-color-picker.mjs"
npm run build
```
