# Schéma MySQL : `AMPRIC`

_Seules les tables physiques (BASE TABLE) sont prises en compte._


## TABLES

- AMPRIC.utilisateurs

## COLUMNS

- AMPRIC.utilisateurs | id | int | NO
- AMPRIC.utilisateurs | nom | varchar(50) | NO
- AMPRIC.utilisateurs | prenom | varchar(50) | NO
- AMPRIC.utilisateurs | telephone | varchar(15) | NO
- AMPRIC.utilisateurs | email | varchar(100) | NO
- AMPRIC.utilisateurs | comment | text | YES
- AMPRIC.utilisateurs | date_inscription | datetime | YES

## CONSTRAINTS

- AMPRIC.utilisateurs | PRIMARY KEY | id
- AMPRIC.utilisateurs | UNIQUE | email
- AMPRIC.utilisateurs | UNIQUE | telephone