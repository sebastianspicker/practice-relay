# Acceptance criteria - MvEI + MvEI Workbench

| ID | Criterion |
|----|-----------|
| Q1-P0 | Schemas validate corpus via `pnpm validate:schemas` |
| Q2 | Validator CLI rejects invalid Motif |
| Q3 | Partial Motif (`completeness: sketch`) validates |
| Q4 | At least 3 corpus pedagogical samples |
| Q5 | Practice Relay can load fixture package with real Motif JSON |
| Q6 | Neighbour page distinguishes LabanLab, LaMoGen, and MARC from MvEI |
| Q7 | Capture docs prefer Pose2Sim/OpenCap |
| Q8 | No “first browser Laban” string in product copy |
| Q9 | annotationLinks optional field supported |
| Q10 | Schema site lists profiles + corpus |

Alpha: Q1-Q10 are covered by `pnpm validate:schemas`, validator CLI tests, schema-site tests, MvEI Workbench Motif tests, and Practice Relay-loadable fixture checks. No unresolved implementation placeholder remains for these gates.
