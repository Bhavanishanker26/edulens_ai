import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';

const MindMapGenerator = ({ content, title }) => {
  const [mindMapData, setMindMapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const svgRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current?.parentElement) {
        const { width, height } = svgRef.current.parentElement.getBoundingClientRect();
        setDimensions({ width: width - 40, height: Math.max(500, height - 100) });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const generateMindMap = async () => {
    if (!content || content.length < 50) {
      alert('Please upload a document with more content first');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/generate-mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content })
      });
      
      if (!response.ok) throw new Error('Failed to generate mind map');
      
      const data = await response.json();
      setMindMapData(transformToD3Format(data));
    } catch (error) {
      console.error('Error:', error);
      setMindMapData({
        name: title || "Topic",
        children: [
          { name: "Key Concept 1", children: [] },
          { name: "Key Concept 2", children: [] },
          { name: "Key Concept 3", children: [] }
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  const transformToD3Format = (apiData) => {
    if (!apiData?.nodes) return { name: apiData?.central || "Topic", children: [] };
    
    const root = { name: apiData.central, children: [], id: 'central', level: 0 };
    const nodeMap = { 'central': root };
    
    const sortedNodes = [...apiData.nodes].sort((a, b) => a.level - b.level);
    
    sortedNodes.forEach(node => {
      const nodeData = { name: node.label, children: [], id: node.id, level: node.level };
      nodeMap[node.id] = nodeData;
      
      if (node.parent === 'central') {
        root.children.push(nodeData);
      } else if (nodeMap[node.parent]) {
        nodeMap[node.parent].children = nodeMap[node.parent].children || [];
        nodeMap[node.parent].children.push(nodeData);
      }
    });
    
    return root;
  };

  useEffect(() => {
    if (!mindMapData || !svgRef.current) return;

    const { width, height } = dimensions;
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [-width / 2, -height / 2, width, height]);

    const g = svg.append("g");

    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);

    const treeLayout = d3.tree()
      .size([2 * Math.PI, Math.min(width, height) / 2 - 100])
      .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);

    const root = d3.hierarchy(mindMapData);
    treeLayout(root);

    const colorScale = d3.scaleOrdinal()
      .domain([0, 1, 2, 3])
      .range(['#f472b6', '#60a5fa', '#a78bfa', '#34d399']);

    g.selectAll(".link")
      .data(root.links())
      .enter()
      .append("path")
      .attr("d", d3.linkRadial().angle(d => d.x).radius(d => d.y))
      .attr("fill", "none")
      .attr("stroke", d => colorScale(d.target.depth))
      .attr("stroke-width", d => Math.max(1, 4 - d.target.depth))
      .attr("stroke-opacity", 0.4);

    const nodes = g.selectAll(".node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("transform", d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`)
      .style("cursor", "pointer")
      .on("click", (event, d) => setSelectedNode(d));

    nodes.append("circle")
      .attr("r", d => d.depth === 0 ? 35 : Math.max(8, 20 - d.depth * 4))
      .attr("fill", d => d.depth === 0 ? '#f472b6' : colorScale(d.depth))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .style("filter", "drop-shadow(0 0 8px currentColor)");

    nodes.append("text")
      .attr("dy", "0.35em")
      .attr("x", d => d.depth === 0 ? 0 : 15)
      .attr("text-anchor", d => d.depth === 0 ? "middle" : "start")
      .attr("transform", d => d.x >= Math.PI ? "rotate(180)" : null)
      .text(d => d.data.name.length > 25 ? d.data.name.substring(0, 22) + '...' : d.data.name)
      .attr("fill", "#fff")
      .attr("font-size", d => d.depth === 0 ? "14px" : `${Math.max(10, 13 - d.depth)}px`)
      .attr("font-weight", d => d.depth <= 1 ? "600" : "400")
      .style("text-shadow", "0 1px 3px rgba(0,0,0,0.8)");
  }, [mindMapData, dimensions]);

  if (!mindMapData) {
    return (
      <div className="h-[600px] bg-slate-900/50 rounded-2xl border border-white/10 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">🗺️</div>
        <h3 className="text-xl font-bold text-white mb-2">AI Mind Map</h3>
        <p className="text-white/50 text-center mb-6 max-w-md">Transform your study materials into an interactive visual knowledge structure</p>
        <button onClick={generateMindMap} disabled={loading} className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white font-semibold shadow-lg disabled:opacity-50">
          {loading ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block mr-2" />Generating...</> : 'Generate Mind Map'}
        </button>
      </div>
    );
  }

  return (
    <div className="h-[600px] bg-slate-900/50 rounded-2xl border border-white/10 p-6 relative">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">{mindMapData.name}</h3>
        <button onClick={() => setMindMapData(null)} className="px-4 py-2 bg-white/10 rounded-lg text-white text-sm hover:bg-white/20">Regenerate</button>
      </div>
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      
      {selectedNode && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute bottom-4 right-4 bg-slate-800/90 backdrop-blur-xl p-4 rounded-xl border border-white/10 max-w-xs">
          <h4 className="text-white font-bold mb-1">{selectedNode.data.name}</h4>
          <p className="text-white/50 text-sm">Level {selectedNode.depth}</p>
        </motion.div>
      )}
    </div>
  );
};

export default MindMapGenerator;