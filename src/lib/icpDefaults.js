// Default ICP formula settings (PRD section 5).
// This is only the starting point: the live values are in app_settings under key "icp_formula".
// The scoring script writes these defaults there the first time it runs. After that, edit them in the DB (or later with sliders), not here.

export const ICP_SETTINGS_KEY = 'icp_formula'

export const ICP_DEFAULTS = {
  // Maximum points for each component. They add up to 100.
  points: { audience: 45, seniority: 20, access: 25, geo_timing: 10 },

  // Segment weights (fit). Keys match audience_mix in conference_series.
  // Any share of the audience not listed here counts as "other" with weight 0.
  segment_weights: {
    payments_psp: 1.0,
    travel_wholesale: 0.9, // Tour operators, OTAs, wholesalers with FX exposure
    travel_general: 0.15, // Hotels, agents, destinations, travel tech
    treasury: 0.85,
    banks: 0.4, // Open question for Grain, see PRD section 12
    fintech_general: 0.25,
  },

  // Seniority: (share of decision makers ÷ cap) × points, limited to the points.
  seniority_cap_pct: 67,

  // Meeting access: points for each feature. They add up to points.access.
  access: {
    attendee_list: 8,
    meeting_system: 7,
    expo_floor: 5,
    long_event: 3,
    evening_events: 2,
    long_event_min_days: 3,
  },

  // Geography and timing: these come from system settings, not from AI.
  geo_timing: {
    focus_regions: ['europe', 'north-america'],
    focus_region_points: 6,
    // Assumption: "timing" means the conference starts within the next N months.
    timing_window_months: 6,
    timing_points: 4,
  },

  // Critical mass: volume = attendees × fit. This only subtracts points.
  // Checked from top to bottom. The first band where volume >= min_volume applies.
  mass_penalty: [
    { min_volume: 400, penalty: 0 },
    { min_volume: 150, penalty: 8 },
    { min_volume: 0, penalty: 15 },
  ],
}
