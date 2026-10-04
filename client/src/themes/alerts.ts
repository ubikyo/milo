// The frame of a message placed in a window: what failed, what
// succeeded. A single layout, varied by color.
//
// A solid fill shouted louder than what it announced. A one-pixel rule
// on a barely tinted background is noticed without taking over the screen, and leaves
// the message readable in both themes.
//
// The background goes through "color-mix" and not through Mantine's `alpha` function:
// that one can only tint a color it can read — a hexadecimal
// or a CSS variable — and would render black on a color written as
// "light-dark(…)", which is precisely what green is (themes/colors.ts).
export const alertStyles = (color: string) => ({
  root: {
    backgroundColor: `color-mix(in srgb, ${color}, transparent 90%)`,
    border: `1px solid ${color}`,
  },
  message: { color: color },
  title: { color: color },
  label: { color: color },
  icon: { color: color },
  closeButton: { color: color },
});
