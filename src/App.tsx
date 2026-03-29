import { useState, useEffect, useMemo, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Logo from './Logo'
import './App.css'

interface Expense {
  id: string
  date: string
  description: string
  category: string
  amount: number
  recurring_id?: string | null
  tags?: string[] | null
  split_count?: number | null
  user_id?: string
  created_at?: string
}

interface Income {
  id: string
  date: string
  description: string
  source: string
  amount: number
  user_id?: string
  created_at?: string
}

interface RecurringExpense {
  id: string
  user_id?: string
  description: string
  category: string
  amount: number
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  start_date: string
  active: boolean
  created_at?: string
}

interface MonthState {
  year: number
  month: number
}

interface Goal {
  id: string
  user_id?: string
  name: string
  target_amount: number
  current_amount: number
  deadline?: string | null
  icon: string
  color: string
  created_at?: string
}

interface ChartEntry {
  label: string
  expenses: number
  income: number
  isCurrent: boolean
}

const CATEGORIES = ['Groceries', 'Food', 'Drinks', 'Transport', 'Housing', 'Entertainment', 'Health', 'Clothes', 'Shopping', 'Savings', 'Other']

const CATEGORY_COLORS: Record<string, string> = {
  Groceries:     '#22c55e',
  Food:          '#f97316',
  Drinks:        '#06b6d4',
  Transport:     '#3b82f6',
  Housing:       '#8b5cf6',
  Entertainment: '#ec4899',
  Health:        '#14b8a6',
  Clothes:       '#f59e0b',
  Shopping:      '#ef4444',
  Savings:       '#6366f1',
  Other:         '#94a3b8',
}

const INCOME_SOURCES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Rental', 'Other']

const INCOME_SOURCE_COLORS: Record<string, string> = {
  Salary:     '#10b981',
  Freelance:  '#0ea5e9',
  Investment: '#f59e0b',
  Gift:       '#ec4899',
  Rental:     '#a78bfa',
  Other:      '#94a3b8',
}

interface MonthNavProps {
  currentMonth: MonthState
  onPrev: () => void
  onNext: () => void
}

function MonthNav({ currentMonth, onPrev, onNext }: MonthNavProps) {
  const label = new Date(currentMonth.year, currentMonth.month).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })
  return (
    <div className="month-nav card">
      <button onClick={onPrev}>&#8592;</button>
      <h1 key={label}>{label}</h1>
      <button onClick={onNext}>&#8594;</button>
    </div>
  )
}

interface CategoryBarProps {
  category: string
  amount: number
  max: number
  color: string
  budget?: number
  onSetBudget?: (amount: number) => void
}

function CategoryBar({ category, amount, max, color, budget, onSetBudget }: CategoryBarProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const hasBudget = budget !== undefined && budget > 0
  const pct = hasBudget
    ? Math.min((amount / budget) * 100, 100)
    : max > 0 ? (amount / max) * 100 : 0
  const overBudget = hasBudget && amount > budget
  const nearBudget = hasBudget && !overBudget && amount / budget >= 0.8
  const barColor = overBudget ? '#ef4444' : nearBudget ? '#f59e0b' : color

  function startEdit() {
    setDraft(hasBudget ? String(Math.round(budget!)) : '')
    setEditing(true)
  }

  function commitEdit() {
    const val = parseFloat(draft)
    if (!isNaN(val) && val > 0) onSetBudget?.(val)
    setEditing(false)
  }

  return (
    <div className="category-bar">
      <div className="category-bar-header">
        <span className="category-label">
          <span className="category-dot" style={{ background: color }} />
          {category}
        </span>
        <span className="category-amounts">
          <span className={overBudget ? 'amount-over' : 'category-amount'}>{amount.toFixed(0)} kr</span>
          {onSetBudget && (
            editing ? (
              <>
                <span className="budget-sep"> / </span>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  step="1"
                  value={draft}
                  className="budget-input"
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') setEditing(false)
                  }}
                />
              </>
            ) : (
              <button className="budget-set-btn" onClick={startEdit}>
                {hasBudget ? ` / ${Math.round(budget!)} kr` : '+ budget'}
              </button>
            )
          )}
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct.toFixed(1)}%`, background: barColor }} />
      </div>
    </div>
  )
}

function useCountUp(target: number, duration = 550): number {
  const [value, setValue] = useState(target)
  const startRef = useRef(target)
  const prevTarget = useRef(target)

  useEffect(() => {
    if (target === prevTarget.current) return
    const from = startRef.current
    prevTarget.current = target
    const startTime = performance.now()
    let raf: number

    function tick(now: number) {
      const t = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else startRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

function BalanceCard({ totalIncome, totalExpenses }: { totalIncome: number; totalExpenses: number }) {
  const remaining = totalIncome - totalExpenses
  const pct = totalIncome > 0 ? Math.min((totalExpenses / totalIncome) * 100, 100) : 0
  const isOver = remaining < 0
  const isWarning = !isOver && pct >= 80
  const barColor = isOver ? '#ef4444' : isWarning ? '#f59e0b' : '#4f7c62'

  const [barPct, setBarPct] = useState(0)
  useEffect(() => {
    let raf1: number, raf2: number
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setBarPct(pct)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [pct])

  const animRemaining = useCountUp(Math.abs(remaining))
  const animExpenses = useCountUp(totalExpenses)
  const animIncome = useCountUp(totalIncome)

  return (
    <div className="balance-card card">
      <span className="balance-label">Remaining this month</span>
      <span className={`balance-amount${isOver ? ' balance-over' : ''}`}>
        {isOver ? '−' : ''}{animRemaining.toFixed(0)} kr
      </span>
      <div className="balance-bar-track">
        <div className="balance-bar-fill" style={{ width: `${barPct.toFixed(1)}%`, background: barColor }} />
      </div>
      <div className="balance-meta">
        <span>{animExpenses.toFixed(0)} kr spent</span>
        <span>{animIncome.toFixed(0)} kr income</span>
      </div>
    </div>
  )
}

interface SummaryProps {
  expenses: Expense[]
  incomes: Income[]
  budgets: Record<string, number>
  onSetBudget: (category: string, amount: number) => void
}

function Summary({ expenses, incomes, budgets, onSetBudget }: SummaryProps) {
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0)
  const net = totalIncome - totalExpenses

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {})

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  const max = sorted.length > 0 ? sorted[0][1] : 1

  return (
    <div className="summary card">
      <h2>Summary</h2>
      <div className="summary-totals">
        <div className="summary-row">
          <span>Income</span>
          <span className="income-total">{totalIncome.toFixed(2)} kr</span>
        </div>
        <div className="summary-row">
          <span>Expenses</span>
          <span className="total-amount">{totalExpenses.toFixed(2)} kr</span>
        </div>
        <div className="summary-row net-row">
          <span>Net</span>
          <span className={net >= 0 ? 'net-positive' : 'net-negative'}>
            {net >= 0 ? '+' : ''}{net.toFixed(2)} kr
          </span>
        </div>
      </div>
      <div className="categories">
        {sorted.length === 0 ? (
          <p className="empty">No expenses this month.</p>
        ) : (
          sorted.map(([cat, amt]) => (
            <CategoryBar
              key={cat}
              category={cat}
              amount={amt}
              max={max}
              color={CATEGORY_COLORS[cat] ?? '#94a3b8'}
              budget={budgets[cat]}
              onSetBudget={(budgetAmt) => onSetBudget(cat, budgetAmt)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: Partial<TooltipContentProps>) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((p, i) => (
        typeof p.value === 'number' ? (
          <p key={i} className="chart-tooltip-value" style={{ color: p.name === 'income' ? '#10b981' : undefined }}>
            {p.name === 'income' ? 'Income' : 'Expenses'}: {p.value.toFixed(2)} kr
          </p>
        ) : null
      ))}
    </div>
  )
}

interface SpendingChartProps {
  data: ChartEntry[]
}

function formatYTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000 % 1 === 0 ? (value / 1_000_000).toFixed(0) : (value / 1_000_000).toFixed(1))}M`
  if (value >= 1000) return `${(value / 1000 % 1 === 0 ? (value / 1000).toFixed(0) : (value / 1000).toFixed(1))}k`
  return String(value)
}

function SpendingChart({ data }: SpendingChartProps) {
  const accentColor = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#aa3bff',
    []
  )
  const maxValue = useMemo(() => Math.max(...data.map(d => Math.max(d.expenses, d.income)), 0), [data])
  const yAxisWidth = useMemo(() => {
    const label = formatYTick(maxValue)
    return Math.max(label.length * 7 + 10, 32)
  }, [maxValue])

  return (
    <div className="spending-chart card">
      <h2>Last 6 months</h2>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} barCategoryGap="30%" barGap={3} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 13, fill: 'var(--text)' }}
          />
          <YAxis
            tickFormatter={formatYTick}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: 'var(--text)' }}
            width={yAxisWidth}
            tickCount={4}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent-bg)' }} />
          <Bar dataKey="income" name="income" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.isCurrent ? '#10b981' : '#10b98155'} />
            ))}
          </Bar>
          <Bar dataKey="expenses" name="expenses" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.isCurrent ? accentColor : `${accentColor}55`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface PieTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: { name: string; value: number } }>
  total: number
}

function PieTooltip({ active, payload, total }: PieTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null
  const { name, value } = payload[0].payload
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{name}</p>
      <p className="chart-tooltip-value">{value.toFixed(2)} kr</p>
      <p className="chart-tooltip-label">{pct}%</p>
    </div>
  )
}

interface CategoryPieChartProps {
  expenses: Expense[]
}

