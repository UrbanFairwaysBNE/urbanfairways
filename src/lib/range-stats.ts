// Utilities for range shot statistics (client-side).

export type Shot = {
  id: string;
  session_id: string;
  shot_number: number | null;
  club_type: string | null;
  ball_speed: number | null;
  club_speed: number | null;
  smash_factor: number | null;
  launch_angle: number | null;
  launch_direction: number | null;
  spin_rate: number | null;
  spin_axis: number | null;
  back_spin: number | null;
  side_spin: number | null;
  carry: number | null;
  total: number | null;
  side_carry: number | null;
  side_total: number | null;
  apex_height: number | null;
  descent_angle: number | null;
  angle_of_attack: number | null;
  club_path: number | null;
  face_angle: number | null;
  face_to_path: number | null;
  shot_timestamp: string | null;
};

// ---------- Units ----------
export type DistanceUnit = "m" | "yd";
export type SpeedUnit = "mph" | "kph";

export const M_TO_YD = 1.09361;
export const YD_TO_M = 0.9144;
export const MPH_TO_KPH = 1.60934;
export const KPH_TO_MPH = 0.621371;

/**
 * Auto-detect speed unit (mph vs kph) using driver clubhead / ball speed.
 * Physical ranges (driver):
 *   Club speed  — mph: 70–130   kph: 115–210
 *   Ball speed  — mph: 95–190   kph: 155–305
 * Amateur avg clubhead is ~85 mph (137 kph). GSPro's CSV can export either
 * depending on the sim's unit preference — the two ranges overlap only
 * slightly, so we use club speed first (narrower spread) and fall back to
 * ball speed.
 */
export function detectSpeedUnit(shots: Shot[]): SpeedUnit {
  const driver = shots.filter((s) => {
    const c = (s.club_type || "").toLowerCase();
    return c === "dr" || c === "driver" || c === "d";
  });
  const cs = driver.map((s) => s.club_speed).filter((v): v is number => typeof v === "number" && v > 0);
  if (cs.length >= 3) {
    const avg = cs.reduce((a, b) => a + b, 0) / cs.length;
    if (avg > 135) return "kph";
    if (avg < 115) return "mph";
  }
  const bs = driver.map((s) => s.ball_speed).filter((v): v is number => typeof v === "number" && v > 0);
  if (bs.length >= 3) {
    const avg = bs.reduce((a, b) => a + b, 0) / bs.length;
    return avg > 195 ? "kph" : "mph";
  }
  // Fallback when no driver shots: use max speeds across ALL clubs. No club
  // (even a driver) exceeds ~135 mph clubhead or ~200 mph ball speed — so any
  // reading above those must be kph.
  const allCs = shots.map((s) => s.club_speed).filter((v): v is number => typeof v === "number" && v > 0);
  if (allCs.length >= 3) {
    if (Math.max(...allCs) > 135) return "kph";
  }
  const allBs = shots.map((s) => s.ball_speed).filter((v): v is number => typeof v === "number" && v > 0);
  if (allBs.length >= 3) {
    if (Math.max(...allBs) > 200) return "kph";
  }
  return "mph";
}

/**
 * Auto-detect distance unit (yards vs metres). Compare measured carry against
 * carry expected from ball speed. Uses driver when available, otherwise falls
 * back to a bag-wide average (expected_yd ≈ ball_speed_mph × 1.5).
 */
