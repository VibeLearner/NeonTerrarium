// Neon Terrarium: what there is to find on the meshes. Not loaded for now: kept for the hacking mode later (the
// transmission log is flavor only; the command line that used this is in git history).
// Each corporation keeps one file system (root, four folders, a handful of dry files), reachable through whichever
// meshes it sits on. Files are [name, size in KB, marks, body]: marks 'f' = flagged by a scan (it matters), 'e' =
// encrypted (no key yet: the field set comes later). Up to 256 KB reads straight into the log; bigger has to be pulled.
// The files point at one another. The SK-3 optics log a gap every night, 02:00 to 04:00, and upload in it; returns go
// to Halvren depot 4 and on to Ostrava, whose new cameras are fitted with refurbished optic modules, 31 of them;
// Meridian measured what 31 test wearers looked at; Ostrava's sector 4 maintenance window covers the same two hours
// and nobody works it. Halvren's drivers are being followed by something unregistered, and nobody at Ostrava's
// airspace desk is reading. And Ostrava has noticed a listening post: node 07, the Wire Nest.
'use strict';
const WIREFS = (() => {
  // which hosts answer on which mesh
  const HOSTS = { A: ['synthcorp', 'halvren', 'meridian'], B: ['halvren', 'ostrava', 'meridian'], C: ['ostrava', 'synthcorp'] };
  const MEMO = [
    'SYNTHCORP · INTERNAL · RESTRICTED',
    'RE · SK-3 optics · batch 14-J · recall scope',
    '',
    'Field returns · 212 units',
    'Units with log gaps · 31',
    'Gap window · 02:00-04:00 · consistent across units',
    '',
    'Public notice · cite thermal fault only',
    'Gap pattern · not to be referenced',
    'Returned units · route to Halvren depot 4 · not to clinic',
    'Retention · 30 days · then purge',
  ];
  const TREE = {
    synthcorp: {
      documents: [
        ['sk3_notice_draft.txt', 12, 'f', ['SYNTHCORP · PUBLIC NOTICE · DRAFT 3', 'Product · SK-3 optics · batch 14-J', 'Fault · thermal · rare', 'Action · return to clinic · no charge',
          'Draft 2 line struck · "data retention anomaly"', 'Approved · legal · comms']],
        ['returns_desk_note.txt', 4, 'f', ['SYNTHCORP · RETURNS DESK', 'SK-3 returns · do not open casing', 'Do not wipe · do not test', 'Seal · tag HV-4 · hand to courier',
          'Courier · Halvren · night pickup only']],
        ['firmware_7_changelog.txt', 22, 'f', ['SYNTHCORP · FIRMWARE 7.2.0 · SK-3', 'Fixed · color drift in low light', 'Fixed · battery report rounding',
          'Changed · upload interval · 24 hr to 02:00 daily', 'Changed · upload size cap · removed', 'Public notes · lines 3 and 4 omitted']],
        ['hiring_field_techs.txt', 6, '', ['SYNTHCORP · HIRING · FIELD TECHNICIANS', 'Openings · 24', 'Shift · nights · sector 4 preferred', 'Clearance · Ostrava contractor badge',
          'Apply · clinic intake']],
        ['brand_guide_v9.pdf', 3480, '', ['SYNTHCORP · BRAND GUIDE · V9', 'Tone · warm · clinical · never fearful', 'Words to avoid · record · capture · watch',
          'Words to use · clarity · care · restore', 'Optics imagery · eyes closed · always']],
      ],
      reports: [
        ['q3_units_shipped.csv', 140, '', ['SYNTHCORP · Q3 · UNITS SHIPPED', 'SK-3 optics · 4,812', 'VX-2 hand · 1,104', 'LN-5 spine cable · 610', 'OR-4 cochlear · 2,290',
          'Returns rate · 0.9% · within target']],
        ['clinic_survey_q3.txt', 18, '', ['SYNTHCORP · CLINIC SURVEY · Q3', 'Responses · 1,280', 'Fit comfort · 4.1 / 5', 'Wait time · 3.6 / 5',
          'Comment trend · "eyes warm at night" · 41 mentions', 'Action · none']],
        ['warranty_claims_q3.txt', 30, '', ['SYNTHCORP · WARRANTY · Q3', 'Claims · 312 · approved 190', 'Void · third-party repair · 88', 'Void · casing opened · 34',
          'Casing-opened claims · refer to legal']],
      ],
      archive: [
        ['sk3_recall_memo', 2150, 'f', MEMO],
        ['old_logo_set.zip', 6800, '', ['SYNTHCORP · LOGO SET · RETIRED', 'Mark · open eye', 'Retired · focus group · "watchful"', 'Replacement · closed eye · approved']],
        ['board_minutes_q3.txt', 44, '', ['SYNTHCORP · BOARD · MINUTES · Q3', 'Item 1 · Q3 figures · noted', 'Item 2 · Ostrava partnership · renewed · 3 yr',
          'Item 3 · data revenue line · moved off public books', 'Item 4 · other business · none']],
      ],
      clinic: [
        ['intake_today.txt', 9, '', ['SYNTHCORP · CLINIC INTAKE · TODAY', 'Fittings · 17', 'SK-3 · 9 · VX-2 · 4 · OR-4 · 4', 'Walk-ins · 3 · turned away · 3']],
        ['sk3_fitting_procedure.txt', 16, 'f', ['SYNTHCORP · SK-3 FITTING', 'Step 1 · pair to clinic node', 'Step 2 · confirm upload link · do not mention',
          'Step 3 · calibrate · low light', 'Step 4 · book follow-up · 90 days']],
        ['patient_records.db', 48200, 'e', []],
      ],
    },
    halvren: {
      manifests: [
        ['depot4_inbound.csv', 260, 'f', ['HALVREN · DEPOT 4 · INBOUND · NIGHT', 'Ref HV-4 · SYNTHCORP returns · 31 units · sealed', 'Ref HV-4 · SYNTHCORP returns · 12 units · sealed',
          'Handling · no scan · no open', 'Consignee · OSTRAVA · sensor division', 'Collection · 03:10 · unmarked van']],
        ['depot2_outbound.csv', 88, '', ['HALVREN · DEPOT 2 · OUTBOUND', 'Groceries · 1,140 crates', 'Clinic supplies · 62 crates', 'Billboard panels · MERIDIAN · 40', 'Status · dispatched']],
        ['customs_holds.txt', 11, 'f', ['HALVREN · HOLDS · THIS WEEK', 'Hold 1 · mislabelled coolant · released', 'Hold 2 · drone parts · 6 crates · consignee unknown',
          'Hold 2 · status · pending · no claimant', 'Hold 3 · paperwork · released']],
      ],
      routes: [
        ['route_7_schedule.txt', 14, 'f', ['HALVREN · ROUTE 7 · SCHEDULE', 'Runs · every 40 min · 05:00-01:00', 'Night run · 02:00-04:00 · depot 4 only',
          'Night driver · cleared by OSTRAVA']],
        ['lane_closures.txt', 7, '', ['HALVREN · LANE CLOSURES', 'Route 3 · 22:00-00:00 · resurfacing', 'Route 9 · 01:00-03:00 · billboard install · MERIDIAN']],
        ['fuel_report_week.txt', 20, 'f', ['HALVREN · FUEL · WEEK', 'Fleet draw · 41,200 kWh', 'Anomaly · van 0412 · 3 night runs · no manifest',
          'Status · unexplained · closed by supervisor']],
      ],
      archive: [
        ['incident_van_0412.txt', 31, 'f', ['HALVREN · INCIDENT · VAN 0412', 'Driver report · followed · 2 runs', 'Pursuer · aerial · no lights', 'Driver statement · "not one of ours"',
          'Fleet registry · no matching tail', 'Action · driver reassigned · report sealed']],
        ['tender_result_cameras.txt', 12, '', ['HALVREN · TENDER · RESULT', 'Bid · camera array logistics', 'Result · lost · awarded to OSTRAVA in-house',
          'Note · OSTRAVA has no in-house logistics']],
      ],
      fleet: [
        ['drone_registry.db', 12400, 'f', ['HALVREN · DRONE REGISTRY', 'Registered · 140 · tail prefix HV', 'Unregistered sightings · 9 this month', 'Bearing cluster · 340-010',
          'Altitude · 280-320 m', 'Forwarded · OSTRAVA airspace desk · no reply']],
        ['bay2_service.txt', 9, '', ['HALVREN · BAY 2 · DRONES', 'In service · 12', 'Rotor swaps · 4', 'Firmware · HV 3.1 · pushed']],
        ['night_routing_keys.bin', 640, 'e', []],
      ],
    },
    meridian: {
      briefs: [
        ['brief_see_clearly.txt', 18, 'f', ['MERIDIAN · BRIEF · CLIENT SYNTHCORP', 'Campaign · "See clearly"', 'Product · SK-3 optics', 'Status · paused · client request',
          'Reason · recall · do not run against news']],
        ['brief_attention_pilot.txt', 26, 'f', ['MERIDIAN · PILOT · MEASURED ATTENTION', 'Partner data · SYNTHCORP · 31 test units', 'Measure · what wearers looked at · how long',
          'Result · billboard recall · 2.6x', 'Scale-up · pending · legal']],
        ['brief_safer_grid.txt', 9, '', ['MERIDIAN · BRIEF · CLIENT OSTRAVA', 'Campaign · "A safer grid"', 'Message · cameras are street lights', 'Placement · 40 billboards · sector 4']],
      ],
      campaigns: [
        ['live_now.csv', 64, '', ['MERIDIAN · LIVE CAMPAIGNS', 'SYNTHCORP firmware · 12 panels', 'HALVREN careers · 8 panels', 'OSTRAVA safer grid · 40 panels', 'Vacant · 14']],
        ['panel_map_sector4.png', 5200, 'f', ['MERIDIAN · PANEL MAP · SECTOR 4', 'Panels · 40', 'Tagged OPT-IN · 31 panels', 'Legend for OPT-IN · not included']],
      ],
      archive: [
        ['withdrawn_items.txt', 15, 'f', ['MERIDIAN · CONTENT REVIEW · WITHDRAWN', 'Item 1 · news clip · SK-3 glow at night', 'Item 2 · interview · former clinic tech',
          'Item 3 · forum repost · "who reads the uploads"', 'Reason · client sensitivity']],
        ['rate_card.txt', 5, '', ['MERIDIAN · RATE CARD', 'Panel · prime · per hour', 'Panel · night · discount 60%', 'Night slots · 02:00-04:00 · not for sale']],
      ],
      review: [
        ['review_queue.txt', 7, '', ['MERIDIAN · REVIEW QUEUE', 'Pending · 6', 'Oldest · 4 days', 'Escalated · 1 · OSTRAVA request']],
        ['escalation_ostrava.txt', 3, 'e', []],
      ],
    },
    ostrava: {
      tenders: [
        ['camera_array_award.txt', 21, 'f', ['OSTRAVA · TENDER · CAMERA ARRAY', 'Units · 400 · sector 4 first', 'Optic modules · refurbished · supplier withheld',
          'Logistics · in house', 'Status · awarded']],
        ['grid_upgrade_bids.txt', 13, '', ['OSTRAVA · TENDER · GRID UPGRADE', 'Bids · 3 · lowest HALVREN', 'Award · deferred']],
      ],
      maintenance: [
        ['window_sector4.txt', 6, 'f', ['OSTRAVA · MAINTENANCE WINDOW', 'Grid sector 4 · 02:00-04:00 · nightly', 'Work logged · none', 'Crew assigned · none',
          'Window · standing · no end date']],
        ['crew_rota.txt', 8, '', ['OSTRAVA · CREW ROTA', 'Day crews · 6', 'Night crews · 0']],
      ],
      archive: [
        ['unlicensed_receivers.txt', 10, 'f', ['OSTRAVA · SPECTRUM · UNLICENSED RECEIVERS', 'Node 07 · listening post · location pending', 'Band · 2.4 / 5.8 GHz',
          'Status · referred to enforcement · hold', 'Hold · until sector 4 window review']],
        ['airspace_desk_inbox.txt', 19, 'f', ['OSTRAVA · AIRSPACE DESK · INBOX', 'HALVREN · unregistered sightings · 9 · unread', 'HALVREN · follow-up · unread',
          'Public · lights over the city · unread', 'Auto-reply · desk unstaffed']],
      ],
      sensors: [
        ['sensor_install_log.csv', 340, 'f', ['OSTRAVA · SENSOR INSTALLS', 'Poles · 80 · sector 4', 'Module · OPT · refurbished · 31', 'Uplink · 02:00 daily · bulk',
          'Destination · not logged']],
        ['calibration.db', 22100, 'e', []],
      ],
    },
  };
  return { HOSTS, TREE, MEMO, READ_MAX: 256 };
})();
