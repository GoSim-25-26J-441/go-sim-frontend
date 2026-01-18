"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchDesignsList } from '@/app/api/asm/routes';
import {
  BarChart3,
  Cpu,
  MemoryStick,
  CheckCircle,
  CalendarDays,
  Clock,
  ArrowRight,
  FileText,
  Circle,
  ChevronRight
} from 'lucide-react';

interface Design {
  id: string;
  requestNumber: number;
  workload: number;
  preferred_vcpu: number;
  preferred_memory_gb: number;
  created_at: string;
  best_candidate: {
    candidate: {
      spec: { vcpu: number; memory_gb: number }
    };
    workload_distance: number;
  };
  all_candidates: any[];
}

interface ApiResponseRow {
  id: string;
  created_at: string;
  request: {
    design: {
      workload: { concurrent_users: number };
      preferred_vcpu: number;
      preferred_memory_gb: number;
    };
  };
  best_candidate: any;
  response: any[];
}

export default function CostPage() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const userId = "user-100";

  useEffect(() => {
    fetchDesigns();
  }, []);

  const fetchDesigns = async () => {
    try {
      setLoading(true);
      const data = await fetchDesignsList(userId);
      const designList: Design[] = data.rows.map((row, index) => ({
        id: row.id,
        requestNumber: index + 1,
        workload: row.request.design.workload.concurrent_users,
        preferred_vcpu: row.request.design.preferred_vcpu,
        preferred_memory_gb: row.request.design.preferred_memory_gb,
        created_at: new Date(row.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        best_candidate: row.best_candidate,
        all_candidates: row.response || []
      }));

      setDesigns(designList);
    } catch (err) {
      console.error('Error fetching designs:', err);
      const fallbackData: Design[] = [
        {
          id: "0610bab4-a1a6-4ab2-9314-2e54caa1d126",
          requestNumber: 1,
          workload: 2000,
          preferred_vcpu: 5,
          preferred_memory_gb: 24,
          created_at: "Dec 4, 2025, 22:43",
          best_candidate: {
            candidate: {
              spec: { vcpu: 16, memory_gb: 64 }
            },
            workload_distance: 100
          },
          all_candidates: []
        },
        {
          id: "1e9a8484-958b-42a6-99c0-1e671a21eed6",
          requestNumber: 2,
          workload: 2000,
          preferred_vcpu: 8,
          preferred_memory_gb: 16,
          created_at: "Dec 4, 2025, 22:18",
          best_candidate: {
            candidate: {
              spec: { vcpu: 4, memory_gb: 8 }
            },
            workload_distance: 100
          },
          all_candidates: []
        }
      ];
      setDesigns(fallbackData);
    } finally {
      setLoading(false);
    }
  };

  const handleDesignClick = (design: Design) => {
    router.push(`/cost/${design.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-400 mb-4"></div>
            <p className="text-gray-300 text-lg">Loading designs...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header Section */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold">Cost Analysis</h1>
              <p className="text-gray-500 mt-2">Select a design to view detailed cost breakdown</p>
            </div>
            <Link
              href="/cost/suggest"
              className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium border border-gray-700 flex items-center gap-2"
            >
              <BarChart3 className="w-5 h-5" />
              Metrices Analysis
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Designs Grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Designs</h2>
          </div>

          {designs.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-800 rounded-2xl bg-black/50">
              <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-3">No designs found</h3>
              <p className="text-gray-600 max-w-md mx-auto">Create a new design to start analyzing infrastructure costs and performance metrics.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {designs.map((design) => (
                <div
                  key={design.id}
                  className="group bg-black border border-gray-800 rounded-xl p-6 hover:border-gray-700 cursor-pointer transition-all duration-300 hover:scale-[1.02]"
                  onClick={() => handleDesignClick(design)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Circle className="w-3 h-3 text-gray-700" fill="currentColor" />
                        <span className="text-xs text-gray-500">#{design.requestNumber}</span>
                      </div>
                      <h3 className="text-lg font-semibold group-hover:text-white transition-colors">
                        {design.workload.toLocaleString()} Users Workload
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-gray-900 text-gray-300 border border-gray-800">
                        ID: {design.id.substring(0, 8)}...
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          Created
                        </p>
                        <p className="text-sm text-gray-300">
                          {new Date(design.created_at).toLocaleDateString("en-US", {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-900/50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-2">Preferred Spec</p>
                        <div className="flex items-center gap-2 mb-1">
                          <Cpu className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{design.preferred_vcpu} vCPU</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MemoryStick className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{design.preferred_memory_gb} GB RAM</span>
                        </div>
                      </div>

                      {design.best_candidate && (
                        <div className="bg-gray-900/50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-2">Recommended</p>
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <span className="font-medium">
                              {design.best_candidate.candidate.spec.vcpu} vCPU
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <span className="font-medium">
                              {design.best_candidate.candidate.spec.memory_gb} GB RAM
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-gray-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Click to view cost analysis</span>
                        <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-12 pt-6 border-t border-gray-800">
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Showing {designs.length} design{designs.length !== 1 ? 's' : ''} • Data refreshes automatically
            </p>
            <p className="text-xs text-gray-700 mt-2">
              Select any design to analyze cloud provider costs, compare pricing options, and optimize your infrastructure
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}