export function detectDistanceUnit(shots: Shot[]): DistanceUnit {
  const spdUnit = detectSpeedUnit(shots);
  const driver = shots.filter((s) => {
    const c = (s.club_type || "").toLowerCase();
    return c === "dr" || c === "driver" || c === "d";
  });
  const carries = driver.map((s) => s.carry).filter((v): v is number => typeof v === "number" && v > 0);
  if (carries.length >= 3) {
    const avgCarry = carries.reduce((a, b) => a + b, 0) / carries.length;
    const bs = driver.map((s) => s.ball_speed).filter((v): v is number => typeof v === "number" && v > 0);
    if (bs.length >= 3) {
      const avgBsRaw = bs.reduce((a, b) => a + b, 0) / bs.length;
      const avgBsMph = spdUnit === "kph" ? avgBsRaw * KPH_TO_MPH : avgBsRaw;
      const expectedYd = avgBsMph * 1.72;
      const expectedM = expectedYd * YD_TO_M;
      return Math.abs(avgCarry - expectedYd) < Math.abs(avgCarry - expectedM) ? "yd" : "m";
    }
    return avgCarry > 215 ? "yd" : "m";
  }
  const allBs = shots.map((s) => s.ball_speed).filter((v): v is number => typeof v === "number" && v > 0);
  const allCarry = shots.map((s) => s.carry).filter((v): v is number => typeof v === "number" && v > 0);
  if (allBs.length >= 3 && allCarry.length >= 3) {
    const avgBsRaw = allBs.reduce((a, b) => a + b, 0) / allBs.length;
    const avgBsMph = spdUnit === "kph" ? avgBsRaw * KPH_TO_MPH : avgBsRaw;
    const avgCarry = allCarry.reduce((a, b) => a + b, 0) / allCarry.length;
    const expectedYd = avgBsMph * 1.5;
    const expectedM = expectedYd * YD_TO_M;
    return Math.abs(avgCarry - expectedYd) < Math.abs(avgCarry - expectedM) ? "yd" : "m";
  }
  return "m";
}


export function convertDistance(v: number | null | undefined, from: DistanceUnit, to: DistanceUnit): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  if (from === to) return v;
  return from === "m" ? v * M_TO_YD : v * YD_TO_M;
}
export function convertSpeed(v: number | null | undefined, from: SpeedUnit, to: SpeedUnit): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  if (from === to) return v;
  return from === "mph" ? v * MPH_TO_KPH : v * KPH_TO_MPH;
}

/**
 * Canonical club ordering: Driver first, then Fairway Woods, Hybrids,
 * Irons (low → high number), then wedges (PW, GW/AW, SW, LW).
 * Matches the on-course/gapping convention. Also tolerates GSPro naming
 * variants (Dr, Driver, D, 3W, 3w, 3-wood, 5H, H5, 7I, 7i, 60°, etc.).
 */
function clubSortKey(raw: string): [number, number, string] {
  const c = (raw || "").trim().toLowerCase().replace(/\s|-/g, "");
  // 0: Driver
  if (/^(dr|driver|d1|d)$/.test(c)) return [0, 0, c];
  // 1: Fairway Woods (lower number = longer = first)
  let m = c.match(/^(\d+)w(ood)?$/) || c.match(/^w(\d+)$/) || c.match(/^(\d+)wood$/);
  if (m) return [1, parseInt(m[1], 10), c];
  // 2: Hybrids
  m = c.match(/^(\d+)h(yb(rid)?)?$/) || c.match(/^h(\d+)$/) || c.match(/^hybrid(\d+)?$/);
  if (m) return [2, parseInt(m[1] || "0", 10), c];
  // 3: Irons (lowest number first: 3i, 4i ... 9i)
  m = c.match(/^(\d+)i(ron)?$/) || c.match(/^i(\d+)$/) || c.match(/^iron(\d+)$/);
  if (m) return [3, parseInt(m[1], 10), c];
  // 4: Wedges — PW → GW/AW → SW → LW; loft-labelled wedges sort by loft
  if (/^p(w|itch(ing)?)?$/.test(c)) return [4, 46, c];
  if (/^(gw|aw|gap|approach)$/.test(c)) return [4, 51, c];
  if (/^(sw|sand)$/.test(c)) return [4, 56, c];
  if (/^(lw|lob)$/.test(c)) return [4, 60, c];
  const lm = c.match(/^(\d{2})[°d]?$/); // e.g. "52", "56°"
  if (lm) {
    const loft = parseInt(lm[1], 10);
    if (loft >= 44 && loft <= 64) return [4, loft, c];
  }
  return [9, 0, c];
}

export function sortClubs(clubs: string[]): string[] {
  return [...clubs].sort((a, b) => {
    const ka = clubSortKey(a), kb = clubSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });
}

// Deterministic color per club — brand-adjacent palette
const CLUB_PALETTE = [
  "#1C1F24", "#5F6F52", "#4A4D52", "#8C5A1F", "#6E7278", "#D9A867",
  "#2E623A", "#D24E1F", "#7BB682", "#8B5CF6", "#0EA5E9", "#F59E0B",
];
export function clubColor(club: string): string {
  let h = 0;
  for (let i = 0; i < club.length; i++) h = (h * 31 + club.charCodeAt(i)) >>> 0;
  return CLUB_PALETTE[h % CLUB_PALETTE.length];
}

