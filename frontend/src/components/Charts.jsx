import { useId } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compact, number } from '../lib/format';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><span>{label}</span>{payload.map((item) => <strong key={item.dataKey}><i style={{ background: item.color || item.payload.color || '#8B5CF6' }} />{number(item.value)}<small>{item.dataKey === 'tokens' ? 'tokens' : 'executions'}</small></strong>)}</div>;
}

export function VolumeChart({ data, dataKey = 'executions', label = 'Hourly execution volume', height = 205 }) {
  const gradientId = `chart-fill-${useId().replaceAll(':', '')}`;
  const reducedMotion = useReducedMotion();
  return <div className="chart-container volume-chart" style={{ height }} role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={data} margin={{ top: 12, right: 7, bottom: 0, left: -12 }} accessibilityLayer>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.25} /><stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.005} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 4" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} minTickGap={35} tickMargin={13} height={36} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} tickFormatter={compact} tickCount={5} width={46} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 4', strokeOpacity: 0.5 }} />
        <Area type="monotone" dataKey={dataKey} stroke="#9B78FA" strokeWidth={2.3} fill={`url(#${gradientId})`} activeDot={{ r: 5, fill: '#9B78FA', stroke: 'var(--panel)', strokeWidth: 3 }} isAnimationActive={!reducedMotion} animationDuration={300} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

export function DistributionChart({ data, dataKey = 'value', height = 188, horizontal = false }) {
  const reducedMotion = useReducedMotion();
  return <div className="chart-container distribution-chart" style={{ height }} role="img" aria-label={data.map((item) => `${item.name}: ${number(item[dataKey])}`).join(', ')}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 18, right: 10, left: horizontal ? 0 : -14, bottom: 0 }} barSize={horizontal ? 22 : 38} accessibilityLayer>
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke="var(--chart-grid)" strokeDasharray="3 4" />
        <XAxis type={horizontal ? 'number' : 'category'} dataKey={horizontal ? undefined : 'name'} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} tickFormatter={horizontal ? compact : undefined} tickMargin={10} height={32} />
        <YAxis type={horizontal ? 'category' : 'number'} dataKey={horizontal ? 'name' : undefined} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} width={horizontal ? 104 : 41} tickFormatter={horizontal ? undefined : compact} tickCount={4} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hover)' }} />
        <Bar dataKey={dataKey} radius={horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0]} minPointSize={5} isAnimationActive={!reducedMotion} animationDuration={300} label={horizontal ? undefined : { position: 'top', fill: 'var(--text-secondary)', fontSize: 10, formatter: compact }}>
          {data.map((item) => <Cell key={item.name} fill={item.color} fillOpacity={0.8} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}