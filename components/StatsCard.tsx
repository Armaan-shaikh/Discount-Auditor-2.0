
import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, subtitle, icon, trend, color = 'blue' }) => {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 text-blue-400',
    red: 'border-red-500 text-red-400',
    green: 'border-green-500 text-green-400',
    yellow: 'border-yellow-500 text-yellow-400',
  };

  return (
    <div className={`bg-slate-800/50 border-l-4 p-5 rounded-lg shadow-lg ${colorMap[color] || colorMap.blue}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-bold mt-1 text-white">{value}</h3>
          {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className="bg-slate-700/50 p-2 rounded-md">
          {icon}
        </div>
      </div>
    </div>
  );
};
