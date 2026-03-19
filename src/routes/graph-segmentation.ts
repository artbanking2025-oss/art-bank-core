import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/graph-segmentation/by-chronology
 * Segment artworks by time periods
 * 
 * Creates chronological vectors:
 * - Ancient (pre-1800)
 * - Modern (1800-1945)
 * - Contemporary (1945-2000)
 * - Current (2000+)
 */
app.post('/by-chronology', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { start_year, end_year } = await c.req.json();

  try {
    const artworks = await db.getAllArtworks();
    
    // Define periods
    const periods = [
      { name: 'Ancient', start: 0, end: 1800, emoji: '🏛️' },
      { name: 'Modern', start: 1800, end: 1945, emoji: '🎨' },
      { name: 'Contemporary', start: 1945, end: 2000, emoji: '🖼️' },
      { name: 'Current', start: 2000, end: 2100, emoji: '✨' }
    ];

    // Segment by period
    const segmented = periods.map(period => {
      const works = artworks.filter((a: any) => {
        const year = a.created_year || 0;
        const inRange = start_year && end_year 
          ? year >= start_year && year <= end_year
          : true;
        return year >= period.start && year < period.end && inRange;
      });

      return {
        period: period.name,
        emoji: period.emoji,
        timerange: `${period.start}-${period.end}`,
        count: works.length,
        artworks: works.map((a: any) => ({
          id: a.id,
          title: a.title,
          year: a.created_year,
          style: a.style,
          artist_id: a.artist_node_id
        }))
      };
    });

    return c.json({
      chronology_segments: segmented.filter(s => s.count > 0),
      total_periods: segmented.filter(s => s.count > 0).length,
      total_artworks: segmented.reduce((sum, s) => sum + s.count, 0),
      filter: start_year && end_year ? { start_year, end_year } : null
    });

  } catch (error) {
    console.error('Chronology segmentation error:', error);
    return c.json({ error: 'Failed to segment by chronology' }, 500);
  }
});

/**
 * POST /api/graph-segmentation/by-style
 * Segment artworks by artistic style
 * 
 * Style clusters:
 * - Impressionism, Expressionism, Abstract, Realism, etc.
 */
app.post('/by-style', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { min_count = 1 } = await c.req.json();

  try {
    const artworks = await db.getAllArtworks();
    
    // Group by style
    const styleMap = new Map<string, any[]>();
    
    for (const artwork of artworks) {
      const style = (artwork.style || 'Unknown').trim();
      if (!styleMap.has(style)) {
        styleMap.set(style, []);
      }
      styleMap.get(style)!.push({
        id: artwork.id,
        title: artwork.title,
        year: artwork.created_year,
        artist_id: artwork.artist_node_id,
        price: artwork.current_fpc
      });
    }

    // Convert to array and sort by count
    const styleSegments = Array.from(styleMap.entries())
      .map(([style, works]) => ({
        style,
        emoji: getStyleEmoji(style),
        count: works.length,
        avg_price: works.reduce((sum, w) => sum + (w.price || 0), 0) / works.length,
        artworks: works
      }))
      .filter(s => s.count >= min_count)
      .sort((a, b) => b.count - a.count);

    return c.json({
      style_segments: styleSegments.map(s => ({
        style: s.style,
        emoji: s.emoji,
        count: s.count,
        avg_price: Math.round(s.avg_price)
      })),
      total_styles: styleSegments.length,
      total_artworks: styleSegments.reduce((sum, s) => sum + s.count, 0),
      detailed_segments: styleSegments
    });

  } catch (error) {
    console.error('Style segmentation error:', error);
    return c.json({ error: 'Failed to segment by style' }, 500);
  }
});

/**
 * POST /api/graph-segmentation/by-geography
 * Segment by geographic origin
 * 
 * Geographic vectors:
 * - Based on artist jurisdiction
 * - Clusters: Western Europe, Eastern Europe, Asia, Americas, etc.
 */
app.post('/by-geography', async (c) => {
  const db = new ArtBankDB(c.env.DB);

  try {
    const nodes = await db.getAllNodes();
    const artworks = await db.getAllArtworks();
    
    // Build artist jurisdiction map
    const artistMap = new Map<string, string>();
    for (const node of nodes) {
      if (node.node_type === 'artist' && node.jurisdiction) {
        artistMap.set(node.id, node.jurisdiction);
      }
    }

    // Group artworks by region
    const regionMap = new Map<string, any[]>();
    
    for (const artwork of artworks) {
      const jurisdiction = artistMap.get(artwork.artist_node_id) || 'Unknown';
      const region = mapToRegion(jurisdiction);
      
      if (!regionMap.has(region)) {
        regionMap.set(region, []);
      }
      regionMap.get(region)!.push({
        id: artwork.id,
        title: artwork.title,
        artist_id: artwork.artist_node_id,
        jurisdiction,
        style: artwork.style,
        year: artwork.created_year
      });
    }

    // Convert to array
    const geographicSegments = Array.from(regionMap.entries())
      .map(([region, works]) => ({
        region,
        emoji: getRegionEmoji(region),
        count: works.length,
        jurisdictions: [...new Set(works.map(w => w.jurisdiction))].length,
        artworks: works
      }))
      .sort((a, b) => b.count - a.count);

    return c.json({
      geographic_segments: geographicSegments.map(s => ({
        region: s.region,
        emoji: s.emoji,
        count: s.count,
        jurisdictions_count: s.jurisdictions
      })),
      total_regions: geographicSegments.length,
      total_artworks: geographicSegments.reduce((sum, s) => sum + s.count, 0),
      detailed_segments: geographicSegments
    });

  } catch (error) {
    console.error('Geography segmentation error:', error);
    return c.json({ error: 'Failed to segment by geography' }, 500);
  }
});

