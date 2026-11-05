import React from 'react';

interface ViewSkeletonProps {
  title?: string;
  cards?: number;
}

export const ViewSkeleton: React.FC<ViewSkeletonProps> = ({ cards = 3 }) => {
  return (
    <div className="space-y-4 py-2 animate-pulse" aria-busy="true" aria-label="Loading content">
      {/* Header Skeleton Card */}
      <div className="vision-surface rounded-3xl p-5 border border-white/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-2.5 w-24 bg-indigo-200/70 rounded-full" />
            <div className="h-5 w-48 bg-slate-200/90 rounded-xl" />
            <div className="h-3 w-64 bg-slate-200/60 rounded-lg" />
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-100/80 shrink-0" />
        </div>
      </div>

      {/* Content Skeleton Cards */}
      {Array.from({ length: cards }).map((_, idx) => (
        <div
          key={idx}
          className="vision-card rounded-3xl p-4 border border-white/80 shadow-xs space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-200/80 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-3/5 bg-slate-200/90 rounded-lg" />
              <div className="h-3 w-2/5 bg-slate-200/60 rounded-md" />
            </div>
            <div className="h-6 w-16 bg-slate-200/70 rounded-full" />
          </div>
          <div className="h-20 w-full bg-slate-100/90 rounded-2xl" />
        </div>
      ))}
    </div>
  );
};
