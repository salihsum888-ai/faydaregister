import { Card, CardContent } from '@/components/ui/card';
import { DashboardStats } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StatsCardsProps {
  stats: DashboardStats;
  showOfficerCount?: boolean;
  activeFilter?: string | null;
  onSelectFilter?: (filterKey: string | null) => void;
}

export function StatsCards({
  stats,
  showOfficerCount = false,
  activeFilter = null,
  onSelectFilter,
}: StatsCardsProps) {
  const actualRecordsSum =
    stats.processed + stats.processing + stats.failed + stats.rejected;
  const totalRecords = Math.max(actualRecordsSum, 1);
  const totalPersonnel = Math.max(stats.totalOfficers, 1);
  const instRecords = stats.institutionRecordsCount || 0;
  const instCount = stats.institutionsCount || 0;

  const calcExactRate = (count: number, total: number) => {
    if (total <= 0 || count <= 0) return 0;
    return Number(((count / total) * 100).toFixed(2));
  };

  const processedRate = calcExactRate(stats.processed, actualRecordsSum);
  const processingRate = calcExactRate(stats.processing, actualRecordsSum);
  const failedRate = calcExactRate(stats.failed, actualRecordsSum);
  const rejectedRate = calcExactRate(stats.rejected, actualRecordsSum);
  const instRate = calcExactRate(instRecords, actualRecordsSum);
  const onDutyRate = calcExactRate(stats.onDutyOfficers, stats.totalOfficers);

  const allItems = [
    {
      id: 'personnel',
      filterKey: null as string | null,
      label: 'Personnel Total',
      unit: 'Bureau',
      value: stats.totalOfficers,
      pct: 100,
      deltaText: `${stats.totalOfficers}`,
      subText: 'registered staff',
      isPositive: true,
      strokeColor: '#4f46e5',
      fillId: 'grad-indigo',
      adminOnly: true,
      curvePath: 'M 4 38 C 18 42, 26 24, 38 28 C 50 32, 58 14, 70 14 C 82 14, 92 22, 106 16',
      peakX: 70,
      peakY: 14,
    },
    {
      id: 'onduty',
      filterKey: null as string | null,
      label: 'On-Duty Status',
      unit: 'Live',
      value: stats.onDutyOfficers,
      pct: onDutyRate,
      deltaText: `${onDutyRate}%`,
      subText: `${stats.onDutyOfficers}/${stats.totalOfficers} active`,
      isPositive: true,
      strokeColor: '#10b981',
      fillId: 'grad-emerald',
      adminOnly: true,
      curvePath: 'M 4 36 C 20 38, 28 22, 42 26 C 54 30, 64 15, 76 15 C 88 15, 96 20, 106 12',
      peakX: 76,
      peakY: 15,
    },
    {
      id: 'intake',
      filterKey: 'ALL',
      label: 'Intake Total',
      unit: 'Records',
      value: stats.total,
      pct: 100,
      deltaText: `${actualRecordsSum.toLocaleString()}`,
      subText: 'tracked RIDs',
      isPositive: true,
      strokeColor: '#3b82f6',
      fillId: 'grad-blue',
      adminOnly: false,
      curvePath: 'M 4 38 C 18 42, 26 24, 38 28 C 50 32, 58 14, 70 14 C 82 14, 92 22, 106 16',
      peakX: 70,
      peakY: 14,
    },
    {
      id: 'institutions',
      filterKey: 'INSTITUTIONS',
      label: 'Institutions',
      unit: `${instCount} Active`,
      value: instRecords,
      pct: instRate,
      deltaText: `${instRate}%`,
      subText: `of ${actualRecordsSum} records`,
      isPositive: true,
      strokeColor: '#8b5cf6',
      fillId: 'grad-violet',
      adminOnly: false,
      curvePath: 'M 4 36 C 18 34, 28 22, 42 25 C 56 28, 64 12, 76 14 C 88 16, 96 18, 106 12',
      peakX: 76,
      peakY: 14,
    },
    {
      id: 'processed',
      filterKey: 'Processed',
      label: 'Processed',
      unit: 'Success',
      value: stats.processed,
      pct: processedRate,
      deltaText: `${processedRate}%`,
      subText: `${stats.processed}/${actualRecordsSum} verified`,
      isPositive: true,
      strokeColor: '#0ea5e9',
      fillId: 'grad-cyan',
      adminOnly: false,
      curvePath: 'M 4 35 C 18 40, 28 24, 42 27 C 56 30, 64 14, 76 14 C 88 14, 96 20, 106 15',
      peakX: 76,
      peakY: 14,
    },
    {
      id: 'processing',
      filterKey: 'Processing',
      label: 'Processing',
      unit: 'Active',
      value: stats.processing,
      pct: processingRate,
      deltaText: `${processingRate}%`,
      subText: `${stats.processing}/${actualRecordsSum} in queue`,
      isPositive: true,
      strokeColor: '#f59e0b',
      fillId: 'grad-amber',
      adminOnly: false,
      curvePath: 'M 4 14 C 18 20, 28 10, 40 12 C 52 14, 58 28, 68 24 C 78 20, 90 36, 106 28',
      peakX: 68,
      peakY: 24,
    },
    {
      id: 'failed',
      filterKey: 'Failed',
      label: 'Failed',
      unit: 'Queue',
      value: stats.failed,
      pct: failedRate,
      deltaText: `${failedRate}%`,
      subText: `${stats.failed}/${actualRecordsSum} failed`,
      isPositive: false,
      strokeColor: '#f43f5e',
      fillId: 'grad-rose',
      adminOnly: false,
      curvePath: 'M 4 16 C 18 22, 28 12, 40 16 C 52 20, 58 28, 70 24 C 82 20, 92 34, 106 30',
      peakX: 70,
      peakY: 24,
    },
    {
      id: 'rejected',
      filterKey: 'Rejected',
      label: 'Rejected',
      unit: 'Queue',
      value: stats.rejected,
      pct: rejectedRate,
      deltaText: `${rejectedRate}%`,
      subText: `${stats.rejected}/${actualRecordsSum} rejected`,
      isPositive: false,
      strokeColor: '#ef4444',
      fillId: 'grad-red',
      adminOnly: false,
      curvePath: 'M 4 20 C 18 14, 28 26, 42 22 C 56 18, 64 28, 74 24 C 86 20, 94 34, 106 32',
      peakX: 74,
      peakY: 24,
    },
  ];

  const filteredItems = allItems.filter((item) => {
    if (item.adminOnly && !showOfficerCount) return false;
    return true;
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {filteredItems.map((item) => {
        const isClickable = Boolean(onSelectFilter && item.filterKey);
        const isSelected =
          isClickable &&
          ((item.filterKey === 'ALL' && !activeFilter) ||
            (item.filterKey !== 'ALL' && activeFilter === item.filterKey));

        return (
          <Card
            key={item.label}
            onClick={() => {
              if (!onSelectFilter || !item.filterKey) return;
              if (item.filterKey === 'ALL' || activeFilter === item.filterKey) {
                onSelectFilter(null);
              } else {
                onSelectFilter(item.filterKey);
              }
            }}
            className={cn(
              'rounded-[22px] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group relative',
              isClickable && 'cursor-pointer',
              isSelected &&
                item.filterKey !== 'ALL' &&
                'ring-2 ring-primary shadow-[0_12px_32px_-8px_rgba(37,99,235,0.28)]'
            )}
          >
            {/* Ambient Corner Color Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-15 dark:opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-30"
              style={{ backgroundColor: item.strokeColor }}
            />
            <CardContent className="p-6 relative z-10">
              {/* Top Header: Title / Unit */}
              <div className="flex items-center justify-between mb-5">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: item.strokeColor,
                      boxShadow: `0 0 10px ${item.strokeColor}`,
                    }}
                  />
                  <span>{item.label}</span>
                  <span className="font-normal text-slate-400 dark:text-slate-500">
                    / {item.unit}
                  </span>
                </p>
                <span
                  className={cn(
                    'text-[10px] font-mono font-bold px-2 py-0.5 rounded-md backdrop-blur-md border tabular-nums',
                    isSelected && item.filterKey !== 'ALL'
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white/55 dark:bg-white/[0.06] border-white/75 dark:border-white/10 text-slate-700 dark:text-slate-200'
                  )}
                >
                  {isSelected && item.filterKey !== 'ALL' ? 'Filtered' : `${item.pct}%`}
                </span>
              </div>

              {/* Bottom Split: Value + Trend on Left, Glassy Smooth Area Sparkline on Right */}
              <div className="flex items-end justify-between gap-3">
                <div className="space-y-3">
                  <div className="text-[30px] font-bold tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
                    {item.value.toLocaleString()}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center h-4 w-4 rounded-[5px] border backdrop-blur-sm',
                        item.isPositive
                          ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                          : 'border-rose-500/40 text-rose-500 dark:text-rose-400 bg-rose-500/10'
                      )}
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5 fill-none stroke-current"
                        strokeWidth="1.6"
                      >
                        {item.isPositive ? (
                          <path
                            d="M1.5 8.5L4.5 5.5L7 7.5L10.5 3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : (
                          <path
                            d="M1.5 3.5L4.5 6.5L7 4.5L10.5 8.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </svg>
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-semibold tabular-nums',
                        item.isPositive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-500 dark:text-rose-400'
                      )}
                    >
                      {item.deltaText}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      {item.subText}
                    </span>
                  </div>
                </div>

                {/* Glassy Sparkline Chart Container with Luminous Gradient Area + Peak Point */}
                <div className="glass-chart-surface w-[122px] h-[60px] px-2 py-1.5 rounded-xl shrink-0 relative flex items-center justify-center">
                  <svg viewBox="0 0 110 52" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id={item.fillId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={item.strokeColor} stopOpacity="0.42" />
                        <stop offset="55%" stopColor={item.strokeColor} stopOpacity="0.14" />
                        <stop offset="100%" stopColor={item.strokeColor} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <line
                      x1="4"
                      y1="26"
                      x2="106"
                      y2="26"
                      stroke="currentColor"
                      strokeDasharray="2 3"
                      className="text-slate-400/25 dark:text-slate-500/25"
                    />
                    <path
                      d={`${item.curvePath} L 106 50 L 4 50 Z`}
                      fill={`url(#${item.fillId})`}
                    />
                    <path
                      d={item.curvePath}
                      fill="none"
                      stroke={item.strokeColor}
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 3px 6px ${item.strokeColor}55)` }}
                    />
                    <circle
                      cx={item.peakX}
                      cy={item.peakY}
                      r="5.5"
                      fill={item.strokeColor}
                      fillOpacity="0.2"
                    />
                    <circle
                      cx={item.peakX}
                      cy={item.peakY}
                      r="3"
                      fill={item.strokeColor}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
