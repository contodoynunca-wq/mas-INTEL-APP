import React from 'react';

interface StaticUKMapProps {
  markers?: { lat: number; lng: number; title?: string; color?: string }[];
  className?: string;
}

const StaticUKMap: React.FC<StaticUKMapProps> = ({ markers = [], className = '' }) => {
  // Simplified UK outline path (approximate)
  const ukPath = "M250,550 L230,540 L220,560 L200,550 L180,580 L160,600 L140,580 L120,600 L100,580 L80,600 L60,580 L40,600 L20,580 L40,550 L60,520 L80,500 L100,480 L120,450 L140,420 L160,400 L180,380 L200,350 L220,320 L240,300 L260,280 L280,250 L300,220 L320,200 L340,180 L360,150 L380,120 L400,100 L420,80 L440,60, L460,80 L480,100 L500,120 L480,150 L460,180 L440,200 L420,220 L400,250 L380,280 L360,300 L340,320 L320,350 L300,380 L280,400 L260,420 L240,450 L220,480 L200,500 L220,520 L240,540 Z";
  
  // A very rough approximation of UK coordinates to SVG space
  // This is a placeholder. For a real app, we'd use a proper GeoJSON or detailed SVG.
  // We'll use a simple box for now to represent the map area if we can't get a good path.
  
  // Actually, let's use a simple abstract representation since I can't paste a massive SVG path here.
  // We will draw a "Map" background and plot points relative to a bounding box.
  // UK Bounding Box approx: Lat 50-59, Lng -8 to 2
  
  const minLat = 49.5;
  const maxLat = 59.5;
  const minLng = -8.5;
  const maxLng = 2.5;
  
  const width = 800;
  const height = 1000;
  
  const getX = (lng: number) => {
    return ((lng - minLng) / (maxLng - minLng)) * width;
  };
  
  const getY = (lat: number) => {
    return height - ((lat - minLat) / (maxLat - minLat)) * height;
  };

  return (
    <div className={`relative bg-slate-900 rounded-lg overflow-hidden border border-slate-700 ${className}`} style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full opacity-50 absolute inset-0 preserve-3d">
        {/* Abstract UK Shape - simplified for visual context */}
        <path 
          d="M240,900 L560,900 L640,750 L700,550 L600,400 L640,200 L560,50 L400,0 L300,200 L200,450 L160,700 Z" 
          fill="#1e293b" 
          stroke="#334155" 
          strokeWidth="2" 
        />
        {/* Grid lines for tech feel */}
        <line x1="0" y1="200" x2={width} y2="200" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1="0" y1="400" x2={width} y2="400" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1="0" y1="600" x2={width} y2="600" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1="0" y1="800" x2={width} y2="800" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
        
        <line x1="200" y1="0" x2="200" y2={height} stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1="400" y1="0" x2="400" y2={height} stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1="600" y1="0" x2="600" y2={height} stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
      </svg>
      
      {/* Markers */}
      <div className="absolute inset-0 pointer-events-none">
        {markers.map((marker, i) => {
          // If lat/lng are 0 or missing, don't render
          if (!marker.lat || !marker.lng || marker.lat === 0 || marker.lng === 0) return null;

          const x = getX(marker.lng);
          const y = getY(marker.lat);
          
          // Skip if out of bounds
          if (x < 0 || x > width || y < 0 || y > height) return null;
          
          return (
            <div 
              key={i}
              className="absolute w-2.5 h-2.5 rounded-full transform -translate-x-1/2 -translate-y-1/2 hover:scale-150 transition-transform cursor-pointer pointer-events-auto"
              style={{ 
                left: `${(x / width) * 100}%`, 
                top: `${(y / height) * 100}%`,
                backgroundColor: marker.color || '#3b82f6',
                boxShadow: `0 0 6px ${marker.color || '#3b82f6'}`
              }}
              title={marker.title}
            />
          );
        })}
      </div>
      
      <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono">
        STATIC MAP VIEW
      </div>
    </div>
  );
};

export default StaticUKMap;
