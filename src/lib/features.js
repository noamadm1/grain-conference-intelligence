// Features that are built but not turned on (PRD 11). One flag per feature, read everywhere the feature appears.

// "מה כדאי לעשות": AI next actions per encounter. Moved to a later stage.
// false = off everywhere: new recordings don't generate them (processing), and the Person screen shows neither
// the "צור המלצות" button nor recommendations already saved (kept in the DB, shown again when this is true).
// Off completely so the demo doesn't show recommendations on some encounters and not others, with no explanation.
export const SUGGESTED_ACTIONS_ENABLED = false
