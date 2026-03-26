import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Logo from './Logo'
import { getInsights } from './insights'
import type { ExpenseSummary } from './insights'
import './App.css'

interface Expense {
  id: string
  date: string
  description: string
  category: string
  amount: number
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

interface MonthState {
  year: number
  month: number
}

interface ChartEntry {
  label: string
  expenses: number
  income: number
  isCurrent: boolean
}

const CATEGORIES = ['Groceries', 'Dining', 'Drinks', 'Transport', 'Housing', 'Entertainment', 'Health', 'Clothes', 'Shopping', 'Savings', 'Other']

const CATEGORY_COLORS: Record<string, string> = {
  Groceries:     '#22c55e',
  Dining:        '#f97316',
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
      <h1>{label}</h1>
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
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-card-icon stat-icon-income">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 10.5 5.5 7l3 3L14 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11 4h3v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="stat-card-label">Income</span>
          <span className="stat-card-value income-total">{totalIncome.toFixed(2)} kr</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon stat-icon-expense">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 5.5 5.5 9l3-3L14 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11 12h3V9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="stat-card-label">Expenses</span>
          <span className="stat-card-value total-amount">{totalExpenses.toFixed(2)} kr</span>
        </div>
        <div className="stat-card">
          <div className={`stat-card-icon ${net >= 0 ? 'stat-icon-net-pos' : 'stat-icon-net-neg'}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5"/>
              {net >= 0
                ? <path d="M8 11V5M5.5 7.5L8 5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="M8 5v6M5.5 8.5L8 11l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              }
            </svg>
          </div>
          <span className="stat-card-label">Net</span>
          <span className={`stat-card-value ${net >= 0 ? 'net-positive' : 'net-negative'}`}>
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

type MobileTab = 'overview' | 'expenses' | 'income' | 'budgets'
type EntryMode = 'expense' | 'income'

interface AddEntryFormProps {
  onAddExpense: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at'>) => void
  onAddIncome: (income: Omit<Income, 'id' | 'user_id' | 'created_at'>) => void
  defaultDate: string
  activeTab: MobileTab
}

function AddEntryForm({ onAddExpense, onAddIncome, defaultDate, activeTab }: AddEntryFormProps) {
  const [mode, setMode] = useState<EntryMode>(activeTab === 'income' ? 'income' : 'expense')
  const [expenseForm, setExpenseForm] = useState({ date: defaultDate, description: '', category: CATEGORIES[0], amount: '' })
  const [incomeForm, setIncomeForm] = useState({ date: defaultDate, description: '', source: INCOME_SOURCES[0], amount: '' })

  useEffect(() => {
    if (activeTab === 'income') setMode('income')
    else if (activeTab === 'expenses') setMode('expense')
  }, [activeTab])

  const isIncome = mode === 'income'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isIncome) {
      const amount = parseFloat(incomeForm.amount)
      if (!incomeForm.date || !incomeForm.description || isNaN(amount) || amount <= 0) return
      onAddIncome({ ...incomeForm, amount })
      setIncomeForm({ date: defaultDate, description: '', source: INCOME_SOURCES[0], amount: '' })
    } else {
      const amount = parseFloat(expenseForm.amount)
      if (!expenseForm.date || !expenseForm.description || isNaN(amount) || amount <= 0) return
      onAddExpense({ ...expenseForm, amount })
      setExpenseForm({ date: defaultDate, description: '', category: CATEGORIES[0], amount: '' })
    }
  }

  return (
    <form className="add-form card" onSubmit={handleSubmit}>
      <div className="form-toggle">
        <button type="button" className={`toggle-btn${!isIncome ? ' toggle-active toggle-expense' : ''}`} onClick={() => setMode('expense')}>
          Expense
        </button>
        <button type="button" className={`toggle-btn${isIncome ? ' toggle-active toggle-income' : ''}`} onClick={() => setMode('income')}>
          Income
        </button>
      </div>
      <div className="form-grid">
        <label>
          Date
          <input
            type="date"
            value={isIncome ? incomeForm.date : expenseForm.date}
            onChange={e => isIncome
              ? setIncomeForm(f => ({ ...f, date: e.target.value }))
              : setExpenseForm(f => ({ ...f, date: e.target.value }))}
            required
          />
        </label>
        <label>
          {isIncome ? 'Source' : 'Category'}
          {isIncome ? (
            <select value={incomeForm.source} onChange={e => setIncomeForm(f => ({ ...f, source: e.target.value }))}>
              {INCOME_SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          ) : (
            <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
        </label>
        <label>
          Description
          <input
            type="text"
            placeholder={isIncome ? 'e.g. Monthly salary' : 'e.g. Groceries'}
            value={isIncome ? incomeForm.description : expenseForm.description}
            onChange={e => isIncome
              ? setIncomeForm(f => ({ ...f, description: e.target.value }))
              : setExpenseForm(f => ({ ...f, description: e.target.value }))}
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
            value={isIncome ? incomeForm.amount : expenseForm.amount}
            onChange={e => isIncome
              ? setIncomeForm(f => ({ ...f, amount: e.target.value }))
              : setExpenseForm(f => ({ ...f, amount: e.target.value }))}
            required
          />
        </label>
        <button type="submit" className={`add-btn${isIncome ? ' add-income-btn' : ''}`}>
          {isIncome ? 'Add Income' : 'Add Expense'}
        </button>
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
}

function ExpenseList({ expenses, onDelete, onEdit }: ExpenseListProps) {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ date: '', description: '', category: '', amount: '' })

  function startEdit(e: Expense) {
    setEditingId(e.id)
    setEditDraft({ date: e.date, description: e.description, category: e.category, amount: e.amount })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft({ date: '', description: '', category: '', amount: '' })
  }

  function saveEdit(id: string) {
    const amount = parseFloat(String(editDraft.amount))
    if (!editDraft.date || !editDraft.description || isNaN(amount) || amount <= 0) return
    onEdit(id, { date: editDraft.date, description: editDraft.description, category: editDraft.category, amount })
    setEditingId(null)
    setEditDraft({ date: '', description: '', category: '', amount: '' })
  }

  const filtered = [...expenses]
    .filter(e => filterCategory === 'All' || e.category === filterCategory)
    .filter(e => e.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="expense-list card">
      <h2>Expenses</h2>
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
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          {expenses.length === 0 ? (
            <>
              <div className="empty-state-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <path d="M7 4h14v20l-3.5-2L14 24l-3.5-2L7 24V4z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                  <path d="M10.5 11h7M10.5 15h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="empty-state-title">No expenses yet</p>
              <p className="empty-state-sub">Add your first expense using the form above</p>
            </>
          ) : (
            <>
              <div className="empty-state-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75"/>
                  <path d="M18.5 18.5L24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                  <path d="M9 12h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="empty-state-title">No matching expenses</p>
              <p className="empty-state-sub">Try adjusting your search or filter</p>
            </>
          )}
        </div>
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
            {filtered.map(e => editingId === e.id ? (
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
                <td>
                  <div className="row-actions">
                    <button className="save-btn" onClick={() => saveEdit(e.id)}>&#10003;</button>
                    <button className="cancel-btn" onClick={cancelEdit}>&#10005;</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={e.id}>
                <td>{new Date(e.date + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}</td>
                <td>{e.description}</td>
                <td><span className="badge" style={{
                  color: CATEGORY_COLORS[e.category] ?? '#94a3b8',
                  background: `${CATEGORY_COLORS[e.category] ?? '#94a3b8'}18`,
                  borderColor: `${CATEGORY_COLORS[e.category] ?? '#94a3b8'}44`,
                }}>{e.category}</span></td>
                <td className="amount-cell">{e.amount.toFixed(2)} kr</td>
                <td>
                  <div className="row-actions">
                    <button className="edit-btn" onClick={() => startEdit(e)}>&#9998;</button>
                    <button className="delete-btn" onClick={() => onDelete(e.id)}>&#215;</button>
                  </div>
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<IncomeEditDraft>({ date: '', description: '', source: '', amount: '' })

  function startEdit(inc: Income) {
    setEditingId(inc.id)
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

  const filtered = [...incomes]
    .filter(inc => filterSource === 'All' || inc.source === filterSource)
    .filter(inc => inc.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="expense-list income-list card">
      <h2>Income</h2>
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
        <div className="empty-state">
          {incomes.length === 0 ? (
            <>
              <div className="empty-state-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <rect x="3" y="8" width="22" height="14" rx="3" stroke="currentColor" strokeWidth="1.75"/>
                  <path d="M3 13h22" stroke="currentColor" strokeWidth="1.75"/>
                  <circle cx="21" cy="18" r="1.5" fill="currentColor"/>
                </svg>
              </div>
              <p className="empty-state-title">No income yet</p>
              <p className="empty-state-sub">Add your first income entry using the form above</p>
            </>
          ) : (
            <>
              <div className="empty-state-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75"/>
                  <path d="M18.5 18.5L24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                  <path d="M9 12h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="empty-state-title">No matching income</p>
              <p className="empty-state-sub">Try adjusting your search or filter</p>
            </>
          )}
        </div>
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
            {filtered.map(inc => editingId === inc.id ? (
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
              <tr key={inc.id}>
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
                    <button className="edit-btn" onClick={() => startEdit(inc)}>&#9998;</button>
                    <button className="delete-btn" onClick={() => onDelete(inc.id)}>&#215;</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

interface InsightsCardProps {
  summary: ExpenseSummary
}

function InsightsCard({ summary }: InsightsCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<string>('')
  const [error, setError] = useState<string>('')

  async function analyze() {
    setStatus('loading')
    setError('')
    try {
      const text = await getInsights(summary)
      setResult(text)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  const hasData = summary.currentMonth.count > 0 ||
    summary.lastSixMonths.some(m => m.total > 0)

  return (
    <div className="insights-card card">
      <div className="insights-header">
        <h2>AI Insights</h2>
        {hasData && status !== 'loading' && (
          <button className="insights-btn" onClick={analyze}>
            {status === 'done' ? 'Refresh' : 'Analyze my spending'}
          </button>
        )}
      </div>
      {status === 'idle' && (
        <p className="insights-hint">
          {hasData
            ? 'Get personalized suggestions based on your spending patterns.'
            : 'Add some expenses to get AI-powered insights.'}
        </p>
      )}
      {status === 'loading' && (
        <div className="insights-loading">
          <span className="insights-spinner" />
          Analyzing your spending…
        </div>
      )}
      {status === 'done' && (
        <div className="insights-result">
          {result.split('\n').filter(l => l.trim()).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      {status === 'error' && (
        <p className="insights-error">{error}</p>
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

function MobileTabBar({ active, onChange }: { active: MobileTab; onChange: (t: MobileTab) => void }) {
  return (
    <nav className="tab-bar">
      <button className={`tab-btn${active === 'overview' ? ' tab-active' : ''}`} onClick={() => onChange('overview')}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="1" y="10" width="4" height="7" rx="1" fill="currentColor"/>
          <rect x="7" y="6" width="4" height="11" rx="1" fill="currentColor"/>
          <rect x="13" y="2" width="4" height="15" rx="1" fill="currentColor"/>
        </svg>
        Overview
      </button>
      <button className={`tab-btn${active === 'expenses' ? ' tab-active' : ''}`} onClick={() => onChange('expenses')}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M4 2h10v14l-2.5-1.5L9 16l-2.5-1.5L4 16V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M6.5 7h5M6.5 10h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Expenses
      </button>
      <button className={`tab-btn${active === 'income' ? ' tab-active' : ''}`} onClick={() => onChange('income')}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="6" width="14" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M2 10h14" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="13.5" cy="12.5" r="1" fill="currentColor"/>
        </svg>
        Income
      </button>
      <button className={`tab-btn${active === 'budgets' ? ' tab-active' : ''}`} onClick={() => onChange('budgets')}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="9" cy="9" r="1" fill="currentColor"/>
        </svg>
        Budgets
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
  const [budgets, setBudgets] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('budgets_v1') ?? '{}') } catch { return {} }
  })
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
    localStorage.setItem('budgets_v1', JSON.stringify(budgets))
  }, [budgets])

  function setBudgetForCategory(category: string, amount: number) {
    setBudgets(prev => ({ ...prev, [category]: amount }))
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (guestMode || !session) { setExpenses([]); setIncomes([]); return }
      const [expensesRes, incomesRes] = await Promise.all([
        supabase.from('expenses').select('*'),
        supabase.from('incomes').select('*'),
      ])
      if (!cancelled) {
        if (!expensesRes.error) setExpenses(expensesRes.data ?? [])
        if (!incomesRes.error) setIncomes(incomesRes.data ?? [])
      }
    })()
    return () => { cancelled = true }
  }, [session, guestMode])

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

  const defaultDate = new Date(currentMonth.year, currentMonth.month, new Date().getDate())
    .toISOString().split('T')[0]

  const insightsSummary = useMemo<ExpenseSummary>(() => {
    const now = new Date()
    const currentLabel = new Date(now.getFullYear(), now.getMonth())
      .toLocaleString('default', { month: 'long', year: 'numeric' })
    const currentMonthExpenses = expenses.filter(e => {
      const d = new Date(e.date + 'T00:00:00')
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    const byCategory = currentMonthExpenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount
      return acc
    }, {})
    return {
      currentMonth: {
        label: currentLabel,
        total: currentMonthExpenses.reduce((s, e) => s + e.amount, 0),
        byCategory,
        count: currentMonthExpenses.length,
      },
      lastSixMonths: chartData.map(m => ({ label: m.label, total: m.expenses })),
    }
  }, [expenses, chartData])

  if (authLoading) return null
  if (!session && !guestMode) return <Auth onContinueAsGuest={() => setGuestMode(true)} />

  return (
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
          <span className="app-name">Expense Tracker</span>
        </div>
        {!guestMode && (
          <button className="signout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        )}
      </div>
      <MonthNav currentMonth={currentMonth} onPrev={prevMonth} onNext={nextMonth} />
      <div className={`content-overview${activeTab !== 'overview' ? ' mobile-hidden' : ''}`}>
        <div className="charts-row">
          <SpendingChart data={chartData} />
          <CategoryPieChart expenses={monthExpenses} />
        </div>
        <InsightsCard summary={insightsSummary} />
      </div>
      <div className="layout">
        <aside className={activeTab !== 'overview' ? 'mobile-hidden' : ''}>
          <Summary
            expenses={monthExpenses}
            incomes={monthIncomes}
            budgets={budgets}
            onSetBudget={setBudgetForCategory}
          />
        </aside>
        <main>
          <div className={activeTab !== 'expenses' && activeTab !== 'income' ? 'mobile-hidden' : ''}>
            <AddEntryForm
              onAddExpense={handleAddExpense}
              onAddIncome={handleAddIncome}
              defaultDate={defaultDate}
              activeTab={activeTab}
            />
          </div>
          <div className={`tab-section${activeTab !== 'expenses' ? ' mobile-hidden' : ''}`}>
            <ExpenseList expenses={monthExpenses} onDelete={handleDeleteExpense} onEdit={handleEditExpense} />
          </div>
          <div className={`tab-section${activeTab !== 'income' ? ' mobile-hidden' : ''}`}>
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
      <MobileTabBar active={activeTab} onChange={setActiveTab} />
    </div>
  )
}
