import { useState } from 'react';
import { Search, RotateCcw } from 'lucide-react';

interface SearchFilterProps {
  onSearch: (filters: SearchFilters) => void;
  onReset: () => void;
  loading?: boolean;
}

export interface SearchFilters {
  jobInterviewId: string;
  panelName: string;
  candidateName: string;
}

export function SearchFilter({ onSearch, onReset, loading = false }: SearchFilterProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    jobInterviewId: '',
    panelName: '',
    candidateName: ''
  });

  const handleInputChange = (field: keyof SearchFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = () => {
    onSearch(filters);
  };

  const handleReset = () => {
    setFilters({
      jobInterviewId: '',
      panelName: '',
      candidateName: ''
    });
    onReset();
  };

  const hasActiveFilters = filters.jobInterviewId || filters.panelName || filters.candidateName;

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-6">Search & Filter Evaluations</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Job Interview ID Filter */}
        <div>
          <label htmlFor="job-id" className="block text-sm font-semibold text-slate-300 mb-2">
            Job Interview ID
          </label>
          <input
            id="job-id"
            type="text"
            placeholder="e.g., JD12778"
            value={filters.jobInterviewId}
            onChange={(e) => handleInputChange('jobInterviewId', e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent transition-all backdrop-blur-sm"
          />
        </div>

        {/* Panel Name Filter */}
        <div>
          <label htmlFor="panel-name" className="block text-sm font-semibold text-slate-300 mb-2">
            Panel Name
          </label>
          <input
            id="panel-name"
            type="text"
            placeholder="e.g., Rakesh Kanna"
            value={filters.panelName}
            onChange={(e) => handleInputChange('panelName', e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent transition-all backdrop-blur-sm"
          />
        </div>

        {/* Candidate Name Filter */}
        <div>
          <label htmlFor="candidate-name" className="block text-sm font-semibold text-slate-300 mb-2">
            Candidate Name
          </label>
          <input
            id="candidate-name"
            type="text"
            placeholder="e.g., Arun Kumar"
            value={filters.candidateName}
            onChange={(e) => handleInputChange('candidateName', e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent transition-all backdrop-blur-sm"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleSearch}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
        >
          <Search size={18} />
          Search
        </button>

        <button
          onClick={handleReset}
          disabled={loading || !hasActiveFilters}
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-700/50 border border-slate-600/50 text-slate-300 hover:text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:border-slate-500/70 backdrop-blur-sm"
        >
          <RotateCcw size={18} />
          Reset
        </button>

        {hasActiveFilters && (
          <div className="ml-auto flex items-center text-sm text-orange-400">
            <span className="inline-block w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
            Filters active
          </div>
        )}
      </div>
    </div>
  );
}
