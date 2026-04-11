import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase-client';
import { LogOut, BadgeCheck } from 'lucide-react';

interface AdminLibraryProps {
  onViewCultural: (record: any) => void;
  onViewVisual: (record: any) => void;
  onLogout: () => void;
}

interface SearchRecord {
  id: string;
  brand?: string;
  audience?: string;
  topicFocus?: string;
  created_at?: string;
  results?: any;
}

interface DeepDiveRecord {
  id: string;
  context?: string;
  analysisObjective?: string;
  created_at?: string;
  report?: any;
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString();
};

const AdminLibrary: React.FC<AdminLibraryProps> = ({ onViewCultural, onViewVisual, onLogout }) => {
  const [culturalReports, setCulturalReports] = useState<SearchRecord[]>([]);
  const [visualReports, setVisualReports] = useState<DeepDiveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      supabase
        .from('searches')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('brand_deep_dives')
        .select('*')
        .order('created_at', { ascending: false }),
    ])
      .then(([culturalRes, visualRes]) => {
        if (culturalRes.error || visualRes.error) throw culturalRes.error || visualRes.error;
        setCulturalReports(culturalRes.data || []);
        setVisualReports(visualRes.data || []);
      })
      .catch((e) => setError(e.message || 'Failed to fetch reports'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900 font-sans flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-6xl flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Admin Library</h1>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
        >
          <LogOut className="w-4 h-4" /> Logout / Exit Admin
        </button>
      </div>
      {error && <div className="text-red-500 mb-6">{error}</div>}
      {loading ? (
        <div className="text-zinc-500">Loading reports...</div>
      ) : (
        <div className="w-full max-w-6xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {culturalReports.map((rec) => (
            <button
              key={`cultural-${rec.id}`}
              onClick={() => onViewCultural(rec)}
              className="bg-white border border-zinc-200 rounded-2xl shadow-sm hover:shadow-md transition-all p-6 flex flex-col items-start text-left group"
            >
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-3">
                <BadgeCheck className="w-4 h-4" /> Cultural Report
              </span>
              <div className="font-bold text-lg mb-1 truncate w-full">{rec.brand || 'General Brand'}</div>
              <div className="text-sm text-zinc-500 mb-2 truncate w-full">Audience: {rec.audience || 'N/A'}</div>
              {rec.topicFocus && (
                <div className="text-xs text-zinc-400 mb-2 truncate w-full">Topic: {rec.topicFocus}</div>
              )}
              <div className="text-xs text-zinc-400 mt-auto">{formatDate(rec.created_at)}</div>
            </button>
          ))}
          {visualReports.map((rec) => (
            <button
              key={`visual-${rec.id}`}
              onClick={() => onViewVisual(rec)}
              className="bg-white border border-zinc-200 rounded-2xl shadow-sm hover:shadow-md transition-all p-6 flex flex-col items-start text-left group"
            >
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-50 text-fuchsia-700 text-xs font-semibold mb-3">
                <BadgeCheck className="w-4 h-4" /> Visual Excavator
              </span>
              <div className="font-bold text-lg mb-1 truncate w-full">{rec.context || 'General Context'}</div>
              <div className="text-sm text-zinc-500 mb-2 truncate w-full">Objective: {rec.analysisObjective || 'N/A'}</div>
              <div className="text-xs text-zinc-400 mt-auto">{formatDate(rec.created_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminLibrary;