function CategoryPieChart({ expenses }: CategoryPieChartProps) {
  const data = useMemo(() => {
    const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount
      return acc
    }, {})
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
  }, [expenses])

  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="category-chart card">
      <h2>By category</h2>
      {data.length === 0 ? (
        <p className="empty" style={{ marginTop: 16 }}>No expenses this month.</p>
      ) : (
        <>
          <div className="donut-wrapper">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip content={(props) => <PieTooltip {...props} total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <span className="donut-total">
                {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total.toFixed(0)}
              </span>
              <span className="donut-unit">kr</span>
            </div>
          </div>
          <div className="donut-legend">
            {data.slice(0, 5).map(d => (
              <div key={d.name} className="donut-legend-item">
                <span className="donut-legend-dot" style={{ background: CATEGORY_COLORS[d.name] ?? '#94a3b8' }} />
                <span className="donut-legend-name">{d.name}</span>
                <span className="donut-legend-pct">
                  {((d.value / total) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Achievement system ──────────────────────────────────────

interface AchievementDef {
  id: string
  icon: string
  name: string
  description: string
  xp: number
  category: string
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Getting Started
  { id: 'first_entry',       icon: '🌱', name: 'First Entry',       description: 'Log your first expense',                              xp: 25,  category: 'Getting Started' },
  { id: 'month_one',         icon: '📅', name: 'Month One',         description: 'Track both income and expenses in the same month',    xp: 50,  category: 'Getting Started' },
  // Savings
  { id: 'first_surplus',     icon: '💰', name: 'First Surplus',     description: 'End a month with income greater than expenses',       xp: 100, category: 'Savings' },
  { id: 'ten_percent',       icon: '🟢', name: '10% Club',          description: 'Save at least 10% of income in a month',             xp: 75,  category: 'Savings' },
  { id: 'super_saver',       icon: '⭐', name: 'Super Saver',       description: 'Save at least 20% of income in a month',             xp: 150, category: 'Savings' },
  { id: 'on_a_roll',         icon: '🔥', name: 'On a Roll',         description: 'Positive savings 3 months in a row',                 xp: 200, category: 'Savings' },
  { id: 'consistent_saver',  icon: '🏆', name: 'Consistent Saver', description: 'Positive savings 6 months in a row',                 xp: 400, category: 'Savings' },
  // Budgeting
  { id: 'budget_setter',     icon: '📊', name: 'Budget Setter',     description: 'Set budgets for 3 or more categories',               xp: 50,  category: 'Budgeting' },
  { id: 'budget_keeper',     icon: '✅', name: 'Budget Keeper',     description: 'Stay under your total budget for a full month',      xp: 100, category: 'Budgeting' },
  { id: 'perfect_month',     icon: '🎯', name: 'Perfect Month',     description: 'Every category stays under budget in a month',       xp: 200, category: 'Budgeting' },
  { id: 'budget_streak',     icon: '🔄', name: 'Budget Streak',     description: 'Stay under budget 3 months in a row',                xp: 300, category: 'Budgeting' },
  // Planning
  { id: 'autopilot',         icon: '🔁', name: 'Autopilot',         description: 'Set up your first recurring expense',                xp: 50,  category: 'Planning' },
  { id: 'planner_pro',       icon: '📋', name: 'Planner Pro',       description: 'Have 3 or more active recurring expenses',           xp: 100, category: 'Planning' },
  // Milestones
  { id: 'three_months',      icon: '🌊', name: '3 Months Strong',   description: 'Track your finances for 3 months',                   xp: 100, category: 'Milestones' },
  { id: 'half_year',         icon: '🏄', name: 'Half Year',         description: 'Track your finances for 6 months',                   xp: 200, category: 'Milestones' },
  { id: 'year_round',        icon: '🧗', name: 'Year Round',        description: 'Track your finances for 12 months',                  xp: 500, category: 'Milestones' },
]

interface LevelDef {
  name: string
  minXP: number
  color: string
}

const LEVELS: LevelDef[] = [
  { name: 'Beginner',  minXP: 0,    color: '#94a3b8' },
  { name: 'Saver',     minXP: 100,  color: '#10b981' },
  { name: 'Planner',   minXP: 300,  color: '#3b82f6' },
  { name: 'Budgeter',  minXP: 600,  color: '#f59e0b' },
  { name: 'Investor',  minXP: 1000, color: '#8b5cf6' },
  { name: 'Sage',      minXP: 2000, color: '#4f7c62' },
]

function computeAchievements(
  expenses: Expense[],
  incomes: Income[],
  budgets: Record<string, number>,
  recurringExpenses: RecurringExpense[],
): { unlocked: Set<string>; totalXP: number; level: LevelDef; nextLevel: LevelDef | null; progressPct: number; trackedMonths: number; bestSavingsRate: number | null; longestSavingsStreak: number } {
  // Build a sorted list of unique YYYY-MM strings that have expense entries
  const monthSet = new Set<string>()
  expenses.forEach(e => monthSet.add(e.date.slice(0, 7)))
  const months = [...monthSet].sort()
  const trackedMonths = months.length

  // Per-month stats
  type MonthStats = { totalExp: number; totalInc: number; savingsRate: number | null; underBudget: boolean; perfectMonth: boolean; hasIncome: boolean }
  const statsMap: Record<string, MonthStats> = {}
  const totalBudgeted = Object.values(budgets).filter(v => v > 0).reduce((s, v) => s + v, 0)
  const budgetCats = Object.keys(budgets).filter(k => budgets[k] > 0)

  for (const ym of months) {
    const mExp = expenses.filter(e => e.date.startsWith(ym))
    const mInc = incomes.filter(i => i.date.startsWith(ym))
    const totalExp = mExp.reduce((s, e) => s + e.amount, 0)
    const totalInc = mInc.reduce((s, i) => s + i.amount, 0)
    const savingsRate = totalInc > 0 ? (totalInc - totalExp) / totalInc * 100 : null
    const underBudget = totalBudgeted > 0 && totalExp > 0 && totalExp <= totalBudgeted
    const byCategory = mExp.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amount; return acc }, {})
    const perfectMonth = budgetCats.length >= 3 && budgetCats.every(cat => (byCategory[cat] ?? 0) <= budgets[cat])
    statsMap[ym] = { totalExp, totalInc, savingsRate, underBudget, perfectMonth, hasIncome: mInc.length > 0 }
  }

  // Streak helpers
  function longestRun(pred: (ym: string) => boolean): number {
    let max = 0, cur = 0
    for (const ym of months) { pred(ym) ? (cur++, max = Math.max(max, cur)) : (cur = 0) }
    return max
  }

  const isSaving = (ym: string) => { const s = statsMap[ym]; return s.totalInc > 0 && s.totalInc > s.totalExp }

  const longestSavingsStreak = longestRun(isSaving)
  const bestSavingsRate = months.length > 0
    ? Math.max(...months.map(ym => statsMap[ym].savingsRate ?? -Infinity))
    : null
  const bestRate = bestSavingsRate === -Infinity ? null : bestSavingsRate

  // Evaluate each achievement
  const unlocked = new Set<string>()
  const check = (id: string, condition: boolean) => { if (condition) unlocked.add(id) }

  check('first_entry',      expenses.length > 0)
  check('month_one',        months.some(ym => statsMap[ym].hasIncome && statsMap[ym].totalExp > 0))
  check('first_surplus',    months.some(ym => isSaving(ym)))
  check('ten_percent',      months.some(ym => (statsMap[ym].savingsRate ?? 0) >= 10))
  check('super_saver',      months.some(ym => (statsMap[ym].savingsRate ?? 0) >= 20))
  check('on_a_roll',        longestSavingsStreak >= 3)
  check('consistent_saver', longestSavingsStreak >= 6)
  check('budget_setter',    Object.values(budgets).filter(v => v > 0).length >= 3)
  check('budget_keeper',    months.some(ym => statsMap[ym].underBudget))
  check('perfect_month',    months.some(ym => statsMap[ym].perfectMonth))
  check('budget_streak',    longestRun(ym => statsMap[ym].underBudget) >= 3)
  check('autopilot',        recurringExpenses.length > 0)
  check('planner_pro',      recurringExpenses.filter(r => r.active).length >= 3)
  check('three_months',     trackedMonths >= 3)
  check('half_year',        trackedMonths >= 6)
  check('year_round',       trackedMonths >= 12)

  const totalXP = ACHIEVEMENT_DEFS.filter(a => unlocked.has(a.id)).reduce((s, a) => s + a.xp, 0)
  const level = [...LEVELS].reverse().find(l => totalXP >= l.minXP) ?? LEVELS[0]
  const nextLevelIdx = LEVELS.indexOf(level) + 1
  const nextLevel = nextLevelIdx < LEVELS.length ? LEVELS[nextLevelIdx] : null
  const progressPct = nextLevel
    ? ((totalXP - level.minXP) / (nextLevel.minXP - level.minXP)) * 100
    : 100

  return { unlocked, totalXP, level, nextLevel, progressPct, trackedMonths, bestSavingsRate: bestRate, longestSavingsStreak }
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Smart Insights ──────────────────────────────────────────

interface Insight {
  type: 'positive' | 'warning' | 'info'
  icon: string
  title: string
  body: string
}

function computeInsights(
  expenses: Expense[],
  incomes: Income[],
  recurringExpenses: RecurringExpense[],
  currentMonth: MonthState,
): Insight[] {
  const insights: Insight[] = []

  function ymOffset(offset: number): string {
    const d = new Date(currentMonth.year, currentMonth.month + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const currentYM = ymOffset(0)

  const prevMonths = [-3, -2, -1].map(ymOffset)
  const prevData = prevMonths.map(ym =>
    expenses.filter(e => e.date.startsWith(ym)).reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount
      return acc
    }, {})
  )
  const monthsWithData = prevData.filter(m => Object.keys(m).length > 0).length

  const currentByCat = expenses.filter(e => e.date.startsWith(currentYM)).reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {})

  if (monthsWithData >= 1) {
    const allCats = new Set([...prevData.flatMap(m => Object.keys(m)), ...Object.keys(currentByCat)])
    let biggestIncreaseCat = ''
    let biggestIncreasePct = 0
    for (const cat of allCats) {
      const curr = currentByCat[cat] ?? 0
      const avgs = prevData.map(m => m[cat] ?? 0)
      const avg = avgs.reduce((s, v) => s + v, 0) / avgs.length
      if (avg > 200 && curr > 0) {
        const pct = ((curr - avg) / avg) * 100
        if (pct > biggestIncreasePct) {
          biggestIncreasePct = pct
          biggestIncreaseCat = cat
        }
      }
    }
    if (biggestIncreaseCat && biggestIncreasePct > 15) {
      const avg = prevData.map(m => m[biggestIncreaseCat] ?? 0).reduce((s, v) => s + v, 0) / prevData.length
      insights.push({
        type: 'warning',
        icon: '📈',
        title: `${biggestIncreaseCat} is up ${Math.round(biggestIncreasePct)}%`,
        body: `You've spent ${Math.round(currentByCat[biggestIncreaseCat])} kr this month vs your ${monthsWithData}-month average of ${Math.round(avg)} kr.`,
      })
    }
  }

  if (monthsWithData >= 2) {
    let topCat = ''
    let topSaving = 0
    for (const [cat, curr] of Object.entries(currentByCat)) {
      const avgs = prevData.map(m => m[cat] ?? 0)
      const populated = avgs.filter(v => v > 0)
      if (populated.length < 1) continue
      const avg = avgs.reduce((s, v) => s + v, 0) / avgs.length
      const saving = curr - avg
      if (saving > topSaving) { topSaving = saving; topCat = cat }
    }
    if (topCat && topSaving > 300) {
      insights.push({
        type: 'info',
        icon: '💡',
        title: `Save ~${Math.round(topSaving)} kr on ${topCat}`,
        body: `Bringing ${topCat} spending back to your recent average could save you around ${Math.round(topSaving)} kr this month.`,
      })
    }
  }

  if (recurringExpenses.filter(r => r.active).length > 0) {
    const monthlyRecurring = recurringExpenses
      .filter(r => r.active)
      .reduce((s, r) => {
        if (r.frequency === 'monthly') return s + r.amount
        if (r.frequency === 'yearly') return s + r.amount / 12
        if (r.frequency === 'weekly') return s + r.amount * 4.33
        if (r.frequency === 'daily') return s + r.amount * 30
        return s
      }, 0)
    const prevIncomes = [-3, -2, -1].map(o => {
      const ym = ymOffset(o)
      return incomes.filter(i => i.date.startsWith(ym)).reduce((s, i) => s + i.amount, 0)
    }).filter(v => v > 0)
    if (prevIncomes.length > 0) {
      const avgIncome = prevIncomes.reduce((s, v) => s + v, 0) / prevIncomes.length
      const pct = Math.round((monthlyRecurring / avgIncome) * 100)
      if (pct > 0) {
        const type = pct > 50 ? 'warning' : pct > 30 ? 'info' : 'positive'
        insights.push({
          type,
          icon: pct > 40 ? '⚠️' : '🔄',
          title: `Recurring costs: ${pct}% of income`,
          body: `Your ${recurringExpenses.filter(r => r.active).length} recurring expenses add up to ~${Math.round(monthlyRecurring).toLocaleString('no')} kr/month.`,
        })
      }
    }
  }

  const allMonths = [...new Set(expenses.map(e => e.date.slice(0, 7)).concat(incomes.map(i => i.date.slice(0, 7))))].sort()
  let bestYM = ''
  let bestRate = -Infinity
  for (const ym of allMonths) {
    if (ym === currentYM) continue
    const exp = expenses.filter(e => e.date.startsWith(ym)).reduce((s, e) => s + e.amount, 0)
    const inc = incomes.filter(i => i.date.startsWith(ym)).reduce((s, i) => s + i.amount, 0)
    if (inc > 0) {
      const rate = (inc - exp) / inc * 100
      if (rate > bestRate) { bestRate = rate; bestYM = ym }
    }
  }
  if (bestYM && bestRate > 10) {
    const [y, m] = bestYM.split('-').map(Number)
    const label = new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    insights.push({
      type: 'positive',
      icon: '🏆',
      title: `Best month: ${label}`,
      body: `You saved ${Math.round(bestRate)}% of your income — your personal record. Keep it up!`,
    })
  }

  return insights
}

// ── Forecast ────────────────────────────────────────────────

interface Forecast {
  projectedExpenses: number
  projectedNet: number
  dailyRate: number
  daysElapsed: number
  daysInMonth: number
  next30Cashflow: number
  hasEnoughData: boolean
}

function computeForecast(
  expenses: Expense[],
  incomes: Income[],
  recurringExpenses: RecurringExpense[],
  currentMonth: MonthState,
): Forecast | null {
  const now = new Date()
  const isCurrentMonth = currentMonth.year === now.getFullYear() && currentMonth.month === now.getMonth()
  if (!isCurrentMonth) return null

  const daysElapsed = now.getDate()
  const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate()
  const currentYM = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}`

  const monthExpenses = expenses.filter(e => e.date.startsWith(currentYM)).reduce((s, e) => s + e.amount, 0)
  const monthIncome = incomes.filter(i => i.date.startsWith(currentYM)).reduce((s, i) => s + i.amount, 0)

  if (daysElapsed < 3) return null

  const dailyRate = monthExpenses / daysElapsed
  const projectedExpenses = dailyRate * daysInMonth
  const projectedNet = monthIncome - projectedExpenses

  const prevMonths = [-3, -2, -1].map(o => {
    const d = new Date(currentMonth.year, currentMonth.month + o)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const avgDailyFromHistory = prevMonths.reduce((sum, ym) => {
    const total = expenses.filter(e => e.date.startsWith(ym)).reduce((s, e) => s + e.amount, 0)
    const d = new Date(Number(ym.split('-')[0]), Number(ym.split('-')[1]) - 1 + 1, 0).getDate()
    return sum + total / d
  }, 0) / 3

  const dailyForForecast = avgDailyFromHistory > 0 ? avgDailyFromHistory : dailyRate
  const monthlyRecurring = recurringExpenses.filter(r => r.active).reduce((s, r) => {
    if (r.frequency === 'monthly') return s + r.amount
    if (r.frequency === 'yearly') return s + r.amount / 12
    if (r.frequency === 'weekly') return s + r.amount * 4.33
    if (r.frequency === 'daily') return s + r.amount * 30
    return s
  }, 0)

  const avgIncome = prevMonths.reduce((sum, ym) => {
    return sum + incomes.filter(i => i.date.startsWith(ym)).reduce((s, i) => s + i.amount, 0)
  }, 0) / 3

  const next30Projected = dailyForForecast * 30 + monthlyRecurring
  const next30Income = avgIncome > 0 ? avgIncome : monthIncome
  const next30Cashflow = next30Income - next30Projected

  return {
    projectedExpenses,
    projectedNet,
    dailyRate,
    daysElapsed,
    daysInMonth,
    next30Cashflow,
    hasEnoughData: daysElapsed >= 5,
  }
}

function getOccurrencesInMonth(rec: RecurringExpense, year: number, month: number): string[] {
  const start = new Date(rec.start_date + 'T00:00:00')
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  if (start > monthEnd) return []

  const dates: string[] = []
  switch (rec.frequency) {
    case 'daily': {
      const from = start < monthStart ? new Date(monthStart) : new Date(start)
      while (from <= monthEnd) { dates.push(toDateStr(from)); from.setDate(from.getDate() + 1) }
      break
    }
    case 'weekly': {
      const dow = start.getDay()
      const cur = new Date(Math.max(start.getTime(), monthStart.getTime()))
      while (cur.getDay() !== dow) cur.setDate(cur.getDate() + 1)
      while (cur <= monthEnd) {
        if (cur >= start) dates.push(toDateStr(new Date(cur)))
        cur.setDate(cur.getDate() + 7)
      }
      break
    }
    case 'monthly': {
      const day = Math.min(start.getDate(), new Date(year, month + 1, 0).getDate())
      const occ = new Date(year, month, day)
      if (occ >= start) dates.push(toDateStr(occ))
      break
    }
    case 'yearly': {
      if (start.getMonth() === month) {
        const day = Math.min(start.getDate(), new Date(year, month + 1, 0).getDate())
        const occ = new Date(year, month, day)
        if (occ >= start) dates.push(toDateStr(occ))
      }
      break
    }
  }
  return dates
}

interface AddExpenseFormProps {
  onAdd: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at'>) => void
  defaultDate: string
}

function AddExpenseForm({ onAdd, defaultDate }: AddExpenseFormProps) {
  const [form, setForm] = useState({
    date: defaultDate,
    description: '',
    category: CATEGORIES[0],
    amount: '',
    tags: '',
    split: false,
    splitWays: 2,
  })

  useEffect(() => {
    setForm(f => ({ ...f, date: defaultDate }))
  }, [defaultDate])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!form.date || !form.description || isNaN(amount) || amount <= 0) return
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    onAdd({
      ...form,
      amount: form.split ? amount / form.splitWays : amount,
      tags,
      split_count: form.split ? form.splitWays : null,
    })
    setForm({ date: defaultDate, description: '', category: CATEGORIES[0], amount: '', tags: '', split: false, splitWays: 2 })
  }

  return (
    <form className="add-form card" onSubmit={handleSubmit}>
      <h2>Add Expense</h2>
      <div className="form-grid">
        <label>
          Date
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
        </label>
        <label>
          Category
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Description
          <input
            type="text"
            placeholder="e.g. Groceries"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            required
          />
        </label>
        <label>
          Amount (kr)
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            required
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Tags <span style={{ fontWeight: 400, opacity: 0.6 }}>(comma-separated, optional)</span>
          <input
            type="text"
            placeholder="e.g. work, reimbursable"
            value={form.tags}
            onChange={e => set('tags', e.target.value)}
          />
        </label>
        <div className="split-toggle" style={{ gridColumn: '1 / -1' }}>
          <label className="split-label">
            <input
              type="checkbox"
              checked={form.split}
              onChange={e => setForm(f => ({ ...f, split: e.target.checked }))}
            />
            Split bill
          </label>
          {form.split && (
            <label className="split-ways-label">
              Split
              <input
                type="number"
                min="2"
                max="20"
                value={form.splitWays}
                onChange={e => setForm(f => ({ ...f, splitWays: Math.max(2, parseInt(e.target.value) || 2) }))}
                style={{ width: 56 }}
              />
              ways &nbsp;·&nbsp; your share: {form.amount ? `${(parseFloat(form.amount) / form.splitWays).toFixed(0)} kr` : '—'}
            </label>
          )}
        </div>
        <button type="submit" className="add-btn">Add Expense</button>
      </div>
    </form>
  )
}

interface AddIncomeFormProps {
  onAdd: (income: Omit<Income, 'id' | 'user_id' | 'created_at'>) => void
  defaultDate: string
}

function AddIncomeForm({ onAdd, defaultDate }: AddIncomeFormProps) {
  const [form, setForm] = useState({
    date: defaultDate,
    description: '',
    source: INCOME_SOURCES[0],
    amount: '',
  })

  useEffect(() => {
    setForm(f => ({ ...f, date: defaultDate }))
  }, [defaultDate])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!form.date || !form.description || isNaN(amount) || amount <= 0) return
    onAdd({ ...form, amount })
    setForm({ date: defaultDate, description: '', source: INCOME_SOURCES[0], amount: '' })
  }

  return (
    <form className="add-form card" onSubmit={handleSubmit}>
      <h2>Add Income</h2>
      <div className="form-grid">
        <label>
          Date
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
        </label>
        <label>
          Source
          <select value={form.source} onChange={e => set('source', e.target.value)}>
            {INCOME_SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Description
          <input
            type="text"
            placeholder="e.g. Monthly salary"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            required
          />
        </label>
        <label>
          Amount (kr)
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            required
          />
        </label>
        <button type="submit" className="add-btn add-income-btn">Add Income</button>
      </div>
    </form>
  )
}

interface ExpenseListProps {
  expenses: Expense[]
  onDelete: (id: string) => void
  onEdit: (id: string, updates: Omit<Expense, 'id' | 'user_id' | 'created_at'>) => void
}

type EditDraft = {
  date: string
  description: string
  category: string
  amount: string | number
  tags: string
  split_count: number | null
}

function ExpenseList({ expenses, onDelete, onEdit }: ExpenseListProps) {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterTag, setFilterTag] = useState('All')
  const [sortDesc, setSortDesc] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ date: '', description: '', category: '', amount: '', tags: '', split_count: null })
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const [swipedEditId, setSwipedEditId] = useState<string | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchItemId = useRef<string | null>(null)

  function startEdit(e: Expense) {
    setEditingId(e.id)
    setSwipedId(null)
    setSwipedEditId(null)
    setEditDraft({ date: e.date, description: e.description, category: e.category, amount: e.amount, tags: (e.tags ?? []).join(', '), split_count: e.split_count ?? null })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft({ date: '', description: '', category: '', amount: '', tags: '', split_count: null })
  }

  function saveEdit(id: string) {
    const amount = parseFloat(String(editDraft.amount))
    if (!editDraft.date || !editDraft.description || isNaN(amount) || amount <= 0) return
    const tags = editDraft.tags.split(',').map(t => t.trim()).filter(Boolean)
    onEdit(id, { date: editDraft.date, description: editDraft.description, category: editDraft.category, amount, tags, split_count: editDraft.split_count })
    setEditingId(null)
    setEditDraft({ date: '', description: '', category: '', amount: '', tags: '', split_count: null })
  }

  function onTouchStart(id: string, clientX: number) {
    touchStartX.current = clientX
    touchItemId.current = id
    if (swipedId && swipedId !== id) setSwipedId(null)
    if (swipedEditId && swipedEditId !== id) setSwipedEditId(null)
  }

  function onTouchMove(clientX: number) {
    if (touchStartX.current === null || touchItemId.current === null) return
    const dx = clientX - touchStartX.current
    const id = touchItemId.current
    if (dx < -50) { setSwipedId(id); setSwipedEditId(null) }
    else if (dx > 50) { setSwipedEditId(id); setSwipedId(null) }
    else if (dx > 20 && swipedId === id) setSwipedId(null)
    else if (dx < -20 && swipedEditId === id) setSwipedEditId(null)
  }

  function onTouchEnd() {
    touchStartX.current = null
    touchItemId.current = null
  }

  const allTags = [...new Set(expenses.flatMap(e => e.tags ?? []))].sort()

  const filtered = [...expenses]
    .filter(e => filterCategory === 'All' || e.category === filterCategory)
    .filter(e => e.description.toLowerCase().includes(search.toLowerCase()))
    .filter(e => filterTag === 'All' || (e.tags ?? []).includes(filterTag))
    .sort((a, b) => sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))

  return (
    <div className="expense-list card">
      <div className="list-header">
        <h2>Expenses</h2>
        <button className="sort-btn" onClick={() => setSortDesc(d => !d)}>
          {sortDesc ? '↓ Newest' : '↑ Oldest'}
        </button>
      </div>
      <div className="list-filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Search descriptions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="filter-category"
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
        >
          <option value="All">All categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        {allTags.length > 0 && (
          <select
            className="filter-category"
            value={filterTag}
            onChange={e => setFilterTag(e.target.value)}
          >
            <option value="All">All tags</option>
            {allTags.map(t => <option key={t}>{t}</option>)}
          </select>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="empty">{expenses.length === 0 ? 'No expenses this month.' : 'No matching expenses.'}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, idx) => editingId === e.id ? (
              <tr key={e.id} className="editing-row">
                <td>
                  <input type="date" value={editDraft.date}
                    onChange={ev => setEditDraft(d => ({ ...d, date: ev.target.value }))} />
                </td>
                <td>
                  <input type="text" value={editDraft.description}
                    onChange={ev => setEditDraft(d => ({ ...d, description: ev.target.value }))} />
                </td>
                <td>
                  <select value={editDraft.category}
                    onChange={ev => setEditDraft(d => ({ ...d, category: ev.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td>
                  <input type="number" min="0.01" step="0.01" value={String(editDraft.amount)}
                    onChange={ev => setEditDraft(d => ({ ...d, amount: ev.target.value }))} />
                </td>
                <td style={{ gridColumn: '1 / -1' }}>
                  <input type="text" placeholder="tags (comma-separated)"
                    value={editDraft.tags}
                    onChange={ev => setEditDraft(d => ({ ...d, tags: ev.target.value }))} />
                </td>
                <td>
                  <input type="number" min="1" placeholder="split (e.g. 2)"
                    value={editDraft.split_count ?? ''}
                    onChange={ev => setEditDraft(d => ({ ...d, split_count: ev.target.value ? parseInt(ev.target.value) : null }))} />
                </td>
                <td>
                  <div className="row-actions">
                    <button className="save-btn" onClick={() => saveEdit(e.id)}>&#10003;</button>
                    <button className="cancel-btn" onClick={cancelEdit}>&#10005;</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr
                key={e.id}
                className={swipedId === e.id ? 'row-swiped' : swipedEditId === e.id ? 'row-swiped-edit' : ''}
                style={{ animationDelay: `${Math.min(idx, 12) * 0.04}s` }}
                onTouchStart={ev => onTouchStart(e.id, ev.touches[0].clientX)}
                onTouchMove={ev => onTouchMove(ev.touches[0].clientX)}
                onTouchEnd={onTouchEnd}
                onClick={() => { if (swipedId === e.id) setSwipedId(null); if (swipedEditId === e.id) setSwipedEditId(null) }}
              >
                <td>{new Date(e.date + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}</td>
                <td>
                  {e.description}{e.recurring_id && <span className="recurring-indicator" title="Recurring">↻</span>}
                  {(e.tags ?? []).length > 0 && (
                    <div className="tag-chips">
                      {(e.tags ?? []).map(tag => (
                        <span key={tag} className="tag-chip">{tag}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td><span className="badge" style={{
                  color: CATEGORY_COLORS[e.category] ?? '#94a3b8',
                  background: `${CATEGORY_COLORS[e.category] ?? '#94a3b8'}18`,
                  borderColor: `${CATEGORY_COLORS[e.category] ?? '#94a3b8'}44`,
                }}>{e.category}</span></td>
                <td className="amount-cell">
                  {e.amount.toFixed(2)} kr
                  {e.split_count && <span className="split-badge">÷{e.split_count}</span>}
                </td>
                <td>
                  <div className="row-actions">
                    <button className="edit-btn" onClick={ev => { ev.stopPropagation(); startEdit(e) }}>&#9998;</button>
                    <button className="delete-btn" onClick={ev => { ev.stopPropagation(); onDelete(e.id) }}>&#215;</button>
                  </div>
                </td>
                <td className="swipe-delete-cell">
                  <button onClick={ev => { ev.stopPropagation(); onDelete(e.id); setSwipedId(null) }} aria-label="Delete">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Delete
                  </button>
                </td>
                <td className="swipe-edit-cell">
                  <button onClick={ev => { ev.stopPropagation(); startEdit(e) }} aria-label="Edit">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

interface IncomeListProps {
  incomes: Income[]
  onDelete: (id: string) => void
  onEdit: (id: string, updates: Omit<Income, 'id' | 'user_id' | 'created_at'>) => void
}

type IncomeEditDraft = {
  date: string
  description: string
  source: string
  amount: string | number
}

function IncomeList({ incomes, onDelete, onEdit }: IncomeListProps) {
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('All')
  const [sortDesc, setSortDesc] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<IncomeEditDraft>({ date: '', description: '', source: '', amount: '' })
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const [swipedEditId, setSwipedEditId] = useState<string | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchItemId = useRef<string | null>(null)

  function startEdit(inc: Income) {
    setEditingId(inc.id)
    setSwipedId(null)
    setSwipedEditId(null)
    setEditDraft({ date: inc.date, description: inc.description, source: inc.source, amount: inc.amount })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft({ date: '', description: '', source: '', amount: '' })
  }

  function saveEdit(id: string) {
    const amount = parseFloat(String(editDraft.amount))
    if (!editDraft.date || !editDraft.description || isNaN(amount) || amount <= 0) return
    onEdit(id, { date: editDraft.date, description: editDraft.description, source: editDraft.source, amount })
    setEditingId(null)
    setEditDraft({ date: '', description: '', source: '', amount: '' })
  }

  function onTouchStart(id: string, clientX: number) {
    touchStartX.current = clientX
    touchItemId.current = id
    if (swipedId && swipedId !== id) setSwipedId(null)
    if (swipedEditId && swipedEditId !== id) setSwipedEditId(null)
  }

  function onTouchMove(clientX: number) {
    if (touchStartX.current === null || touchItemId.current === null) return
    const dx = clientX - touchStartX.current
    const id = touchItemId.current
    if (dx < -50) { setSwipedId(id); setSwipedEditId(null) }
    else if (dx > 50) { setSwipedEditId(id); setSwipedId(null) }
    else if (dx > 20 && swipedId === id) setSwipedId(null)
    else if (dx < -20 && swipedEditId === id) setSwipedEditId(null)
  }

  function onTouchEnd() {
    touchStartX.current = null
    touchItemId.current = null
  }

  const filtered = [...incomes]
    .filter(inc => filterSource === 'All' || inc.source === filterSource)
    .filter(inc => inc.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))

  return (
    <div className="expense-list income-list card">
      <div className="list-header">
        <h2>Income</h2>
        <button className="sort-btn" onClick={() => setSortDesc(d => !d)}>
          {sortDesc ? '↓ Newest' : '↑ Oldest'}
        </button>
      </div>
      <div className="list-filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Search descriptions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="filter-category"
          value={filterSource}
          onChange={e => setFilterSource(e.target.value)}
        >
          <option value="All">All sources</option>
          {INCOME_SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="empty">{incomes.length === 0 ? 'No income this month.' : 'No matching income.'}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Source</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inc, idx) => editingId === inc.id ? (
              <tr key={inc.id} className="editing-row">
                <td>
                  <input type="date" value={editDraft.date}
                    onChange={ev => setEditDraft(d => ({ ...d, date: ev.target.value }))} />
                </td>
                <td>
                  <input type="text" value={editDraft.description}
                    onChange={ev => setEditDraft(d => ({ ...d, description: ev.target.value }))} />
                </td>
                <td>
                  <select value={editDraft.source}
                    onChange={ev => setEditDraft(d => ({ ...d, source: ev.target.value }))}>
                    {INCOME_SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  <input type="number" min="0.01" step="0.01" value={String(editDraft.amount)}
                    onChange={ev => setEditDraft(d => ({ ...d, amount: ev.target.value }))} />
                </td>
                <td>
                  <div className="row-actions">
                    <button className="save-btn" onClick={() => saveEdit(inc.id)}>&#10003;</button>
                    <button className="cancel-btn" onClick={cancelEdit}>&#10005;</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr
                key={inc.id}
                className={swipedId === inc.id ? 'row-swiped' : swipedEditId === inc.id ? 'row-swiped-edit' : ''}
                style={{ animationDelay: `${Math.min(idx, 12) * 0.04}s` }}
                onTouchStart={ev => onTouchStart(inc.id, ev.touches[0].clientX)}
                onTouchMove={ev => onTouchMove(ev.touches[0].clientX)}
                onTouchEnd={onTouchEnd}
                onClick={() => { if (swipedId === inc.id) setSwipedId(null); if (swipedEditId === inc.id) setSwipedEditId(null) }}
              >
                <td>{new Date(inc.date + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}</td>
                <td>{inc.description}</td>
                <td><span className="badge" style={{
                  color: INCOME_SOURCE_COLORS[inc.source] ?? '#94a3b8',
                  background: `${INCOME_SOURCE_COLORS[inc.source] ?? '#94a3b8'}18`,
                  borderColor: `${INCOME_SOURCE_COLORS[inc.source] ?? '#94a3b8'}44`,
                }}>{inc.source}</span></td>
                <td className="amount-cell income-amount">{inc.amount.toFixed(2)} kr</td>
                <td>
                  <div className="row-actions">
                    <button className="edit-btn" onClick={ev => { ev.stopPropagation(); startEdit(inc) }}>&#9998;</button>
                    <button className="delete-btn" onClick={ev => { ev.stopPropagation(); onDelete(inc.id) }}>&#215;</button>
                  </div>
                </td>
                <td className="swipe-delete-cell">
                  <button onClick={ev => { ev.stopPropagation(); onDelete(inc.id); setSwipedId(null) }} aria-label="Delete">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Delete
                  </button>
                </td>
                <td className="swipe-edit-cell">
                  <button onClick={ev => { ev.stopPropagation(); startEdit(inc) }} aria-label="Edit">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}


interface BudgetCategoryRowProps {
  category: string
  color: string
  currentSpending: number
  prevAvg: number
  budget?: number
  onSetBudget: (amount: number) => void
}

function BudgetCategoryRow({ category, color, currentSpending, prevAvg, budget, onSetBudget }: BudgetCategoryRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const hasBudget = budget !== undefined && budget > 0
  const pct = hasBudget ? Math.min((currentSpending / budget) * 100, 100) : 0
  const overBudget = hasBudget && currentSpending > budget
  const nearBudget = hasBudget && !overBudget && pct >= 80
  const barColor = overBudget ? '#ef4444' : nearBudget ? '#f59e0b' : color
  const remaining = hasBudget ? budget - currentSpending : null
  const trendPct = prevAvg > 0 && currentSpending > 0 ? ((currentSpending - prevAvg) / prevAvg) * 100 : null

  function startEdit() {
    setDraft(hasBudget ? String(Math.round(budget!)) : prevAvg > 0 ? String(Math.round(prevAvg)) : '')
    setEditing(true)
  }

  function commitEdit() {
    const val = parseFloat(draft)
    if (!isNaN(val) && val > 0) onSetBudget(val)
    setEditing(false)
  }

  return (
    <div className="budget-cat-row">
      <div className="budget-cat-header">
        <span className="budget-cat-name">
          <span className="category-dot" style={{ background: color }} />
          {category}
        </span>
        {editing ? (
          <div className="budget-edit-group">
            <input
              autoFocus
              type="number"
              min="1"
              step="100"
              value={draft}
              className="budget-edit-input"
              onChange={e => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <span className="budget-edit-unit">kr</span>
          </div>
        ) : (
          <button className="budget-amount-btn" onClick={startEdit}>
            {hasBudget ? `${Math.round(budget!).toLocaleString('no')} kr` : '+ Set budget'}
          </button>
        )}
      </div>
      <div className="budget-cat-stats">
        <span className="budget-stat">
          Spent: <strong className={overBudget ? 'stat-over' : ''}>{Math.round(currentSpending).toLocaleString('no')} kr</strong>
        </span>
        {prevAvg > 0 && (
          <span className="budget-stat budget-stat-avg">
            3mo avg: {Math.round(prevAvg).toLocaleString('no')} kr
            {trendPct !== null && Math.abs(trendPct) > 10 && (
              <span className={trendPct > 0 ? 'trend-up' : 'trend-down'}>
                {trendPct > 0 ? ' ↑' : ' ↓'}{Math.abs(trendPct).toFixed(0)}%
              </span>
            )}
          </span>
        )}
        {remaining !== null && (
          <span className={`budget-stat ${overBudget ? 'stat-over' : 'stat-remaining'}`}>
            {overBudget
              ? `${Math.round(Math.abs(remaining)).toLocaleString('no')} kr over`
              : `${Math.round(remaining).toLocaleString('no')} kr left`}
          </span>
        )}
      </div>
      {hasBudget && (
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${pct.toFixed(1)}%`, background: barColor }} />
        </div>
      )}
    </div>
  )
}