const nums = (arr: (number | null | undefined)[]): number[] =>
  arr.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

export function mean(arr: (number | null | undefined)[]): number | null {
  const n = nums(arr);
  if (n.length === 0) return null;
  return n.reduce((a, b) => a + b, 0) / n.length;
}
export function max(arr: (number | null | undefined)[]): number | null {
  const n = nums(arr);
  return n.length === 0 ? null : Math.max(...n);
}
export function median(arr: (number | null | undefined)[]): number | null {
  const n = nums(arr).sort((a, b) => a - b);
  if (n.length === 0) return null;
  const mid = Math.floor(n.length / 2);
  return n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2;
}
export function stddev(arr: (number | null | undefined)[]): number | null {
  const n = nums(arr);
  if (n.length < 2) return null;
  const m = n.reduce((a, b) => a + b, 0) / n.length;
  const v = n.reduce((a, b) => a + (b - m) ** 2, 0) / (n.length - 1);
  return Math.sqrt(v);
}

/**
 * Trim per-club outliers. A shot is dropped if either:
 *  - carry is <65% or >135% of the club's median carry (mishit / topped / thin), or
 *  - lateral (|side|) is more than 2.5× the median |side| AND beyond 3× the club median lateral
 *    (catches shanks / big pushes that still carry a normal distance).
 * Shots without a carry are kept.
 */
export function trimOutliers(shots: Shot[]): Shot[] {
  const byClub = new Map<string, Shot[]>();
  for (const s of shots) {
    const c = s.club_type || "Unknown";
    const arr = byClub.get(c) ?? [];
    arr.push(s);
    byClub.set(c, arr);
  }
  const keep: Shot[] = [];
  for (const [, arr] of byClub) {
    const med = median(arr.map((s) => s.carry));
    const sideAbs = arr.map((s) => {
      const side = s.side_carry ?? s.side_total;
      return side == null ? null : Math.abs(side);
    });
    const medSide = median(sideAbs) ?? 0;
    // Fallback lateral cap: max(2.5× median lateral, 15% of median carry, 8 units)
    const lateralCap = Math.max(medSide * 2.5, (med ?? 0) * 0.15, 8);
    for (const s of arr) {
      const c = s.carry;
      if (c !== null && c !== undefined && Number.isFinite(c) && med && med > 0) {
        if (c < med * 0.65 || c > med * 1.35) continue;
      }
      const side = s.side_carry ?? s.side_total;
      if (side != null && Number.isFinite(side) && Math.abs(side) > lateralCap) continue;
      keep.push(s);
    }
  }
  return keep;
}


export type ClubStats = {
  club: string;
  shots: number;
  avgCarry: number | null;
  maxCarry: number | null;
  avgTotal: number | null;
  maxTotal: number | null;
  avgBallSpeed: number | null;
  avgClubSpeed: number | null;
  avgSmash: number | null;
  avgLaunch: number | null;
  avgSpin: number | null;
  lateralSd: number | null;
  smashSd: number | null;
};

export function statsByClub(shots: Shot[]): ClubStats[] {
  const groups = new Map<string, Shot[]>();
  for (const s of shots) {
    const club = s.club_type || "Unknown";
    const arr = groups.get(club) ?? [];
    arr.push(s);
    groups.set(club, arr);
  }
  return sortClubs(Array.from(groups.keys())).map((club) => {
    const g = groups.get(club)!;
    return {
      club,
      shots: g.length,
      avgCarry: mean(g.map((s) => s.carry)),
      maxCarry: max(g.map((s) => s.carry)),
      avgTotal: mean(g.map((s) => s.total)),
      maxTotal: max(g.map((s) => s.total)),
      avgBallSpeed: mean(g.map((s) => s.ball_speed)),
      avgClubSpeed: mean(g.map((s) => s.club_speed)),
      // Only average physically-valid smash values. GSPro logs 0/null for
      // mishits and partial captures, which would otherwise drag the per-club
      // average well below reality (e.g. a driver showing 0.9).
      avgSmash: mean(g.map((s) => s.smash_factor).filter((v): v is number => typeof v === "number" && v > 0.5 && v <= 1.55)),
      avgLaunch: mean(g.map((s) => s.launch_angle)),
      avgSpin: mean(g.map((s) => s.spin_rate)),
      lateralSd: stddev(g.map((s) => s.side_carry ?? s.side_total)),
      smashSd: stddev(g.map((s) => s.smash_factor)),
    };
  });
}

