# Acceptance criteria (Q-gates)

| ID | Criterion | Test idea |
|----|-----------|-----------|
| Q1 | WorkRecord has a stable id and schema version | Create a record, then verify the returned id |
| Q2 | Preferred take settable | PUT preferred-take |
| Q3 | Roles enforce edit rights | Student cannot admin |
| Q4 | Comment anchors to region | POST comment with regionId |
| Q5 | Multi-domain tracks present | Fixture record has at least four track types |
| Q6 | Share blocked without consent | API 403 without consent |
| Q7 | Export produces valid work-record package | validate against work-record-package schema |
| Q8 | Submit creates immutable tag | Re-submit does not mutate tag body |
| Q9 | Analysis plugin cannot overwrite media | API rejects media write |
| Q10 | Current web surface states product boundaries | Shell copy names excluded system categories |
| Q11 | Package and video boundary documented | Maintained document exists and is indexed from the Practice Relay README |
| Q12 | OTIO, EAF, and Yjs boundaries documented | Architecture document matches shipped integrations |
| Q13 | Neighbour map retained | Positioning map names neighbours and the shell reflects the category boundary |
| Q14 | Export includes work-record package profile URI | Fixture assert |
| Q15 | No “Labanotation” on annotation track | UI string ban test |
| Q16 | No automated feedback homepage | Route inventory test |
| Q17 | Faculty multi-asset template | File under docs or seed data |

Alpha status: Q1 to Q17 remain the review rubric. Retained package, API, and
LTI contracts exercise component boundaries, but this public surface does not
ship a single aggregate Q-gate suite.