interface BudgetsSectionProps {
  expenses: Expense[]
  monthIncomes: Income[]
  budgets: Record<string, number>
  onSetBudget: (category: string, amount: number) => void
  currentMonth: MonthState
}

function BudgetsSection({ expenses, monthIncomes, budgets, onSetBudget, currentMonth }: BudgetsSectionProps) {
  const monthExpenses = useMemo(() => expenses.filter(e => {
    const d = new Date(e.date + 'T00:00:00')
    return d.getFullYear() === currentMonth.year && d.getMonth() === currentMonth.month
  }), [expenses, currentMonth])

  const currentSpendingByCategory = useMemo(() => monthExpenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {}), [monthExpenses])

  const prevMonthsAvg = useMemo(() => {
    const result: Record<string, number> = {}
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentMonth.year, currentMonth.month - i)
      const year = d.getFullYear()
      const month = d.getMonth()
      expenses
        .filter(e => {
          const ed = new Date(e.date + 'T00:00:00')
          return ed.getFullYear() === year && ed.getMonth() === month
        })
        .forEach(e => {
          result[e.category] = (result[e.category] ?? 0) + e.amount / 3
        })
    }
    return result
  }, [expenses, currentMonth])

  const totalBudgeted = Object.values(budgets).reduce((sum, v) => sum + v, 0)
  const totalIncome = monthIncomes.reduce((sum, i) => sum + i.amount, 0)
  const totalSpent = monthExpenses.reduce((sum, e) => sum + e.amount, 0)
  const buffer = totalBudgeted > 0 && totalIncome > 0 ? totalIncome - totalBudgeted : null
  const budgetPct = totalIncome > 0 && totalBudgeted > 0 ? Math.min((totalBudgeted / totalIncome) * 100, 100) : 0

  const today = new Date()
  const isCurrentMonth = currentMonth.year === today.getFullYear() && currentMonth.month === today.getMonth()
  const dayOfMonth = isCurrentMonth ? today.getDate() : new Date(currentMonth.year, currentMonth.month + 1, 0).getDate()
  const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate()
  const projectedSpending = isCurrentMonth && dayOfMonth > 0 && totalSpent > 0
    ? Math.round((totalSpent / dayOfMonth) * daysInMonth)
    : null
  const budgetRemaining = totalBudgeted > 0 ? totalBudgeted - totalSpent : null

  const sortedCategories = [...CATEGORIES].sort((a, b) => {
    const aActive = (currentSpendingByCategory[a] ?? 0) > 0 || (budgets[a] ?? 0) > 0
    const bActive = (currentSpendingByCategory[b] ?? 0) > 0 || (budgets[b] ?? 0) > 0
    if (aActive && !bActive) return -1
    if (!aActive && bActive) return 1
    return 0
  })

  const showOutlook = totalBudgeted > 0 || totalIncome > 0

  return (
    <div className="budgets-section">
      {showOutlook && (
        <div className="budget-outlook card">
          <h2>Monthly Outlook</h2>
          <div className="outlook-stats">
            <div className="outlook-stat">
              <span className="outlook-label">Income</span>
              <span className="outlook-value income-total">
                {totalIncome > 0 ? `${Math.round(totalIncome).toLocaleString('no')} kr` : '—'}
              </span>
            </div>
            <div className="outlook-stat">
              <span className="outlook-label">Budgeted</span>
              <span className="outlook-value">
                {totalBudgeted > 0 ? `${Math.round(totalBudgeted).toLocaleString('no')} kr` : '—'}
              </span>
            </div>
            <div className="outlook-stat">
              <span className="outlook-label">Buffer</span>
              <span className={`outlook-value ${buffer === null ? '' : buffer >= 0 ? 'net-positive' : 'net-negative'}`}>
                {buffer !== null
                  ? `${buffer >= 0 ? '+' : ''}${Math.round(buffer).toLocaleString('no')} kr`
                  : '—'}
              </span>
            </div>
          </div>
          {totalBudgeted > 0 && totalIncome > 0 && (
            <div className="outlook-bar-row">
              <div className="outlook-bar-track">
                <div
                  className="outlook-bar-fill"
                  style={{
                    width: `${budgetPct.toFixed(1)}%`,
                    background: budgetPct > 100 ? '#ef4444' : budgetPct > 85 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
              <span className="outlook-bar-label">{budgetPct.toFixed(0)}% of income budgeted</span>
            </div>
          )}
          {isCurrentMonth && totalSpent > 0 && (
            <div className="outlook-projection">
              <div className="projection-row">
                <span>Spent so far ({dayOfMonth} / {daysInMonth} days)</span>
                <span className="projection-value">{Math.round(totalSpent).toLocaleString('no')} kr</span>
              </div>
              {projectedSpending !== null && (
                <div className="projection-row">
                  <span>Projected end of month</span>
                  <span className={`projection-value ${totalBudgeted > 0 && projectedSpending > totalBudgeted ? 'stat-over' : ''}`}>
                    ~{projectedSpending.toLocaleString('no')} kr
                  </span>
                </div>
              )}
              {budgetRemaining !== null && (
                <div className="projection-row">
                  <span>Budget remaining</span>
                  <span className={`projection-value ${budgetRemaining < 0 ? 'stat-over' : 'stat-remaining'}`}>
                    {budgetRemaining >= 0
                      ? `${Math.round(budgetRemaining).toLocaleString('no')} kr`
                      : `−${Math.round(Math.abs(budgetRemaining)).toLocaleString('no')} kr`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="budget-categories card">
        <div className="budget-categories-header">
          <h2>Category Budgets</h2>
          <span className="budget-hint">Click to edit</span>
        </div>
        <div className="budget-cat-list">
          {sortedCategories.map(cat => (
            <BudgetCategoryRow
              key={cat}
              category={cat}
              color={CATEGORY_COLORS[cat] ?? '#94a3b8'}
              currentSpending={currentSpendingByCategory[cat] ?? 0}
              prevAvg={prevMonthsAvg[cat] ?? 0}
              budget={budgets[cat]}
              onSetBudget={(amt) => onSetBudget(cat, amt)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

function monthlyEquivalent(rec: RecurringExpense): number {
  switch (rec.frequency) {
    case 'daily': return rec.amount * 365 / 12
    case 'weekly': return rec.amount * 52 / 12
    case 'yearly': return rec.amount / 12
    default: return rec.amount
  }
}

interface RecurringSectionProps {
  recurring: RecurringExpense[]
  onAdd: (rec: Omit<RecurringExpense, 'id' | 'user_id' | 'created_at'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggle: (id: string, active: boolean) => Promise<void>
}

function RecurringSection({ recurring, onAdd, onDelete, onToggle }: RecurringSectionProps) {
  const today = toDateStr(new Date())
  const [form, setForm] = useState({ description: '', category: CATEGORIES[0], amount: '', frequency: 'monthly' as RecurringExpense['frequency'], start_date: today })
  const [showForm, setShowForm] = useState(false)

  function setF(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!form.description || isNaN(amount) || amount <= 0 || !form.start_date) return
    await onAdd({ description: form.description, category: form.category, amount, frequency: form.frequency, start_date: form.start_date, active: true })
    setForm({ description: '', category: CATEGORIES[0], amount: '', frequency: 'monthly', start_date: today })
    setShowForm(false)
  }

  const totalMonthly = recurring.filter(r => r.active).reduce((sum, r) => sum + monthlyEquivalent(r), 0)

  return (
    <div className="recurring-section">
      <div className="recurring-overview card">
        <div className="recurring-overview-row">
          <div>
            <h2>Recurring</h2>
            <p className="recurring-subtitle">{recurring.filter(r => r.active).length} active · ~{Math.round(totalMonthly).toLocaleString('no')} kr/mo</p>
          </div>
          <button className="add-recurring-btn" onClick={() => setShowForm(s => !s)}>
            {showForm ? '✕ Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="add-form card" onSubmit={handleSubmit}>
          <h2>New Recurring Expense</h2>
          <div className="form-grid">
            <label>
              Description
              <input type="text" placeholder="e.g. Netflix" value={form.description} onChange={e => setF('description', e.target.value)} required />
            </label>
            <label>
              Category
              <select value={form.category} onChange={e => setF('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Amount (kr)
              <input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setF('amount', e.target.value)} required />
            </label>
            <label>
              Frequency
              <select value={form.frequency} onChange={e => setF('frequency', e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label>
              Start Date
              <input type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} required />
            </label>
            <button type="submit" className="add-btn">Add Recurring</button>
          </div>
        </form>
      )}

      {recurring.length === 0 ? (
        <div className="card"><p className="empty">No recurring expenses set up yet.</p></div>
      ) : (
        <div className="recurring-list card">
          {recurring.map(rec => (
            <div key={rec.id} className={`recurring-row${!rec.active ? ' recurring-paused' : ''}`}>
              <div className="recurring-dot" style={{ background: CATEGORY_COLORS[rec.category] ?? '#94a3b8' }} />
              <div className="recurring-info">
                <span className="recurring-name">{rec.description}</span>
                <span className="recurring-meta">
                  <span className="badge" style={{ color: CATEGORY_COLORS[rec.category] ?? '#94a3b8', background: `${CATEGORY_COLORS[rec.category] ?? '#94a3b8'}18`, borderColor: `${CATEGORY_COLORS[rec.category] ?? '#94a3b8'}44` }}>{rec.category}</span>
                  <span className="recurring-freq">{FREQUENCY_LABELS[rec.frequency]}</span>
                </span>
              </div>
              <div className="recurring-amount-col">
                <span className="recurring-amount">{rec.amount.toLocaleString('no')} kr</span>
                <span className="recurring-monthly">~{Math.round(monthlyEquivalent(rec)).toLocaleString('no')} kr/mo</span>
              </div>
              <div className="recurring-actions">
                <button className="sort-btn" onClick={() => onToggle(rec.id, !rec.active)} title={rec.active ? 'Pause' : 'Resume'}>
                  {rec.active ? '⏸' : '▶'}
                </button>
                <button className="delete-btn" onClick={() => onDelete(rec.id)} title="Delete">&#215;</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Sparkline({ values, color }: { values: number[], color: string }) {
  const max = Math.max(...values, 1)
  const w = 56, h = 28, padX = 2
  const pts = values.map((v, i) => ({
    x: padX + (i / Math.max(values.length - 1, 1)) * (w - padX * 2),
    y: h - 4 - (v / max) * (h - 8),
  }))
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${lineD} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', flexShrink: 0 }}>
      <path d={areaD} fill={color} opacity={0.18} />
      <path d={lineD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

interface SpendingTrendsProps {
  expenses: Expense[]
  currentMonth: MonthState
}

function SpendingTrends({ expenses, currentMonth }: SpendingTrendsProps) {
  const months = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(currentMonth.year, currentMonth.month - 4 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }), [currentMonth])

  const currentYM = months[4]
  const prevYM = months[3]

  const byCategory = useMemo(() => {
    const result: Record<string, number[]> = {}
    for (const ym of months) {
      const monthExp = expenses.filter(e => e.date.startsWith(ym))
      const cats = new Set(monthExp.map(e => e.category))
      for (const cat of cats) {
        if (!result[cat]) result[cat] = new Array(5).fill(0)
      }
      monthExp.forEach(e => {
        if (!result[e.category]) result[e.category] = new Array(5).fill(0)
        result[e.category][months.indexOf(ym)] += e.amount
      })
    }
    return result
  }, [expenses, months])

  const categories = Object.keys(byCategory)
    .filter(cat => byCategory[cat][4] > 0 || byCategory[cat][3] > 0)
    .sort((a, b) => byCategory[b][4] - byCategory[a][4])

  if (categories.length === 0) return null

  const currentExpenses = expenses.filter(e => e.date.startsWith(currentYM))
  const prevExpenses = expenses.filter(e => e.date.startsWith(prevYM))
  const currentByCategory = currentExpenses.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amount; return acc }, {})
  const prevByCategory = prevExpenses.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amount; return acc }, {})

  return (
    <div className="trends-card card">
      <h2>Spending trends</h2>
      <p className="trends-subtitle">Per category vs last month, last 5 months</p>
      <div className="trends-list">
        {categories.map(cat => {
          const curr = currentByCategory[cat] ?? 0
          const prev = prevByCategory[cat] ?? 0
          const change = prev > 0 ? ((curr - prev) / prev) * 100 : null
          const color = CATEGORY_COLORS[cat] ?? '#94a3b8'
          const sparkValues = byCategory[cat]
          return (
            <div key={cat} className="trend-row">
              <span className="trend-dot" style={{ background: color }} />
              <span className="trend-cat">{cat}</span>
              <Sparkline values={sparkValues} color={color} />
              <span className="trend-amount">{curr.toFixed(0)} kr</span>
              {change !== null ? (
                <span className={`trend-change${change > 5 ? ' trend-up' : change < -5 ? ' trend-down' : ' trend-flat'}`}>
                  {change > 5 ? '↑' : change < -5 ? '↓' : '→'}{Math.abs(Math.round(change))}%
                </span>
              ) : curr > 0 ? (
                <span className="trend-change trend-new">new</span>
              ) : (
                <span className="trend-change trend-flat">—</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface YearViewProps {
  expenses: Expense[]
  incomes: Income[]
  currentYear: number
  currentMonth: MonthState
  onSelectMonth: (m: MonthState) => void
}

function YearView({ expenses, incomes, currentYear, currentMonth, onSelectMonth }: YearViewProps) {
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const now = new Date()
  const isCurrentYear = currentYear === now.getFullYear()

  const rows = useMemo(() => Array.from({ length: 12 }, (_, month) => {
    const ym = `${currentYear}-${String(month + 1).padStart(2, '0')}`
    const mExp = expenses.filter(e => e.date.startsWith(ym)).reduce((s, e) => s + e.amount, 0)
    const mInc = incomes.filter(i => i.date.startsWith(ym)).reduce((s, i) => s + i.amount, 0)
    const net = mInc - mExp
    const rate = mInc > 0 ? Math.round((net / mInc) * 100) : null
    const hasData = mExp > 0 || mInc > 0
    return { month, mExp, mInc, net, rate, hasData }
  }), [expenses, incomes, currentYear])

  const maxExp = Math.max(...rows.map(r => r.mExp), 1)
  const totalInc = rows.reduce((s, r) => s + r.mInc, 0)
  const totalExp = rows.reduce((s, r) => s + r.mExp, 0)
  const totalNet = totalInc - totalExp
  const totalRate = totalInc > 0 ? Math.round((totalNet / totalInc) * 100) : null

  function fmt(n: number) {
    if (n >= 10000) return `${(n / 1000).toFixed(0)}k`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return n.toFixed(0)
  }

  const chartData = rows.map(({ month, mExp, mInc }) => ({
    label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month],
    income: mInc || null,
    expenses: mExp || null,
  }))

  return (
    <div className="year-view card">
      <h2>{currentYear} at a glance</h2>
      <div className="year-chart">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text)' }} />
            <YAxis tickFormatter={formatYTick} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text)' }} width={36} tickCount={4} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            <Line type="monotone" dataKey="income" name="income" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, fill: '#10b981' }} />
            <Line type="monotone" dataKey="expenses" name="expenses" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, fill: 'var(--accent)' }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="year-chart-legend">
          <span className="year-legend-item"><span className="year-legend-dot" style={{ background: '#10b981' }} />Income</span>
          <span className="year-legend-item"><span className="year-legend-dot" style={{ background: 'var(--accent)' }} />Expenses</span>
        </div>
      </div>
      <div className="year-table">
        <div className="year-header">
          <span>Month</span>
          <span>Income</span>
          <span>Expenses</span>
          <span>Net</span>
          <span className="year-rate-col">Rate</span>
        </div>
        {rows.map(({ month, mExp, mInc, net, rate, hasData }) => {
          const isCurrent = isCurrentYear && month === now.getMonth()
            && currentMonth.year === now.getFullYear() && currentMonth.month === now.getMonth()
          const isSelected = currentMonth.year === currentYear && currentMonth.month === month
          const isFuture = isCurrentYear && month > now.getMonth()
          return (
            <button
              key={month}
              className={`year-row${isSelected ? ' year-row-selected' : ''}${isCurrent ? ' year-row-current' : ''}${isFuture && !hasData ? ' year-row-future' : ''}`}
              onClick={() => onSelectMonth({ year: currentYear, month })}
            >
              <span className="year-month">{MONTH_LABELS[month]}</span>
              {hasData ? (
                <>
                  <span className="year-income">{mInc > 0 ? fmt(mInc) : '—'}</span>
                  <span className="year-expense-cell">
                    <span className="year-bar-wrap">
                      <span className="year-bar" style={{ width: `${(mExp / maxExp * 100).toFixed(1)}%` }} />
                    </span>
                    <span className="year-expense-val">{mExp > 0 ? fmt(mExp) : '—'}</span>
                  </span>
                  <span className={`year-net${net >= 0 ? ' year-net-pos' : ' year-net-neg'}`}>
                    {net >= 0 ? '+' : ''}{fmt(Math.abs(net))}
                  </span>
                  <span className="year-rate-col year-rate">{rate !== null ? `${rate}%` : '—'}</span>
                </>
              ) : (
                <>
                  <span className="year-empty">—</span>
                  <span className="year-empty">—</span>
                  <span className="year-empty">—</span>
                  <span className="year-empty">—</span>
                </>
              )}
            </button>
          )
        })}
        <div className="year-total-row">
          <span className="year-month">Total</span>
          <span className="year-income">{fmt(totalInc)}</span>
          <span className="year-expense-cell">
            <span className="year-bar-wrap"><span className="year-bar" style={{ width: '100%' }} /></span>
            <span className="year-expense-val">{fmt(totalExp)}</span>
          </span>
          <span className={`year-net${totalNet >= 0 ? ' year-net-pos' : ' year-net-neg'}`}>
            {totalNet >= 0 ? '+' : ''}{fmt(Math.abs(totalNet))}
          </span>
          <span className="year-rate-col year-rate">{totalRate !== null ? `${totalRate}%` : '—'}</span>
        </div>
      </div>
    </div>
  )
}

// ── Forecast Card ───────────────────────────────────────────

interface ForecastCardProps {
  expenses: Expense[]
  incomes: Income[]
  recurringExpenses: RecurringExpense[]
  currentMonth: MonthState
}

function ForecastCard({ expenses, incomes, recurringExpenses, currentMonth }: ForecastCardProps) {
  const forecast = useMemo(
    () => computeForecast(expenses, incomes, recurringExpenses, currentMonth),
    [expenses, incomes, recurringExpenses, currentMonth]
  )

  if (!forecast) return null

  const overspendAmt = forecast.projectedNet < 0 ? Math.abs(forecast.projectedNet) : null
  const savingAmt = forecast.projectedNet >= 0 ? forecast.projectedNet : null

  return (
    <div className="forecast-card card">
      <div className="forecast-header">
        <span className="forecast-title">End-of-month forecast</span>
        <span className="forecast-meta">{forecast.daysElapsed} of {forecast.daysInMonth} days</span>
      </div>
      <div className="forecast-body">
        <div className="forecast-main">
          <span className="forecast-label">Projected spend</span>
          <span className="forecast-value">{Math.round(forecast.projectedExpenses).toLocaleString('no')} kr</span>
        </div>
        <div className={`forecast-outcome${overspendAmt ? ' forecast-over' : ' forecast-ok'}`}>
          {overspendAmt
            ? `You're on track to overspend by ${Math.round(overspendAmt).toLocaleString('no')} kr`
            : `You're on track to save ${Math.round(savingAmt!).toLocaleString('no')} kr`}
        </div>
      </div>
      <div className="forecast-footer">
        <span className="forecast-rate">{Math.round(forecast.dailyRate).toLocaleString('no')} kr/day avg</span>
        <span className={`forecast-cashflow${forecast.next30Cashflow < 0 ? ' forecast-over' : ''}`}>
          30-day cashflow: {forecast.next30Cashflow >= 0 ? '+' : ''}{Math.round(forecast.next30Cashflow).toLocaleString('no')} kr
        </span>
      </div>
    </div>
  )
}

// ── Smart Insights Card ──────────────────────────────────────

interface SmartInsightsCardProps {
  expenses: Expense[]
  incomes: Income[]
  recurringExpenses: RecurringExpense[]
  currentMonth: MonthState
}

function SmartInsightsCard({ expenses, incomes, recurringExpenses, currentMonth }: SmartInsightsCardProps) {
  const insights = useMemo(
    () => computeInsights(expenses, incomes, recurringExpenses, currentMonth),
    [expenses, incomes, recurringExpenses, currentMonth]
  )

  if (insights.length === 0) return null

  return (
    <div className="insights-card card">
      <h2>Smart insights</h2>
      <div className="insights-list">
        {insights.map((ins, i) => (
          <div key={i} className={`insight-row insight-${ins.type}`}>
            <span className="insight-icon">{ins.icon}</span>
            <div className="insight-content">
              <span className="insight-title">{ins.title}</span>
              <span className="insight-body">{ins.body}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface OverviewStatsCardProps {
  expenses: Expense[]
  incomes: Income[]
  budgets: Record<string, number>
  currentMonth: MonthState
}

function OverviewStatsCard({ expenses, incomes, budgets, currentMonth }: OverviewStatsCardProps) {
  function monthTotals(year: number, month: number) {
    const exp = expenses.filter(e => {
      const d = new Date(e.date + 'T00:00:00')
      return d.getFullYear() === year && d.getMonth() === month
    })
    const inc = incomes.filter(i => {
      const d = new Date(i.date + 'T00:00:00')
      return d.getFullYear() === year && d.getMonth() === month
    })
    const totalExp = exp.reduce((s, e) => s + e.amount, 0)
    const totalInc = inc.reduce((s, i) => s + i.amount, 0)
    const byCategory = exp.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount
      return acc
    }, {})
    return { totalExp, totalInc, byCategory }
  }

  const prevDate = new Date(currentMonth.year, currentMonth.month - 1)
  const curr = monthTotals(currentMonth.year, currentMonth.month)
  const prev = monthTotals(prevDate.getFullYear(), prevDate.getMonth())

  const spendDelta = prev.totalExp > 0 ? ((curr.totalExp - prev.totalExp) / prev.totalExp) * 100 : null
  const categoryDeltas = CATEGORIES.map(cat => ({
    cat,
    delta: (curr.byCategory[cat] ?? 0) - (prev.byCategory[cat] ?? 0),
  })).filter(x => Math.abs(x.delta) > 0.5).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const topIncrease = categoryDeltas.find(x => x.delta > 0)
  const topDecrease = categoryDeltas.find(x => x.delta < 0)

  const savingsRate = curr.totalInc > 0 ? Math.round(((curr.totalInc - curr.totalExp) / curr.totalInc) * 100) : null

  let savingsStreak = 0
  let budgetStreak = 0
  const totalBudgeted = Object.values(budgets).reduce((s, v) => s + v, 0)
  for (let i = 1; i <= 12; i++) {
    const d = new Date(currentMonth.year, currentMonth.month - i)
    const m = monthTotals(d.getFullYear(), d.getMonth())
    if (m.totalInc > 0 && m.totalInc > m.totalExp) savingsStreak++
    else break
  }
  if (totalBudgeted > 0) {
    for (let i = 1; i <= 12; i++) {
      const d = new Date(currentMonth.year, currentMonth.month - i)
      const m = monthTotals(d.getFullYear(), d.getMonth())
      if (m.totalExp > 0 && m.totalExp <= totalBudgeted) budgetStreak++
      else break
    }
  }

  const hasData = curr.totalExp > 0 || curr.totalInc > 0

  if (!hasData && savingsStreak === 0 && budgetStreak === 0) return null

  return (
    <div className="stats-card card">
      <div className="stats-grid">
        <div className="stats-col">
          <p className="stats-label">vs Last Month</p>
          {spendDelta !== null ? (
            <>
              <p className={`stats-delta ${spendDelta > 0 ? 'delta-up' : 'delta-down'}`}>
                {spendDelta > 0 ? '↑' : '↓'} {Math.abs(Math.round(spendDelta))}% spending
              </p>
              {topIncrease && (
                <p className="stats-detail"><span className="delta-up">↑</span> {topIncrease.cat} +{Math.round(topIncrease.delta).toLocaleString('no')} kr</p>
              )}
              {topDecrease && (
                <p className="stats-detail"><span className="delta-down">↓</span> {topDecrease.cat} {Math.round(topDecrease.delta).toLocaleString('no')} kr</p>
              )}
            </>
          ) : (
            <p className="stats-detail">No data last month</p>
          )}
        </div>

        <div className="stats-col">
          <p className="stats-label">Savings Rate</p>
          {savingsRate !== null ? (
            <>
              <p className={`stats-delta ${savingsRate >= 0 ? 'delta-down' : 'delta-up'}`}>{savingsRate}%</p>
              <div className="savings-rate-bar">
                <div
                  className="savings-rate-fill"
                  style={{
                    width: `${Math.min(Math.max(savingsRate, 0), 100)}%`,
                    background: savingsRate >= 20 ? '#10b981' : savingsRate >= 0 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
            </>
          ) : (
            <p className="stats-detail">Add income to track</p>
          )}
        </div>
      </div>

      {(savingsStreak > 0 || budgetStreak > 0) && (
        <div className="stats-streaks">
          {savingsStreak > 0 && (
            <span className="streak-badge">
              💚 Saving {savingsStreak} month{savingsStreak > 1 ? 's' : ''} in a row
            </span>
          )}
          {budgetStreak > 0 && (
            <span className="streak-badge">
              🎯 Under budget {budgetStreak} month{budgetStreak > 1 ? 's' : ''} in a row
            </span>
          )}
        </div>
      )}
    </div>
  )
}

interface ProfileTabProps {
  expenses: Expense[]
  incomes: Income[]
  budgets: Record<string, number>
  recurringExpenses: RecurringExpense[]
  session: Session | null
  guestMode: boolean
}

function ProfileTab({ expenses, incomes, budgets, recurringExpenses, session, guestMode: _guestMode }: ProfileTabProps) {
  const { unlocked, totalXP, level, nextLevel, progressPct, trackedMonths, bestSavingsRate, longestSavingsStreak } = useMemo(
    () => computeAchievements(expenses, incomes, budgets, recurringExpenses),
    [expenses, incomes, budgets, recurringExpenses]
  )

  const email = session?.user?.email ?? 'Guest'
  const initial = email[0].toUpperCase()
  const unlockedCount = unlocked.size
  const categories = [...new Set(ACHIEVEMENT_DEFS.map(a => a.category))]

  return (
    <div className="profile-tab">
      {/* Header */}
      <div className="profile-header card">
        <div className="profile-avatar" style={{ background: `linear-gradient(135deg, ${level.color}cc, ${level.color})` }}>
          {initial}
        </div>
        <div className="profile-info">
          <p className="profile-email">{email}</p>
          <span className="profile-level-badge" style={{ color: level.color, borderColor: `${level.color}44`, background: `${level.color}15` }}>
            {level.name}
          </span>
        </div>
      </div>

      {/* XP / Level progress */}
      <div className="profile-xp card">
        <div className="xp-header">
          <span className="xp-label">{totalXP} XP · {unlockedCount}/{ACHIEVEMENT_DEFS.length} achievements</span>
          {nextLevel && <span className="xp-next">{nextLevel.minXP - totalXP} XP to {nextLevel.name}</span>}
        </div>
        <div className="xp-bar-track">
          <div className="xp-bar-fill" style={{ width: `${progressPct}%`, background: level.color }} />
        </div>
        <div className="xp-level-labels">
          <span style={{ color: level.color }}>{level.name}</span>
          {nextLevel && <span>{nextLevel.name}</span>}
        </div>
      </div>

      {/* Stats */}
      <div className="profile-stats card">
        <h2>Stats</h2>
        <div className="profile-stats-grid">
          <div className="profile-stat">
            <span className="profile-stat-value">{trackedMonths}</span>
            <span className="profile-stat-label">Months tracked</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{longestSavingsStreak}</span>
            <span className="profile-stat-label">Best saving streak</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">
              {bestSavingsRate !== null ? `${Math.round(bestSavingsRate)}%` : '—'}
            </span>
            <span className="profile-stat-label">Best savings rate</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{recurringExpenses.filter(r => r.active).length}</span>
            <span className="profile-stat-label">Recurring set up</span>
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div className="profile-achievements card">
        <h2>Achievements</h2>
        {categories.map(cat => (
          <div key={cat} className="achievement-category">
            <p className="achievement-cat-label">{cat}</p>
            <div className="achievement-grid">
              {ACHIEVEMENT_DEFS.filter(a => a.category === cat).map(a => {
                const done = unlocked.has(a.id)
                return (
                  <div key={a.id} className={`achievement-item${done ? ' achievement-unlocked' : ' achievement-locked'}`} title={a.description}>
                    <span className="achievement-icon">{a.icon}</span>
                    <span className="achievement-name">{a.name}</span>
                    <span className="achievement-desc">{a.description}</span>
                    <span className="achievement-xp">+{a.xp} XP</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Goals Tab ────────────────────────────────────────────────

const GOAL_ICONS = ['🎯', '✈️', '🏠', '🚗', '💻', '📱', '🎓', '💍', '🏖️', '🏋️', '🎸', '💰']
const GOAL_COLORS = ['#4f7c62', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#10b981', '#f97316']

interface GoalsTabProps {
  session: Session | null
  guestMode: boolean
}

function GoalsTab({ session, guestMode }: GoalsTabProps) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [showForm, setShowForm] = useState(false)
  const [contributing, setContributing] = useState<string | null>(null)
  const [contributionAmount, setContributionAmount] = useState('')
  const [form, setForm] = useState({ name: '', target_amount: '', deadline: '', icon: '🎯', color: '#4f7c62' })

  useEffect(() => {
    if (guestMode || !session) { setGoals([]); return }
    supabase.from('goals').select('*').order('created_at', { ascending: true }).then(({ data, error }) => {
      if (!error) setGoals((data ?? []) as Goal[])
    })
  }, [session, guestMode])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const target = parseFloat(form.target_amount)
    if (!form.name || isNaN(target) || target <= 0) return
    if (guestMode || !session) return

    const { data, error } = await supabase
      .from('goals')
      .insert({ user_id: session.user.id, name: form.name, target_amount: target, current_amount: 0, deadline: form.deadline || null, icon: form.icon, color: form.color })
      .select().single()
    if (error) { console.error(error); return }
    setGoals(prev => [...prev, data as Goal])
    setForm({ name: '', target_amount: '', deadline: '', icon: '🎯', color: '#4f7c62' })
    setShowForm(false)
  }

  async function handleContribute(goal: Goal) {
    const amount = parseFloat(contributionAmount)
    if (isNaN(amount) || amount <= 0) return
    const newAmount = Math.min(goal.current_amount + amount, goal.target_amount)
    const { data, error } = await supabase.from('goals').update({ current_amount: newAmount }).eq('id', goal.id).select().single()
    if (error) { console.error(error); return }
    setGoals(prev => prev.map(g => g.id === goal.id ? data as Goal : g))
    setContributing(null)
    setContributionAmount('')
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (error) { console.error(error); return }
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  function deadlineLabel(deadline?: string | null): string {
    if (!deadline) return ''
    const diff = Math.ceil((new Date(deadline + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return 'Overdue'
    if (diff === 0) return 'Due today'
    if (diff === 1) return '1 day left'
    return `${diff} days left`
  }

  if (guestMode) {
    return (
      <div className="goals-tab">
        <div className="card">
          <p className="empty">Sign in to track your goals across devices.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="goals-tab">
      <div className="goals-header">
        <h2 style={{ margin: 0 }}>Goals</h2>
        <button className="add-btn" style={{ width: 'auto', padding: '8px 18px' }} onClick={() => setShowForm(f => !f)}>
          {showForm ? 'Cancel' : '+ New Goal'}
        </button>
      </div>

      {showForm && (
        <form className="add-form card" onSubmit={handleAdd}>
          <h2>New Goal</h2>
          <div className="form-grid">
            <label style={{ gridColumn: '1 / -1' }}>
              Goal name
              <input type="text" placeholder="e.g. Travel to Japan" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </label>
            <label>
              Target amount (kr)
              <input type="number" min="1" step="1" placeholder="50000" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} required />
            </label>
            <label>
              Deadline <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 500 }}>Icon</p>
              <div className="goal-icon-picker">
                {GOAL_ICONS.map(icon => (
                  <button type="button" key={icon} className={`goal-icon-btn${form.icon === icon ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, icon }))}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 500 }}>Colour</p>
              <div className="goal-color-picker">
                {GOAL_COLORS.map(color => (
                  <button type="button" key={color} className={`goal-color-btn${form.color === color ? ' selected' : ''}`} style={{ background: color }} onClick={() => setForm(f => ({ ...f, color }))} />
                ))}
              </div>
            </div>
            <button type="submit" className="add-btn" style={{ gridColumn: '1 / -1' }}>Create Goal</button>
          </div>
        </form>
      )}

      {goals.length === 0 ? (
        <div className="card"><p className="empty">No goals yet. Create one to start tracking your savings targets.</p></div>
      ) : (
        <div className="goals-list">
          {goals.map(goal => {
            const pct = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0
            const done = pct >= 100
            const dlLabel = deadlineLabel(goal.deadline)
            const dlOverdue = dlLabel === 'Overdue'
            return (
              <div key={goal.id} className={`goal-card card${done ? ' goal-done' : ''}`}>
                <div className="goal-card-header">
                  <span className="goal-icon">{goal.icon}</span>
                  <div className="goal-info">
                    <span className="goal-name">{goal.name}</span>
                    {dlLabel && <span className={`goal-deadline${dlOverdue ? ' goal-overdue' : ''}`}>{dlLabel}</span>}
                  </div>
                  <button className="delete-btn" onClick={() => handleDelete(goal.id)} style={{ marginLeft: 'auto' }}>&#215;</button>
                </div>
                <div className="goal-progress-row">
                  <span className="goal-amounts">
                    <span style={{ fontWeight: 700, fontSize: 18 }}>{Math.round(goal.current_amount).toLocaleString('no')}</span>
                    <span style={{ opacity: 0.5 }}> / {Math.round(goal.target_amount).toLocaleString('no')} kr</span>
                  </span>
                  <span className="goal-pct" style={{ color: goal.color }}>{Math.round(pct)}%</span>
                </div>
                <div className="goal-bar-track">
                  <div className="goal-bar-fill" style={{ width: `${pct.toFixed(1)}%`, background: done ? '#10b981' : goal.color }} />
                </div>
                {done ? (
                  <p className="goal-done-label">🎉 Goal reached!</p>
                ) : contributing === goal.id ? (
                  <div className="goal-contribute-row">
                    <input
                      type="number" min="1" step="1" placeholder="Amount (kr)" autoFocus
                      value={contributionAmount}
                      onChange={e => setContributionAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleContribute(goal); if (e.key === 'Escape') { setContributing(null); setContributionAmount('') } }}
                    />
                    <button className="save-btn" onClick={() => handleContribute(goal)}>&#10003;</button>
                    <button className="cancel-btn" onClick={() => { setContributing(null); setContributionAmount('') }}>&#10005;</button>
                  </div>
                ) : (
                  <button className="goal-contribute-btn" style={{ borderColor: goal.color, color: goal.color }} onClick={() => { setContributing(goal.id); setContributionAmount('') }}>
                    + Add contribution
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type MobileTab = 'overview' | 'expenses' | 'income' | 'budgets' | 'recurring' | 'goals' | 'profile'

type SidebarProps = {
  active: MobileTab
  onChange: (t: MobileTab) => void
  session: Session | null
  guestMode: boolean
  onSignOut: () => void
  onSignIn: () => void
}

function Sidebar({ active, onChange, session, guestMode, onSignOut, onSignIn }: SidebarProps) {
  const items: { tab: MobileTab; label: string; icon: React.ReactNode }[] = [
    { tab: 'overview', label: 'Overview', icon: <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg> },
    { tab: 'expenses', label: 'Expenses', icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" /><path d="M10 6.5v7M7.5 11l2.5 2.5 2.5-2.5" /></svg> },
    { tab: 'income', label: 'Income', icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" /><path d="M10 13.5v-7M7.5 9l2.5-2.5L12.5 9" /></svg> },
    { tab: 'budgets', label: 'Budgets', icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true"><path d="M3 16h14M5 16V10m4 6V6m4 10V8m4 8V4" /></svg> },
    { tab: 'recurring', label: 'Recurring', icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true"><path d="M4 10a6 6 0 116 6" /><path d="M4 6v4h4" /></svg> },
    { tab: 'goals', label: 'Goals', icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/><line x1="10" y1="1" x2="10" y2="3"/></svg> },
    { tab: 'profile', label: 'Profile', icon: <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg> },
  ]
  return (
    <nav className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <Logo size={22} />
          <span className="sidebar-brand-name">Sage</span>
        </div>
        <div className="sidebar-nav">
          {items.map(({ tab, label, icon }) => (
            <button
              key={tab}
              className={`sidebar-nav-item${active === tab ? ' sidebar-nav-active' : ''}`}
              onClick={() => onChange(tab)}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="sidebar-bottom">
        {guestMode ? (
          <button className="sidebar-signout" onClick={onSignIn}>Sign in to save data</button>
        ) : session ? (
          <button className="sidebar-signout" onClick={onSignOut}>Sign out</button>
        ) : null}
      </div>
    </nav>
  )
}

function MobileTabBar({ active, onChange }: { active: MobileTab; onChange: (t: MobileTab) => void }) {
  return (
    <nav className="tab-bar">
      <button className={`tab-btn${active === 'overview' ? ' tab-active' : ''}`} onClick={() => onChange('overview')}>
        <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22" aria-hidden="true">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
        <span>Overview</span>
      </button>
      <button className={`tab-btn${active === 'expenses' ? ' tab-active' : ''}`} onClick={() => onChange('expenses')}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6.5v7M7.5 11l2.5 2.5 2.5-2.5" />
        </svg>
        <span>Expenses</span>
      </button>
      <button className={`tab-btn${active === 'income' ? ' tab-active' : ''}`} onClick={() => onChange('income')}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 13.5v-7M7.5 9l2.5-2.5L12.5 9" />
        </svg>
        <span>Income</span>
      </button>
      <button className={`tab-btn${active === 'budgets' ? ' tab-active' : ''}`} onClick={() => onChange('budgets')}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
          <path d="M3 16h14M5 16V10m4 6V6m4 10V8m4 8V4" />
        </svg>
        <span>Budgets</span>
      </button>
      <button className={`tab-btn${active === 'recurring' ? ' tab-active' : ''}`} onClick={() => onChange('recurring')}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
          <path d="M4 10a6 6 0 116 6" />
          <path d="M4 6v4h4" />
        </svg>
        <span>Recurring</span>
      </button>
      <button className={`tab-btn${active === 'goals' ? ' tab-active' : ''}`} onClick={() => onChange('goals')}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
          <circle cx="10" cy="10" r="7"/>
          <circle cx="10" cy="10" r="3"/>
          <line x1="10" y1="1" x2="10" y2="3"/>
        </svg>
        <span>Goals</span>
      </button>
      <button className={`tab-btn${active === 'profile' ? ' tab-active' : ''}`} onClick={() => onChange('profile')}>
        <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22" aria-hidden="true">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
        <span>Profile</span>
      </button>
    </nav>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [guestMode, setGuestMode] = useState(false)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])
  const sessionApplied = useRef(new Set<string>())
  const [activeTab, setActiveTab] = useState<MobileTab>('overview')
  const [currentMonth, setCurrentMonth] = useState<MonthState>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (guestMode || !session) { setExpenses([]); setIncomes([]); setBudgets({}); setRecurringExpenses([]); return }
      const [expensesRes, incomesRes, budgetsRes, recurringRes] = await Promise.all([
        supabase.from('expenses').select('*'),
        supabase.from('incomes').select('*'),
        supabase.from('budgets').select('category, amount'),
        supabase.from('recurring_expenses').select('*').eq('active', true),
      ])
      if (!cancelled) {
        if (!expensesRes.error) {
          const expData = expensesRes.data ?? []
          setExpenses(expData)
          // Pre-populate sessionApplied so we don't re-insert existing occurrences
          for (const e of expData) {
            if (e.recurring_id) sessionApplied.current.add(`${e.recurring_id}:${e.date}`)
          }
        }
        if (!incomesRes.error) setIncomes(incomesRes.data ?? [])
        if (!budgetsRes.error) {
          const map: Record<string, number> = {}
          for (const row of budgetsRes.data ?? []) map[row.category] = row.amount
          setBudgets(map)
        }
        if (!recurringRes.error) setRecurringExpenses(recurringRes.data ?? [])
      }
    })()
    return () => { cancelled = true }
  }, [session, guestMode])

  async function setBudgetForCategory(category: string, amount: number) {
    setBudgets(prev => ({ ...prev, [category]: amount }))
    if (guestMode || !session) return
    const { error } = await supabase
      .from('budgets')
      .upsert({ user_id: session.user.id, category, amount }, { onConflict: 'user_id,category' })
    if (error) console.error(error)
  }

  useEffect(() => {
    let cancelled = false
    if (!session || guestMode || recurringExpenses.length === 0) return
    ;(async () => {
      const newExpenses: Expense[] = []
      for (const rec of recurringExpenses.filter(r => r.active)) {
        const dates = getOccurrencesInMonth(rec, currentMonth.year, currentMonth.month)
        for (const date of dates) {
          const key = `${rec.id}:${date}`
          if (sessionApplied.current.has(key)) continue
          sessionApplied.current.add(key)
          const { data, error } = await supabase
            .from('expenses')
            .insert({ user_id: session.user.id, description: rec.description, category: rec.category, amount: rec.amount, date, recurring_id: rec.id })
            .select()
            .single()
          if (!error && data && !cancelled) newExpenses.push(data as Expense)
        }
      }
      if (!cancelled && newExpenses.length > 0) setExpenses(prev => [...prev, ...newExpenses])
    })()
    return () => { cancelled = true }
  }, [currentMonth.year, currentMonth.month, recurringExpenses, session, guestMode])

  function prevMonth() {
    setCurrentMonth(({ year, month }) => {
      const d = new Date(year, month - 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  function nextMonth() {
    setCurrentMonth(({ year, month }) => {
      const d = new Date(year, month + 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  async function handleAddExpense(expense: Omit<Expense, 'id' | 'user_id' | 'created_at'>) {
    if (guestMode) {
      setExpenses(prev => [...prev, { ...expense, id: crypto.randomUUID() }])
      const d = new Date(expense.date + 'T00:00:00')
      setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
      return
    }
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, user_id: session!.user.id })
      .select()
      .single()
    if (error) { console.error(error); return }
    setExpenses(prev => [...prev, data])
    const d = new Date(expense.date + 'T00:00:00')
    setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
  }

  async function handleAddIncome(income: Omit<Income, 'id' | 'user_id' | 'created_at'>) {
    if (guestMode) {
      setIncomes(prev => [...prev, { ...income, id: crypto.randomUUID() }])
      const d = new Date(income.date + 'T00:00:00')
      setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
      return
    }
    const { data, error } = await supabase
      .from('incomes')
      .insert({ ...income, user_id: session!.user.id })
      .select()
      .single()
    if (error) { console.error(error); return }
    setIncomes(prev => [...prev, data])
    const d = new Date(income.date + 'T00:00:00')
    setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() })
  }

  async function handleDeleteExpense(id: string) {
    if (guestMode) {
      setExpenses(prev => prev.filter(e => e.id !== id))
      return
    }
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { console.error(error); return }
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  async function handleDeleteIncome(id: string) {
    if (guestMode) {
      setIncomes(prev => prev.filter(i => i.id !== id))
      return
    }
    const { error } = await supabase.from('incomes').delete().eq('id', id)
    if (error) { console.error(error); return }
    setIncomes(prev => prev.filter(i => i.id !== id))
  }

  async function handleEditExpense(id: string, updates: Omit<Expense, 'id' | 'user_id' | 'created_at'>) {
    if (guestMode) {
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
      return
    }
    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error(error); return }
    setExpenses(prev => prev.map(e => e.id === id ? data : e))
  }

  async function handleEditIncome(id: string, updates: Omit<Income, 'id' | 'user_id' | 'created_at'>) {
    if (guestMode) {
      setIncomes(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
      return
    }
    const { data, error } = await supabase
      .from('incomes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error(error); return }
    setIncomes(prev => prev.map(i => i.id === id ? data : i))
  }

  async function handleAddRecurring(rec: Omit<RecurringExpense, 'id' | 'user_id' | 'created_at'>) {
    if (guestMode || !session) return
    const { data, error } = await supabase
      .from('recurring_expenses')
      .insert({ ...rec, user_id: session.user.id })
      .select()
      .single()
    if (error) { console.error(error); return }
    setRecurringExpenses(prev => [...prev, data as RecurringExpense])
  }

  async function handleDeleteRecurring(id: string) {
    if (guestMode || !session) return
    const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
    if (error) { console.error(error); return }
    setRecurringExpenses(prev => prev.filter(r => r.id !== id))
  }

  async function handleToggleRecurring(id: string, active: boolean) {
    if (guestMode || !session) return
    const { error } = await supabase.from('recurring_expenses').update({ active }).eq('id', id)
    if (error) { console.error(error); return }
    setRecurringExpenses(prev => prev.map(r => r.id === id ? { ...r, active } : r))
  }

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.date + 'T00:00:00')
    return d.getFullYear() === currentMonth.year && d.getMonth() === currentMonth.month
  })

  const monthIncomes = incomes.filter(i => {
    const d = new Date(i.date + 'T00:00:00')
    return d.getFullYear() === currentMonth.year && d.getMonth() === currentMonth.month
  })

  const chartData = useMemo<ChartEntry[]>(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i)
      const year = d.getFullYear()
      const month = d.getMonth()
      const label = d.toLocaleString('default', { month: 'short' })
      const expensesTotal = expenses
        .filter(e => {
          const ed = new Date(e.date + 'T00:00:00')
          return ed.getFullYear() === year && ed.getMonth() === month
        })
        .reduce((sum, e) => sum + e.amount, 0)
      const incomeTotal = incomes
        .filter(inc => {
          const id = new Date(inc.date + 'T00:00:00')
          return id.getFullYear() === year && id.getMonth() === month
        })
        .reduce((sum, inc) => sum + inc.amount, 0)
      const isCurrent = year === now.getFullYear() && month === now.getMonth()
      return { label, expenses: expensesTotal, income: incomeTotal, isCurrent }
    })
  }, [expenses, incomes])

  const now = new Date()
  const isCurrentMonth = currentMonth.year === now.getFullYear() && currentMonth.month === now.getMonth()
  const defaultDay = isCurrentMonth ? now.getDate() : 1
  const defaultDate = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(defaultDay).padStart(2, '0')}`

  const totalMonthExpenses = monthExpenses.reduce((s, e) => s + e.amount, 0)
  const totalMonthIncome = monthIncomes.reduce((s, i) => s + i.amount, 0)
  const netSavings = totalMonthIncome - totalMonthExpenses
  const animExpenses = useCountUp(totalMonthExpenses)
  const animIncome = useCountUp(totalMonthIncome)
  const animNet = useCountUp(Math.abs(netSavings))

  if (authLoading) return null
  if (!session && !guestMode) return <Auth onContinueAsGuest={() => setGuestMode(true)} />

  return (
    <div className="app-shell">
      <Sidebar
        active={activeTab}
        onChange={setActiveTab}
        session={session}
        guestMode={guestMode}
        onSignOut={() => supabase.auth.signOut()}
        onSignIn={() => setGuestMode(false)}
      />
      <div className="app-content">
        <div className="app">
          {guestMode && (
            <div className="guest-banner">
              You're browsing as a guest — data won't be saved.{' '}
              <button onClick={() => setGuestMode(false)}>Sign in to save your data</button>
            </div>
          )}
          <div className="app-header">
            <div className="app-brand">
              <Logo size={28} />
              <span className="app-name">Sage</span>
            </div>
            {guestMode ? (
              <button className="signout-btn" onClick={() => setGuestMode(false)}>Sign in</button>
            ) : (
              <button className="signout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
            )}
          </div>
          <MonthNav currentMonth={currentMonth} onPrev={prevMonth} onNext={nextMonth} />
          <div className={`content-overview${activeTab !== 'overview' ? ' mobile-hidden' : ''}`}>
            <BalanceCard totalIncome={totalMonthIncome} totalExpenses={totalMonthExpenses} />
            <ForecastCard expenses={expenses} incomes={incomes} recurringExpenses={recurringExpenses} currentMonth={currentMonth} />
            <div className="overview-kpi-row">
              <div className="kpi-card card">
                <span className="kpi-label">Monthly Expenses</span>
                <span className="kpi-value">{animExpenses.toFixed(2)} kr</span>
              </div>
              <div className="kpi-card card">
                <span className="kpi-label">Monthly Income</span>
                <span className="kpi-value kpi-income">{animIncome.toFixed(2)} kr</span>
              </div>
              <div className="kpi-card card">
                <span className="kpi-label">Net Savings</span>
                <span className={`kpi-value${netSavings >= 0 ? ' kpi-positive' : ' kpi-negative'}`}>
                  {netSavings >= 0 ? '+' : ''}{animNet.toFixed(2)} kr
                </span>
              </div>
            </div>
            <div className="charts-row">
              <SpendingChart data={chartData} />
              <CategoryPieChart expenses={monthExpenses} />
            </div>
            <OverviewStatsCard
              expenses={expenses}
              incomes={incomes}
              budgets={budgets}
              currentMonth={currentMonth}
            />
            <SmartInsightsCard expenses={expenses} incomes={incomes} recurringExpenses={recurringExpenses} currentMonth={currentMonth} />
            <SpendingTrends expenses={expenses} currentMonth={currentMonth} />
            <YearView
              expenses={expenses}
              incomes={incomes}
              currentYear={currentMonth.year}
              currentMonth={currentMonth}
              onSelectMonth={setCurrentMonth}
            />
          </div>
          <div className={`layout${activeTab !== 'overview' ? ' layout-full' : ''}`}>
            <aside className={activeTab !== 'overview' ? 'mobile-hidden' : ''}>
              <Summary
                expenses={monthExpenses}
                incomes={monthIncomes}
                budgets={budgets}
                onSetBudget={setBudgetForCategory}
              />
            </aside>
            <main>
              <div className={`tab-section${activeTab !== 'expenses' ? ' mobile-hidden' : ''}`}>
                <AddExpenseForm onAdd={handleAddExpense} defaultDate={defaultDate} />
                <ExpenseList expenses={monthExpenses} onDelete={handleDeleteExpense} onEdit={handleEditExpense} />
              </div>
              <div className={`tab-section${activeTab !== 'income' ? ' mobile-hidden' : ''}`}>
                <AddIncomeForm onAdd={handleAddIncome} defaultDate={defaultDate} />
                <IncomeList incomes={monthIncomes} onDelete={handleDeleteIncome} onEdit={handleEditIncome} />
              </div>
            </main>
          </div>
          <div className={`budgets-wrapper${activeTab !== 'budgets' ? ' mobile-hidden' : ''}`}>
            <BudgetsSection
              expenses={expenses}
              monthIncomes={monthIncomes}
              budgets={budgets}
              onSetBudget={setBudgetForCategory}
              currentMonth={currentMonth}
            />
          </div>
          <div className={`recurring-wrapper${activeTab !== 'recurring' ? ' mobile-hidden' : ''}`}>
            <RecurringSection
              recurring={recurringExpenses}
              onAdd={handleAddRecurring}
              onDelete={handleDeleteRecurring}
              onToggle={handleToggleRecurring}
            />
          </div>
          <div className={`goals-wrapper${activeTab !== 'goals' ? ' mobile-hidden' : ''}`}>
            <GoalsTab session={session} guestMode={guestMode} />
          </div>
          <div className={`profile-wrapper${activeTab !== 'profile' ? ' mobile-hidden' : ''}`}>
            <ProfileTab
              expenses={expenses}
              incomes={incomes}
              budgets={budgets}
              recurringExpenses={recurringExpenses}
              session={session}
              guestMode={guestMode}
            />
          </div>
        </div>
      </div>
      <MobileTabBar active={activeTab} onChange={setActiveTab} />
    </div>
  )
}
