// Milo's logo for e-mails.
//
// A raster image, not the app's SVG: half of the mail clients do not render
// SVG. It is written here in base64 rather than placed in a file, for two
// reasons — the server is bundled into a single file at deployment (esbuild
// does not carry resources along), and a remote image would be blocked by
// default for most recipients. Attached to the message and cited by its
// identifier ("cid:"), it displays without asking anything of anyone.
//
// One variant only, legible on both backgrounds: light mountains outlined in
// dark (Milo-Mail.svg). Showing a second one to clients in dark mode
// does not hold — Outlook on the web applies the swap rule in light mode too.
// 400 px wide, ten times its display size: sharp on every screen.
//
// To redo it from the source, with sharp (server dependency):
//   sharp("client/public/Milo-Mail.svg", { density: 600 })
//     .resize({ width: 400 }).png({ palette: true, compressionLevel: 9 })

/** The identifier under which the HTML cites the attached image. */
export const LOGO_CID = "milo-logo";

/** What the image measures on screen, in pixels. */
export const LOGO_WIDTH_PX = 37;
export const LOGO_HEIGHT_PX = 28;

const LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAZAAAAEzCAMAAAAo6aW+AAADAFBMVEVMaXEmJiYoKCgnJycit5cpKSkoKCgoKCgjtZYjtpcAAAAp" +
  "KSkoKCgoKCgpKSkoKCglJSUjtZcpKSkAAAAoKCgoKCgoKCgoKCg0X1soKCgoKCgnJycoKCgdHR0zMzMpKSkpKSkoKCgoKCgnJyco" +
  "KCgoKCgpKSkrKysoKCgAAAAoKCgoKCgpKSkoKCgoKCgoKCgmJiYoKCgitpYoKCgpKSkpKSkoKCgitpYoKCgoKCgpKSkoKCgoKCgq" +
  "KiooKCgoKCgpKSkmJiYoKCgoKCgoKCgoKCgzMzMpKSkpKSkpKSkpKSkoKCgpKSkpKSkpKSkoKCgoKCgoKCgoKCgoKCgitZcnJyco" +
  "KCgnJycoKCgesZMjtZgltZcitpYhs5EitpYoKCgpKSkitpcoKCgpKSkitpYitpYitZYguJcqKiopKSkhtpYjtpcpKSkktpcpKSki" +
  "tZcoKCgjtpYitpYitZYoKCgitZcpKSkitpcqtZ8kuJYjtZcoKCgpKSkpKSkoKCgjtpYitpcitpYitZcitpcit5YhtZQitZcitZcj" +
  "tpYitZYjt5kjtpYjtpcmJiYjtZcpKSkgt5YitpcktJcftJQjtJYjtpYitpYitpb///8jtpcpKSmNjY0qKiosLCz8/Pz+/v4xMTH5" +
  "+fn39/dSUlKZmZk2NjYtLS3x8fHr6+uIiIipqanz8/N6enr7+/s+Pj6+vr7i4uLY2Ng6OjpAQEBZWVlGRkZHR0f19fX9/f1QUFDI" +
  "yMhvb29cXFwvLy/p6emEhITv7+9UVFTJycnk5OR2dnZsbGw4ODhgYGA1NTV5eXllZWUzMzPDw8Pd3d3T09NjY2Orq6tJSUlDQ0O0" +
  "tLRqamrLy8ukpKSUlJRLS0u9vb08PDzBwcGKioqenp7S0tLt7e1ycnK2trZtbW2Pj4/U1NTm5ubg4OC6urrc3NywsLDs7OxbW1vf" +
  "39/X19fa2tp/f39OTk64uLiGhobOzs58fHyhoaGtra2cnJyCgoKOjo6RkZGlpaWXl5dfX1/FxcVnZ2dXfP4rAAAAmHRSTlMABvwh" +
  "Wf76M8PMAxXJvSjuDbvYAfUQHH8DqJI58QgFbPjp80a35EgLagLiQsxeU4wUwf3VJV2ld1mxtKoZL94S7DuYhducCtmVTntQ8tLn" +
  "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";

/** The logo, as attached to the message. */
export const attachedLogo = (): Buffer => Buffer.from(LOGO_BASE64, "base64");
