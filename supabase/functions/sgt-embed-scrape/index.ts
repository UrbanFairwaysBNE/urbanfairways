const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TourStanding {
  position: number;
  playerName: string;
  hcp: number | null;
  events: number;
  wins: number;
  top5: number;
  top10: number;
  points: number;
}

interface TournamentStanding {
  position: number;
  playerName: string;
  hcp: number | null;
  r1: string;
  r1Thru: string;
  r2: string;
  r2Thru: string;
  total: string;
  toPar: string;
}

function parseTourStandings(html: string): TourStanding[] {
  const standings: TourStanding[] = [];
  
  // Normalize whitespace
  const normalizedHtml = html.replace(/\s+/g, ' ');
  
  // Match rows with data-player-name attribute
  const rowRegex = /<tr[^>]*data-player-name=['"]([^'"]+)['"][^>]*>(.*?)<\/tr>/gi;
  let match;
  
  while ((match = rowRegex.exec(normalizedHtml)) !== null) {
    const playerName = match[1];
    const rowContent = match[2];
    
    // Extract position from first td
    const posMatch = rowContent.match(/<td[^>]*position[^>]*>(\d+)<\/td>/i);
    const position = posMatch ? parseInt(posMatch[1], 10) : 0;
    
    // Extract handicap from three-quarter-font div after player name (can be negative like -18)
    const hcpMatch = rowContent.match(/three-quarter-font[^>]*>(-?\d+)<\/div>/i);
    const hcp = hcpMatch ? parseInt(hcpMatch[1], 10) : null;
    
    // Extract all td cells and get their text content
    const cellRegex = /<td[^>]*>(.*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      // Strip HTML tags and get text content
      const text = cellMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      cells.push(text);
    }
    
    // Extract numeric values from cells (skip first 2: position and player)
    // Order: events, wins, top5, top10, points
    const numericValues: number[] = [];
    for (let i = 2; i < cells.length; i++) {
      const num = parseInt(cells[i], 10);
      if (!isNaN(num)) {
        numericValues.push(num);
      }
    }
    
    standings.push({
      position,
      playerName,
      hcp,
      events: numericValues[0] || 0,
      wins: numericValues[1] || 0,
      top5: numericValues[2] || 0,
      top10: numericValues[3] || 0,
      points: numericValues[4] || numericValues[numericValues.length - 1] || 0,
    });
  }
  
  return standings;
}

