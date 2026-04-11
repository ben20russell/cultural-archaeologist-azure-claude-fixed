import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase-client';

interface AdminDashboardProps {
  onBack: () => void;
}

export default function AdminDashboard({ onBack }: AdminDashboardProps) {
  const [culturalReports, setCulturalReports] = useState<any[]>([]);
  const [visualReports, setVisualReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const fetchData = async () => {
      try {
        const { data: cultural, error: err1 } = await supabase
          .from('searches')
          .select('*')
          .order('created_at', { ascending: false });
        const { data: visual, error: err2 } = await supabase
          .from('brand_deep_dives')
          .select('*')
          .order('created_at', { ascending: false });
        if (err1 || err2) throw err1 || err2;
        setCulturalReports(cultural || []);
        setVisualReports(visual || []);
      } catch (e: any) {
        setError(e.message || 'Failed to fetch reports');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Merge all reports into one array with a type
  const allReports = [
    ...culturalReports.map((r) => ({ ...r, _type: 'cultural' })),
    ...visualReports.map((r) => ({ ...r, _type: 'visual' })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="min-h-screen bg-[#FAFAFA] py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">Master Admin Library</h1>
          <button
            className="px-4 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-700 font-medium hover:bg-zinc-50"
            onClick={onBack}
          >
            Back to App
          </button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
          {loading ? (
            <div className="text-center text-zinc-400 py-8">Loading...</div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">{error}</div>
          ) : allReports.length === 0 ? (
            <div className="text-center text-zinc-400 py-8">No reports found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allReports.map((row) => {
                const date = new Date(row.created_at).toLocaleString();
                const brand = row.brands
                  ? Array.isArray(row.brands)
                    ? row.brands.map((b: any) => b.name).join(', ')
                    : row.brands
                  : row.brand || row.brandName || '-';
                const audience = row.targetAudience || row.audience || '-';
                const focus = row.analysisObjective || row.topicFocus || row.focus || '-';
                return (
                  <div
                    key={row.id}
                    className="bg-[#FAFAFA] border border-zinc-200 rounded-2xl p-6 flex flex-col gap-2 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${row._type === 'cultural' ? 'bg-indigo-100 text-indigo-700' : 'bg-fuchsia-100 text-fuchsia-700'}`}>{row._type === 'cultural' ? 'Cultural Report' : 'Visual Deep Dive'}</span>
                      <span className="text-zinc-400 text-xs">{date}</span>
                    </div>
                    <div className="font-bold text-lg text-zinc-900 truncate">{brand}</div>
                    <div className="text-zinc-600 text-sm truncate">Audience: {audience}</div>
                    <div className="text-zinc-600 text-sm truncate">Focus: {focus}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