/**
 * POST /api/graph-segmentation/multi-dimensional
 * Multi-dimensional segmentation combining all vectors
 * 
 * Creates compound segments: Style × Chronology × Geography
 */
app.post('/multi-dimensional', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { min_cluster_size = 2 } = await c.req.json();

  try {
    const nodes = await db.getAllNodes();
    const artworks = await db.getAllArtworks();
    
    // Build artist map
    const artistMap = new Map<string, { jurisdiction: string; name: string }>();
    for (const node of nodes) {
      if (node.node_type === 'artist') {
        artistMap.set(node.id, {
          jurisdiction: node.jurisdiction || 'Unknown',
          name: node.name
        });
      }
    }

    // Create multi-dimensional clusters
    const clusters = new Map<string, any[]>();
    
    for (const artwork of artworks) {
      const artist = artistMap.get(artwork.artist_node_id);
      const style = artwork.style || 'Unknown';
      const period = getTimePeriod(artwork.created_year);
      const region = mapToRegion(artist?.jurisdiction || 'Unknown');
      
      // Create compound key
      const clusterKey = `${style}|${period}|${region}`;
      
      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      clusters.get(clusterKey)!.push({
        id: artwork.id,
        title: artwork.title,
        artist: artist?.name || 'Unknown',
        year: artwork.created_year,
        price: artwork.current_fpc
      });
    }

    // Convert to array and filter
    const multiDimSegments = Array.from(clusters.entries())
      .map(([key, works]) => {
        const [style, period, region] = key.split('|');
        return {
          cluster_id: key,
          dimensions: { style, period, region },
          size: works.length,
          avg_price: works.reduce((sum, w) => sum + (w.price || 0), 0) / works.length,
          artworks: works
        };
      })
      .filter(c => c.size >= min_cluster_size)
      .sort((a, b) => b.size - a.size);

    return c.json({
      multi_dimensional_clusters: multiDimSegments.map(c => ({
        cluster_id: c.cluster_id,
        style: c.dimensions.style,
        period: c.dimensions.period,
        region: c.dimensions.region,
        size: c.size,
        avg_price: Math.round(c.avg_price)
      })),
      total_clusters: multiDimSegments.length,
      total_artworks: multiDimSegments.reduce((sum, c) => sum + c.size, 0),
      detailed_clusters: multiDimSegments
    });

  } catch (error) {
    console.error('Multi-dimensional segmentation error:', error);
    return c.json({ error: 'Failed to perform multi-dimensional segmentation' }, 500);
  }
});

// ========== HELPER FUNCTIONS ==========

function getTimePeriod(year: number | null): string {
  if (!year) return 'Unknown';
  if (year < 1800) return 'Ancient';
  if (year < 1945) return 'Modern';
  if (year < 2000) return 'Contemporary';
  return 'Current';
}

function mapToRegion(jurisdiction: string): string {
  const j = jurisdiction.toLowerCase();
  
  // Western Europe
  if (['uk', 'france', 'germany', 'italy', 'spain', 'netherlands', 'belgium', 'switzerland'].some(c => j.includes(c))) {
    return 'Western Europe';
  }
  
  // Eastern Europe
  if (['russia', 'poland', 'czech', 'ukraine', 'belarus', 'bulgaria', 'romania'].some(c => j.includes(c))) {
    return 'Eastern Europe';
  }
  
  // Asia
  if (['china', 'japan', 'korea', 'india', 'thailand', 'singapore'].some(c => j.includes(c))) {
    return 'Asia';
  }
  
  // Americas
  if (['usa', 'us', 'canada', 'mexico', 'brazil', 'argentina'].some(c => j.includes(c))) {
    return 'Americas';
  }
  
  // Middle East
  if (['uae', 'saudi', 'israel', 'turkey'].some(c => j.includes(c))) {
    return 'Middle East';
  }
  
  return 'Other';
}

function getStyleEmoji(style: string): string {
  const s = style.toLowerCase();
  if (s.includes('abstract')) return '🔶';
  if (s.includes('impression')) return '🌅';
  if (s.includes('express')) return '🎭';
  if (s.includes('realism')) return '📷';
  if (s.includes('surreal')) return '🌀';
  if (s.includes('cubis')) return '📦';
  if (s.includes('modern')) return '🎨';
  return '🖼️';
}

function getRegionEmoji(region: string): string {
  const r = region.toLowerCase();
  if (r.includes('western europe')) return '🇪🇺';
  if (r.includes('eastern europe')) return '🇷🇺';
  if (r.includes('asia')) return '🌏';
  if (r.includes('americas')) return '🌎';
  if (r.includes('middle east')) return '🕌';
  return '🌍';
}

export default app;
