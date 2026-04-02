import React from 'react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { cn } from '../../utils/helpers'

// Жижиг Skeleton компонент
const Skeleton = ({ className }) => (
  <div className={cn("animate-pulse bg-white/5 rounded", className)} />
)

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-lg p-3 text-xs shadow-xl">
      <p className="text-text-primary font-500">{payload[0].name}</p>
      <p className="text-text-secondary font-mono mt-0.5">{payload[0].value}%</p>
    </div>
  )
}

export default function DeviceChart({ data, isLoading, title = 'Device Breakdown' }) {
  return (
    <Card glow>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {isLoading ? (
            <>
              {/* Donut Chart Skeleton */}
              <div className="relative w-[100px] h-[100px] flex items-center justify-center">
                <div className="w-[88px] h-[88px] rounded-full border-[12px] border-white/5 animate-pulse" />
              </div>

              {/* Legend List Skeleton */}
              <div className="flex-1 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="w-2 h-2 rounded-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <PieChart width={100} height={100}>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={44}
                  paddingAngle={3}
                  dataKey="value"
                  isAnimationActive={true}
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>

              <div className="flex-1 space-y-2">
                {data.map((d) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-xs text-text-secondary">{d.name}</span>
                    </div>
                    <span className="text-xs font-mono text-text-primary">{d.value}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
