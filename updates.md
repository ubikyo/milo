# 15 octobre 2026

## Les dernières évolutions de Milo

### Implémentations

- Widget Taxes dans Logistique
- Widget Contact dans Logistique
- Widget Liste dans Objets

### Evolutions

- Faire un CMD+V / CTRL+V télécharge le ou les fichiers dans l'encart "pièces jointes" des widgets compatibles.
- Dans Équipements déclarés et Applications, le fournisseur est désormais une société d'un widget Contact.
- Dans Produits, Équipements déclarés et Applications ajout du widget Taxes.
- Dans Équipements déclarés, Applications ajout d'une entrée Liste pour certains attributs.
- Possibilité de réinitialiser les colonnes et types par défaut.
- Liste filtre et tri sont persistants pour l'utilisateur.
- Ajout du délai d'actualisation des messages dans Tickets.
- Ajout d'une variable {{ticket.original}} avec le message d'origine.

### Corrections

- Les "Widgets associés" passent en rouge quand un widget associé n'existe plus : sa configuration est conservée mais grisée. En associer un du même type la réactive, d'un autre type la remplace par ses propres paramètres.
- Ajout d'une modale de confirmation dans Tickets pour valider l'option "Supprimer les e-mails relevés de la boîte".
- Dans Tickets, sauf en cas d'échec de l'envoi, "envoyer un e-mail + changer l'état" ferme le panneau de détail du ticket
- Les réponses pré-définies, sont propres à chaque widget Tickets.
- Modification des valeurs par défaut de Tickets.
- Modification des valeurs par défaut de Projets.
- Modification des valeurs par défaut des Équipements déclarés.
- Modification des valeurs par défaut de Applications
- Si au moins une adresse e-mail est validée dans le 
Widget support, on n'affiche plus de message d'erreur de configuration.
- Les emptystate de Tickets et Tâches sont désormais centrés verticalement.
- Les indicateurs et graphiques Tickets ne comptent plus que les tickets des adresses e-mail présentes et confirmées dans le widget.
- Dans Produits, la liste des fournisseurs a un entête de colonnes ; le prix devient « Prix HT », comme dans Équipements déclarés et Applications.
- Alignement à droite de la quantité et du prix dans Équipements déclarés et Applications.
- Correction largeur dropdown nouvelle application et type d'application.
- Modification du logo dans les e-mail.
- Cliquer sur "En attente" permet de valider le code de confirmation de l'e-mail.
- Correction affichage aperçu avec la variable {{cursor}}.
- Les retours chariots des réponses pré-définies sont pris en compte dans les réponses.
- Modification du template de réponse automatique pour ne pas intégrer le message d'origine.
- Modification du template "Réponse à un ticket" pour le positionner à gauche.
- Ajouter d'entête sur les réponses pré-définies et automatiques.
- Passage à 100% sur les widgets de contenus.

# 14 octobre 2026 #2

## Corrections de dernières minutes

### Evolutions

- Ajout colonne Demandeur et Agents dans support.
- Dans le menu de Milo en bas à droite, ajout d'un lien vers les versions
- Dans la configuration des widgets, la liste des colonnes a un entête (Colonne, Largeur)
- Ajout de l'entête sur les colonnes

### Corrections

- Le bouton enregistrer ferme le détail dans support
- Dans l'éditeur des connexions de widgets, les widgets incompatibles avec ceux déjà placés sont grisés et ne peuvent plus être glissés
- Dans support, la ligne du `{{cursor}}` d'une réponse pré-définie remplace les lignes vides qui l'entourent
- Suppression d'un texte inutile dans catégorie.

# 14 octobre 2026

## Les dernières évolutions de Milo

### Implémentations

- Fenêtre nouveautés (cette fenêtre).
- Editeur des connections de widgets.

### Evolutions

- Ajout détection nouvelle version avec affichage d'un bouton pour actualiser la fenêtre.
- Dans les colonnes acteurs ajout choix de l'affichage.
- Dans support, ajout des options Fermer le ticket et Marquer comme résolu.
- Dans paramétrage, activation des fonctions Labo.
- Ajout d'une ligne d'entête dans certaines listes.
- Dans les widgets répartition, ajout du choix de l'ordre d'affichage.
- Dans les widgets répartition, ajout d'une option Ordre d'affichage.
- Dans support ajout de deux nouveaux modèles d'e-mail (Réception d'un nouveau ticket, Mise à jour d'un ticket). Le message "Nouveau ticket" est envoyé aux acteurs configurés le widget du support. Le message "Mise à jour" est envoyé aux acteurs associés au ticket sauf à celui qui l'a émis.
- Dans support la colonne Statut permet de filtrer les non résolu (non fermé, non résolu).
- Dans support dans le widget, Nombre, ajout de Tickets non résolus.
- Dans Nombre possibilité de modifier l'alignement du nom et de la valeur.
- Dans tâches, ajouter de "Supprimer les cartes" sur une liste.
- Les widgets Projets, Tâches, Tickets prennent 100% de la hauteur de la section par défaut.
- Ajout d'un champ de recherche pour les colonnes de type texte.
- Ajout d'une variable {{curseur}} pour le placement du curseur lors d'une réponse à un message.

### Corrections

- Redimensionnement des colonnes du widget support fonctionnel.
- Avec une hauteur de 100%, les actions sont situées en bas.
- En mode édition, les actions n'étaient pas affichées.
- Simplification de l'affichage des proxies.
- Proxys a été renommé en proxies.
- Réalignemnent des colonnes du paramétrage de l'impression.
- Opimisation de l'affichage des paramétrages.
- Modification des modèles d'e-mail pour les supports avec les bonnes variables.
- Ajout des boutons agrandir et rétrécir sur les réponses automatiques et pré-définies.
- La hauteur des graphiques suit la hauteur des widgets
- Correction des URL d'accès aux différents éléments.

# 13 octobre 2026

### Nouveautés

- Les options de recherche approximative sont désormais liées à l'utilisateur.

### Corrections

- Les raccourcis TAB et option-TAB ne fonctionnaient plus.
- Les couleurs des swatches étaient trop proches.