function parseTournamentStandings(html: string): TournamentStanding[] {
  const standings: TournamentStanding[] = [];
  
  const normalizedHtml = html.replace(/\s+/g, ' ');
  
  // Match rows with data-player-name attribute
  const rowRegex = /<tr[^>]*data-player-name=['"]([^'"]+)['"][^>]*>(.*?)<\/tr>/gi;
  let match;
  
  while ((match = rowRegex.exec(normalizedHtml)) !== null) {
    const playerName = match[1];
    const rowContent = match[2];
    
    // Extract position from td with class containing "position"
    const posMatch = rowContent.match(/<td[^>]*position[^>]*>(\d+)<\/td>/i);
    const position = posMatch ? parseInt(posMatch[1], 10) : 0;
    
    // Extract handicap from three-quarter-font div after player name (can be negative like -18)
    const hcpMatch = rowContent.match(/three-quarter-font[^>]*>(-?\d+)<\/div>/i);
    const hcp = hcpMatch ? parseInt(hcpMatch[1], 10) : null;
    
    // Extract round scores from td cells with "round" in class
    // Pattern: <td class="... round ...">+5 <span class="three-quarter-font">F</span></td>
    const roundRegex = /<td[^>]*\bround\b[^>]*>([^<]*(?:<span[^>]*>[^<]*<\/span>)?[^<]*)<\/td>/gi;
    const rounds: { score: string; thru: string }[] = [];
    let roundMatch;
    
    while ((roundMatch = roundRegex.exec(rowContent)) !== null) {
      const content = roundMatch[1].trim();
      
      // Extract score: +1, -2, E, or empty
      const scoreMatch = content.match(/^([+-]?\d+|E)/);
      const score = scoreMatch ? scoreMatch[1] : '';
      
      // Extract thru from span: F or (12)
      const thruMatch = content.match(/<span[^>]*>([^<]*)<\/span>/);
      const thruRaw = thruMatch ? thruMatch[1].replace(/[()]/g, '').trim() : '';
      
      rounds.push({ score, thru: thruRaw });
    }
    
    // Extract total from td with "total" in class
    const totalMatch = rowContent.match(/<td[^>]*\btotal\b[^>]*>([+-]?\d+|E)<\/td>/i);
    const total = totalMatch ? totalMatch[1] : '-';
    
    standings.push({
      position,
      playerName,
      hcp,
      r1: rounds[0]?.score || '-',
      r1Thru: rounds[0]?.thru || '',
      r2: rounds[1]?.score || '-',
      r2Thru: rounds[1]?.thru || '',
      total,
      toPar: total, // For single-round tournaments, total = toPar
    });
  }
  
  return standings;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    let body: Record<string, unknown> | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }

    const getParam = (key: string) => {
      const fromQuery = url.searchParams.get(key);
      if (fromQuery !== null) return fromQuery;
      const fromBody = body?.[key];
      if (typeof fromBody === "string" || typeof fromBody === "number") return String(fromBody);
      return null;
    };

    const type = getParam("type"); // "tour" or "tournament"
    const id = getParam("id"); // tour ID or tournament ID
    const scoreType = getParam("scoreType") || "net"; // "net" or "gross"
    
    console.log(`[SGT-EMBED-SCRAPE] Type: ${type}, ID: ${id}, Score Type: ${scoreType}`);

    if (!type || !id) {
      return new Response(
        JSON.stringify({ error: "type and id parameters are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construct the SGT embed URL
    let embedUrl: string;
    if (type === "tour") {
      embedUrl = `https://simulatorgolftour.com/embed/tour/${id}/standings/${scoreType}?theme=dark`;
    } else if (type === "tournament") {
      embedUrl = `https://simulatorgolftour.com/embed/tournament/${id}/standings/${scoreType}?theme=dark`;
    } else {
      return new Response(
        JSON.stringify({ error: "type must be 'tour' or 'tournament'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-EMBED-SCRAPE] Fetching: ${embedUrl}`);

    // Fetch the SGT embed page
    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VenueApp/1.0)",
        "Accept": "text/html",
      },
    });

    if (!response.ok) {
      console.error(`[SGT-EMBED-SCRAPE] Failed to fetch: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `Failed to fetch SGT data: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await response.text();
    console.log(`[SGT-EMBED-SCRAPE] Received ${html.length} bytes`);

    // Parse the HTML based on type
    let standings;
    if (type === "tour") {
      standings = parseTourStandings(html);
    } else {
      standings = parseTournamentStandings(html);
    }

    // Manual net-score overrides (applied only to tournament net leaderboards)
    // Format: { [tournamentId]: { [playerName]: { hcp, r1Net, r2Net, total } } }
    const NET_OVERRIDES: Record<string, Record<string, { hcp: number; r1: string; r2: string; total: string }>> = {
      "62628": {
        "Jarrod": { hcp: 10, r1: "-9", r2: "+3", total: "-6" },
        "JakeDavies": { hcp: 20, r1: "E", r2: "-2", total: "-2" },
      },
    };

    if (type === "tournament" && scoreType === "net" && NET_OVERRIDES[id]) {
      const overrides = NET_OVERRIDES[id];
      const tStandings = standings as TournamentStanding[];
      for (const s of tStandings) {
        const o = overrides[s.playerName];
        if (o) {
          s.hcp = o.hcp;
          s.r1 = o.r1;
          s.r2 = o.r2;
          s.total = o.total;
          s.toPar = o.total;
        }
      }
      // Re-sort by total (numeric, lower = better; E = 0)
      const toNum = (v: string) => v === "E" ? 0 : parseInt(v, 10) || 0;
      tStandings.sort((a, b) => toNum(a.total) - toNum(b.total));
      tStandings.forEach((s, i) => { s.position = i + 1; });
      standings = tStandings;
    }

    console.log(`[SGT-EMBED-SCRAPE] Parsed ${standings.length} standings`);
    if (standings.length > 0) {
      console.log(`[SGT-EMBED-SCRAPE] First standing:`, JSON.stringify(standings[0]));
    }


    return new Response(
      JSON.stringify({ 
        standings,
        fetchedAt: new Date().toISOString(),
        source: embedUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-EMBED-SCRAPE] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
