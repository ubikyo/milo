// Le cadre d'un message posé dans une fenêtre : ce qui a échoué, ce qui a
// réussi. Une seule mise en forme, déclinée par la couleur.
//
// Un aplat plein criait plus fort que ce qu'il annonçait. Un filet d'un pixel
// sur un fond à peine teinté se remarque sans occuper tout l'écran, et laisse
// le message lisible dans les deux thèmes.
//
// Le fond passe par « color-mix » et non par la fonction `alpha` de Mantine :
// celle-ci ne sait teinter qu'une couleur qu'elle peut lire — un hexadécimal
// ou une variable CSS — et rendrait du noir sur une couleur écrite en
// « light-dark(…) », ce qu'est justement le vert (themes/colors.ts).
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
