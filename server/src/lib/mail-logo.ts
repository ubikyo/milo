// Milo's logo for e-mails.
//
// A raster image, not the app's SVG: half of the mail clients do not render
// SVG. It is written here in base64 rather than placed in a file, for two
// reasons — the server is bundled into a single file at deployment (esbuild
// does not carry resources along), and a remote image would be blocked by
// default for most recipients. Attached to the message and cited by its
// identifier ("cid:"), it displays without asking anything of anyone.
//
// This is the dark variant of the logo: it sits at the foot of the message,
// on a white background, where the light variant would be invisible. 74 × 56,
// double its display size, for high-density screens.
//
// To redo it from the source:
//   convert -background none -density 600 \
//     client/src/assets/media/Milo-2.svg -resize x56 -strip PNG8:milo.png

/** The identifier under which the HTML cites the attached image. */
export const LOGO_CID = "milo-logo";

/** What the image measures on screen, in pixels. */
export const LOGO_WIDTH_PX = 37;
export const LOGO_HEIGHT_PX = 28;

const BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEoAAAA4CAMAAABt5J6JAAABOFBMVEUAAAAdmX8gqYwgqIsfo4cenIIclXwbkHcbjHQainIZ" +
  "hm8Zg20YgGoXfGcXeGQWdWEVcV0UbFojtpcjt5gjt5citZYitJUis5UfoYYbjXUhrpAXemUdl30ZhW4fpoodm4EbjnYjtZYi" +
  "sZIYgWshsJIgq44hrI4enoMai3MaiHEaiXIXe2YenYMWd2IVHSUbJS8bJC4UGyMYISoiLjskMT4hLjoWHycWHiYjMD0hLDgg" +
  "LDgeKTQfKjUcJzEjLzwYISkaJC0hLToUHCMXICkiLzwkMD0fKjYdKDIiLjodKDMVHCQeKDMgKzcZIiwdJzIcJjEdJzEcJjAg" +
  "LDcbJTAkMT0jMDwiLzsaJC4aIy0UGyIhLTkXHygZIisfKzYeKjUXICgbJS4bJjAeKTUZIywWHicPFRoQFhwTGiH+PiJiAAAA" +
  "AXRSTlMAQObYZgAAAitJREFUWMPt1llbGjEUBuC02oVu1pGR7tW2VrsoCAc5ZZm6gBVQFCsUEVy6/v9/0ARmZDJJBiS59Hu4" +
  "SjJvQnImQMjVcuPmxOSt23fuRu7df/Dw0dTj6Ss+P0jEopmhiVqWbc/GYk/Gpp7aFpdnz01RscjYUpB6Mb4UoCY1JJ6yXxqj" +
  "rFfmKOu1OWp2Toea91PRN291VvVuwZf3ixqUvaSxPwHqwzV1TfUyF7U+GqI+LX5eNkQZzEo8sWpGSqYA0msmpEwKEOGLCSoL" +
  "CPST05fyTKLBuK5UAC/OVz1pHT0JYWNTR9oqQmlgbY/83LedVJlvqWzA5apYCiNKVTaYP6ddXgLcG0mq9Z5C/7pywAchlRlB" +
  "2nfnx4PLpjqCYB0Ol75jf3+PAOtu054gsZSHSYmGtyslaPRrca0JMgt/hEstB3z147Ro03FbKh1B8SRM6nALQGh2CNmWSqy3" +
  "HSLRSwT50V2y2aQLUFinSukszUt0588JuZAvqpe6ihI2BQv+6pCkkZRLWUFyz7umkhDSFZl0KIz86XWV1VZXInWFcb5ROVCm" +
  "Jkh5Yb6sv1tt4a+AJL6v7fCpvJSCL3Y1uOGwszV0A6TLrwkSK/NAdpVV77va9gXJWZcesaLAWCH3E8fBte32SX+eVrMqy3F3" +
  "I+HIi1xMRX5HsDM6Zv2totBfJYqsKK087f0t3mt5okwmrfqO9MVOCDN0SUhO2oqaoBXxJ9nhM+Q/z9/MmTT/yH/dJA/SQxnn" +
  "KQAAAABJRU5ErkJggg==";

/** The image, ready to be attached to the message. */
export const attachedLogo = (): Buffer => Buffer.from(BASE64, "base64");
