// Default ICP formula settings (PRD section 5).
// This is only the starting point: the live values are in app_settings under key "icp_formula".
// The scoring script writes these defaults there the first time it runs. After that, edit them in the DB (or later with sliders), not here.

export const ICP_SETTINGS_KEY = 'icp_formula'

export const ICP_DEFAULTS = {
  // Maximum points for each component. They add up to 100.
  // Audience leads. Seniority was 20: a good rep works up from whoever they meet to the decision maker.
  points: { audience: 50, seniority: 10, access: 30, geo: 10 },

  // Seniority, access and geography depend partly on fit: access to meetings is worth something only if there are relevant people to meet.
  // score = audience + (seniority + access + geo) × (floor + (1 − floor) × fit) − penalty
  // floor 0.5: half the value is real regardless (an expo floor is still an expo floor), half depends on the audience.
  // 0 = fully multiplied by fit (caps every score at fit × 100). 1 = no scaling (the older formula).
  context_fit_floor: 0.5,

  // Segment weights (fit). Keys match audience_mix in conference_series.
  // The ICP is PLATFORMS: companies that move money on behalf of others (Booking, not the hotel). Grain interview, PRD section 5.
  // Individual businesses hedging their own FX exposure are not the ICP, however much FX they have.
  // Any share of the audience not listed here (incl. "other") counts with weight 0.
  segment_weights: {
    platforms: 1.0, // Marketplaces, booking platforms / OTAs, gig platforms
    payments_psp: 1.0, // PSPs and cross-border payment companies (platforms too)
    embedded_fintech: 0.7, // Embedded finance, BaaS, vertical fintech
    saas_vertical: 0.5, // Vertical software that may embed payments
    treasury: 0.3, // Was 0.85. Corporate treasury of individual businesses, not platforms
    travel_wholesale: 0.3, // Was 0.9. Tour operators and wholesalers: individual businesses (OTAs moved to platforms)
    banks: 0.1, // Competitor, not customer: businesses hedge FX with their bank today, Grain replaces that. Not 0: competitive intel + partnerships
    travel_general: 0.1, // Hotels, agents, destinations
  },

  // Seniority: (share of decision makers ÷ cap) × points, limited to the points.
  seniority_cap_pct: 67,

  // Meeting access: points for each feature. They add up to points.access.
  // Highest points for what allows preparing ahead (attendee list, meeting system).
  access: {
    attendee_list: 10,
    meeting_system: 8,
    expo_floor: 6,
    long_event: 4,
    evening_events: 2,
    long_event_min_days: 3,
  },

  // Geography: focus market yes/no, all of points.geo. Comes from system settings, not from AI.
  // No timing component: the DB covers one year ahead, so every conference is "soon". Timing belongs in the planning view.
  geo: {
    focus_regions: ['europe', 'north-america'],
  },

  // Critical mass: volume = attendees × fit. This only subtracts points.
  // Checked from top to bottom. The first band where volume >= min_volume applies.
  mass_penalty: [
    { min_volume: 400, penalty: 0 },
    { min_volume: 150, penalty: 8 },
    { min_volume: 0, penalty: 15 },
  ],
}