export type SwingStats = {
  club: string;
  shots: number;
  avgPath: number | null;
  avgFace: number | null;
  avgFaceToPath: number | null;
  avgAoA: number | null;
  avgLaunch: number | null;
  avgSpinAxis: number | null;
};
export function swingStatsByClub(shots: Shot[]): SwingStats[] {
  const groups = new Map<string, Shot[]>();
  for (const s of shots) {
    const club = s.club_type || "Unknown";
    const arr = groups.get(club) ?? [];
    arr.push(s);
    groups.set(club, arr);
  }
  return sortClubs(Array.from(groups.keys())).map((club) => {
    const g = groups.get(club)!;
    return {
      club,
      shots: g.length,
      avgPath: mean(g.map((s) => s.club_path)),
      avgFace: mean(g.map((s) => s.face_angle)),
      avgFaceToPath: mean(g.map((s) => s.face_to_path)),
      avgAoA: mean(g.map((s) => s.angle_of_attack)),
      avgLaunch: mean(g.map((s) => s.launch_angle)),
      avgSpinAxis: mean(g.map((s) => s.spin_axis)),
    };
  });
}

/**
 * 2D dispersion ellipse. Computes centroid + 2×2 covariance of (side, carry),
 * returns semi-axes (kσ) and rotation angle in radians.
 * Also classifies the dominant shot shape.
 */
export type Ellipse = {
  cx: number; cy: number;
  rx: number; ry: number; // semi-axes at k*sigma (world units)
  angleRad: number;        // rotation of major axis
  n: number;
  shape: "Straight" | "Draw" | "Fade" | "Push" | "Pull" | "Hook" | "Slice" | "Mixed";
  shapePct: number;        // % of shots in dominant shape bucket
};

export function fitEllipse(points: { side: number; carry: number }[], k = 2): Ellipse | null {
  const pts = points.filter((p) => Number.isFinite(p.side) && Number.isFinite(p.carry));
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((a, b) => a + b.side, 0) / n;
  const my = pts.reduce((a, b) => a + b.carry, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p.side - mx, dy = p.carry - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= (n - 1); syy /= (n - 1); sxy /= (n - 1);

  // Eigenvalues of [[sxx, sxy],[sxy, syy]]
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  const l2 = tr / 2 - Math.sqrt(disc);
  const rx = k * Math.sqrt(Math.max(0, l1));
  const ry = k * Math.sqrt(Math.max(0, l2));
  const angleRad = 0.5 * Math.atan2(2 * sxy, sxx - syy);

  // Shot shape: classify each shot on side & side/carry ratio
  let straight = 0, draw = 0, fade = 0, push = 0, pull = 0, hook = 0, slice = 0;
  for (const p of pts) {
    const ratio = p.side / Math.max(1, Math.abs(p.carry));
    const abs = Math.abs(p.side);
    if (abs < 3) straight++;
    else if (ratio < -0.15) hook++;
    else if (ratio > 0.15) slice++;
    else if (ratio < -0.05) draw++;
    else if (ratio > 0.05) fade++;
    else if (p.side < 0) pull++;
    else push++;
  }
  const buckets: [Ellipse["shape"], number][] = [
    ["Straight", straight], ["Draw", draw], ["Fade", fade],
    ["Pull", pull], ["Push", push], ["Hook", hook], ["Slice", slice],
  ];
  buckets.sort((a, b) => b[1] - a[1]);
  const [topShape, topN] = buckets[0];
  const pct = (topN / n) * 100;
  return {
    cx: mx, cy: my, rx, ry, angleRad, n,
    shape: pct >= 40 ? topShape : "Mixed",
    shapePct: pct,
  };
}

export function fmt(n: number | null | undefined, digits = 1, suffix = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}
