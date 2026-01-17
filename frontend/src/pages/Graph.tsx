import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useNavigate } from 'react-router-dom';
import { fetchGraph } from '../api';

export default function Graph() {
  const navigate = useNavigate();
  const graphRef = useRef<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['graph'],
    queryFn: fetchGraph,
  });

  // Transform data for force-graph
  const graphData = data
    ? {
        nodes: data.nodes.map((n) => ({
          id: n.id,
          username: n.username,
          name: n.name,
          is_seed: n.is_seed,
          followers_count: n.followers_count,
          profile_image_url: n.profile_image_url,
        })),
        links: data.edges.map((e) => ({
          source: e.source,
          target: e.target,
        })),
      }
    : { nodes: [], links: [] };

  const handleNodeClick = useCallback(
    (node: any) => {
      navigate(`/accounts/${node.username}`);
    },
    [navigate]
  );

  // Zoom to fit on load
  useEffect(() => {
    if (graphRef.current && data) {
      setTimeout(() => {
        graphRef.current.zoomToFit(400, 50);
      }, 500);
    }
  }, [data]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.username;
    const fontSize = 12 / globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;
    
    // Node size based on followers
    const size = Math.max(4, Math.min(20, Math.log10(node.followers_count + 1) * 4));
    
    // Node color
    const color = node.is_seed ? '#9333ea' : '#3b82f6';
    
    // Draw node
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Draw border for seeds
    if (node.is_seed) {
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }
    
    // Draw label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(`@${label}`, node.x, node.y + size + fontSize);
  }, []);

  if (isLoading) {
    return <div className="text-gray-400">Loading graph...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Network Graph</h1>
          <p className="text-gray-400 mt-1">
            {data?.nodes.length || 0} accounts, {data?.edges.length || 0} connections
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-purple-600" />
            <span className="text-gray-400">Seed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500" />
            <span className="text-gray-400">Discovered</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden" style={{ height: '70vh' }}>
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeId="id"
          nodeLabel={(node: any) => `@${node.username}\n${node.followers_count.toLocaleString()} followers`}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            const size = Math.max(4, Math.min(20, Math.log10(node.followers_count + 1) * 4));
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkColor={() => '#374151'}
          linkWidth={1}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          onNodeClick={handleNodeClick}
          backgroundColor="#030712"
          cooldownTicks={100}
        />
      </div>

      <p className="text-gray-500 text-sm text-center">
        Click on a node to view account details. Drag to pan, scroll to zoom.
      </p>
    </div>
  );
}
