# Contrat back → front du compte rendu EEG officiel (CHUA)

Le PDF A4 du compte rendu est généré **côté front** (`eeg_front`,
`lib/compte-rendu.ts`) ; `eeg_back` ne produit aucun PDF. Ce document liste
les champs que le back expose pour le remplir, et **où** il les expose : le
mapper front lit certaines clés à la *racine* de l'objet, d'autres sous
`patient` / `rdv` / `resultat`. Toute valeur absente ou `null` est affichée
« Néant » par le front — aucun champ n'est donc obligatoire.

> Règle de compatibilité : les noms ci-dessous sont figés côté front.
> **Ne jamais renommer** un champ existant ; en cas de besoin, ajouter.

## `GET /eeg/demandes/:id`

| Clé | Emplacement | Source |
| --- | --- | --- |
| `numeroEEG`, `dateCreation`, `dateRealisation`, `dateValidation`, `motifPrescription` | racine | `EegDemande` |
| `aeActuel`, `agePremiereCrise`, `dpm`, `typeCrise`, `dateDerniereCrise` | racine | snapshot clinique de la prescription |
| `prescripteurExterneNom`, `prescripteurExternePrenom` | racine | `EegDemande` |
| `adresse`, `contact` | **racine** *et* `patient.*` | Accueil (`PatientLookupService`) |
| `renseignementClinique` | racine | `rdv.renseignementClinique` sinon `motifPrescription` |
| `dateExamen` | racine | `dateRealisation` sinon `dateRDV` |
| `heuresExamen` | racine | `rdv.heureDebut` |
| `patient.{nom, prenom, age, sexe, adresse, contact}` | `patient` | Accueil |
| `prescripteur.{nom, prenom, role, numeroOrdre, specialite, telephone}` | `prescripteur` | user-services |
| `rdv.{heureDebut, renseignementClinique}` | `rdv` | `EegRdv` |
| `resultat.{etatEveil, conditions, noteComplementaireConclusion, noteComplementaireConduite, …}` | `resultat` | `EegResultat` |

`renseignementClinique`, `dateExamen` et `heuresExamen` sont **calculés**, pas
stockés : ce sont des raccourcis vers des données déjà présentes, pour que le
front n'ait pas à réimplémenter les règles de repli.

## `GET /eeg/archives`

Chaque item est un `EegResultat` (donc tous ses champs cliniques à la racine)
enrichi de :

- `medecinValidateur.{nom, prenom, role, numeroOrdre, specialite, telephone}` — le
  signataire ; `role` et `numeroOrdre` alimentent la mention ONM du document ;
- `adresse`, `contact`, `renseignementClinique`, `dateRealisation`,
  `dateExamen`, `heuresExamen` à la **racine** ;
- `demande.{numeroEEG, dateRealisation, dateRDV, dateValidation,
  motifPrescription, snapshot clinique, prescripteur externe}` ;
- `demande.rdv.{heureDebut, heureFin, renseignementClinique, dateRdv}` ;
- `demande.patient.*` et `demande.{adresse, contact}`.

## `GET|PUT /eeg/config/personnel-service`

Réponse (exactement ces cinq clés, jamais de 404) :

```json
{
  "chefDeService": "",
  "medecins": [],
  "majorDeService": "",
  "techniciens": [],
  "telephoneRdv": ""
}
```

- **GET** : tout rôle EEG authentifié (`TECHNICIEN`, `CHEF_SERVICE`,
  `MAJOR_SERVICE`). Tant qu'aucune ligne n'est configurée, les valeurs sont
  vides plutôt qu'une erreur — la génération du document ne doit jamais être
  bloquée par une configuration manquante.
- **PUT** : `CHEF_SERVICE` et `MAJOR_SERVICE` uniquement. Upsert de l'unique
  ligne (`personnel_service_neurologie`).

Ce sont des **libellés imprimés**, pas un annuaire d'utilisateurs : l'annuaire
reste user-services.

## Champs de saisie du compte rendu (`EegResultat`)

Ajoutés en base pour couvrir le formulaire papier :

| Colonne | Valeurs | Saisie |
| --- | --- | --- |
| `etatEveil` | `"veille"` \| `"sommeil"` | archivage / rectification |
| `conditions` | texte libre (comportement, artéfacts, étape non réalisable) | idem |
| `noteComplementaireConclusion` | texte libre | idem |
| `noteComplementaireConduite` | texte libre | idem |

Acceptés par `ArchiverResultatDto` (`PATCH /eeg/demandes/:id/archiver`) et par
`RectifierResultatDto` (`POST /eeg/resultats/:id/rectifier`, avec trace
avant/après dans `EegRectification`). `TabC_CompteRendu` ne les envoie pas
encore : ils sont simplement stockés `null` en attendant.
